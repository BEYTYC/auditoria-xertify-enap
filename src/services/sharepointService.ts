/**
 * sharepointService.ts
 * Anexa las filas del lote a `Tabla3` de la Base de Datos alojada en SharePoint.
 *
 * Tres adaptadores intercambiables:
 *   A. Microsoft Graph  — POST /workbook/tables/{id}/rows/add  (recomendado)
 *   B. Power Automate   — POST de un payload JSON a un flujo HTTP
 *   C. Mock local       — persiste en el navegador y permite exportar el log
 *
 * El adaptador se elige por configuración; si el elegido no está listo, la app
 * cae al mock y lo reporta como `fallback` en lugar de perder el registro.
 */

import {
  effectiveMode,
  isGraphReady,
  isWebhookReady,
} from '../config/appConfig';
import {
  type DatabaseRow,
  type EmailContext,
  type LedgerPosition,
  type SharePointConfig,
  type SharePointMode,
} from '../types';
import { effectiveColumns, toGraphMatrix } from './databaseService';
import { keysFromDatabaseRows, studentKey } from './duplicateService';

/** Cuántas filas finales de la tabla se leen para detectar lotes repetidos. */
const RECENT_ROWS = 600;

/* ------------------------------------------------------------------ */
/* Contrato común                                                       */
/* ------------------------------------------------------------------ */

export interface TableInfo {
  /** Nombres de columna que la tabla destino realmente tiene. */
  columns: string[];
  /** Última posición del libro, si se pudo leer. */
  lastPosition: LedgerPosition | null;
  /** Último consecutivo `N`, si se pudo leer. */
  lastConsecutivo: number | null;
  /**
   * Claves `curso∷documento` de las últimas filas de la tabla. Sirven para
   * avisar que un lote ya se registró, aunque lo haya hecho otra persona en
   * otro equipo. Vacío cuando el destino no permite leerlas.
   */
  recentKeys: string[];
  /** URL del archivo, cuando la API la entrega. */
  workbookUrl?: string;
}

export interface AppendOutcome {
  rowsSent: number;
  workbookUrl?: string;
  message: string;
}

export interface NotifyOutcome {
  sent: boolean;
  message: string;
}

export interface SharePointAdapter {
  readonly mode: SharePointMode;
  /** Comprueba credenciales y lee la estructura de la tabla. */
  inspect(): Promise<TableInfo>;
  /** Anexa las filas al final de la tabla. */
  append(rows: DatabaseRow[]): Promise<AppendOutcome>;
  /**
   * Quita del libro las filas cuyo consecutivo `N` se indique. Es la única
   * forma de deshacer un registro equivocado, y solo la Oficina de Estadística
   * puede pedirla.
   */
  deleteByConsecutive(consecutivos: number[]): Promise<number>;
  /**
   * Avisa del registro ya hecho al responsable. Nunca lanza: un correo que no
   * salió no debe hacer parecer que el registro en la Base de Datos falló.
   */
  notify(context: EmailContext): Promise<NotifyOutcome>;
}

export class SharePointError extends Error {
  readonly detail?: string;
  readonly status?: number;

  constructor(message: string, detail?: string, status?: number) {
    super(message);
    this.name = 'SharePointError';
    this.detail = detail;
    this.status = status;
  }
}

/* ------------------------------------------------------------------ */
/* Utilidades de red                                                    */
/* ------------------------------------------------------------------ */

/** Reintenta ante 429/503 respetando `Retry-After`. */
async function fetchWithRetry(
  input: string,
  init: RequestInit,
  attempts = 4,
): Promise<Response> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(input, init);
      if (response.status !== 429 && response.status !== 503) return response;

      const retryAfter = Number(response.headers.get('Retry-After') ?? '0');
      const waitMs = retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 800;
      if (attempt === attempts - 1) return response;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1) break;
      await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 800));
    }
  }

  throw new SharePointError(
    'No se pudo contactar el servicio. Revise la conexión de red.',
    lastError instanceof Error ? lastError.message : String(lastError),
  );
}

/**
 * Lee el mensaje de error de la respuesta fallida. Reconoce dos formas:
 *
 * - La nativa de Microsoft Graph: `{ error: { code, message } }`.
 * - La de `api/registrar.js` (el reemplazo gratuito de Power Automate):
 *   `{ error: "texto", detail: "texto" }`, con `error` como cadena, no como
 *   objeto. Sin esta segunda forma, `body.error.code`/`body.error.message`
 *   salían `undefined` sobre una cadena y el detalle que de verdad explica
 *   la falla —el texto de `detail`, que trae el error real de Graph— se
 *   perdía, dejando solo un inútil «502:» en pantalla.
 */
async function describeHttpError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      error?: { code?: string; message?: string } | string;
      detail?: string;
    };

    if (body?.error && typeof body.error === 'object') {
      return `${body.error.code ?? response.status}: ${body.error.message ?? ''}`;
    }
    if (typeof body?.error === 'string' && body.error) {
      return [body.error, body.detail].filter(Boolean).join(' — ');
    }
  } catch {
    // El cuerpo no era JSON.
  }
  return `HTTP ${response.status} ${response.statusText}`;
}

/* ------------------------------------------------------------------ */
/* A. Microsoft Graph                                                   */
/* ------------------------------------------------------------------ */

const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0';
const GRAPH_SCOPES = ['Files.ReadWrite.All', 'Sites.ReadWrite.All', 'Mail.Send'];
/** Tamaño de lote de inserción: Graph tolera mal payloads muy grandes. */
const INSERT_CHUNK = 100;

type MsalModule = typeof import('@azure/msal-browser');

let msalInstance: import('@azure/msal-browser').PublicClientApplication | null = null;

/** Crea (una sola vez) la instancia de MSAL y la inicializa. */
async function getMsal(config: SharePointConfig) {
  if (msalInstance) return msalInstance;

  const graph = config.graph!;
  const msal: MsalModule = await import('@azure/msal-browser');

  msalInstance = new msal.PublicClientApplication({
    auth: {
      clientId: graph.clientId,
      authority: `https://login.microsoftonline.com/${graph.tenantId}`,
      redirectUri: graph.redirectUri || `${window.location.origin}/redirect.html`,
    },
    cache: { cacheLocation: 'sessionStorage' },
  });

  await msalInstance.initialize();
  await msalInstance.handleRedirectPromise();
  return msalInstance;
}

/** Token de acceso: silencioso si hay sesión, con ventana emergente si no. */
async function acquireToken(config: SharePointConfig): Promise<string> {
  const instance = await getMsal(config);
  const accounts = instance.getAllAccounts();

  if (accounts.length) {
    try {
      const silent = await instance.acquireTokenSilent({
        scopes: GRAPH_SCOPES,
        account: accounts[0],
      });
      return silent.accessToken;
    } catch {
      // Cae a la ventana emergente.
    }
  }

  const popup = await instance.acquireTokenPopup({ scopes: GRAPH_SCOPES });
  return popup.accessToken;
}

/** Cuerpo HTML del correo de confirmación del registro. */
function receiptEmailHtml(context: EmailContext): string {
  const escapado = (texto: string) =>
    texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return `
    <div style="font-family: Arial, Helvetica, sans-serif; color: #0f2540; font-size: 14px; line-height: 1.5;">
      <p>Estimado(a) <strong>${escapado(context.responsable)}</strong>,</p>
      <p>
        Se registró oficialmente el lote <strong>${escapado(context.idRegistro)}</strong>
        correspondiente al curso <strong>${escapado(context.curso)}</strong> en la Base de
        Datos de Cursos de Extensión de la Oficina de Estadística.
      </p>
      <p>Este correo es una confirmación automática; no requiere respuesta.</p>
      <p style="margin-top: 24px; color: #56708f; font-size: 12px;">
        Oficina de Estadística — Escuela Naval de Cadetes "Almirante Padilla"
      </p>
    </div>
  `.trim();
}

export class GraphAdapter implements SharePointAdapter {
  readonly mode: SharePointMode = 'graph';
  private readonly config: SharePointConfig;

  constructor(config: SharePointConfig) {
    this.config = config;
  }

  /** Base resuelta del libro; se calcula una vez por sesión. */
  private baseResuelta: string | null = null;

  /**
   * Dirección del libro en Graph.
   *
   * Con `driveId` e `itemId` es directa. Si no están —el caso normal, porque
   * averiguarlos exige Graph Explorer y no todos los inquilinos lo permiten—,
   * se resuelve por la ruta del archivo dentro del OneDrive de su dueño, que es
   * un dato que la Oficina sí tiene a la mano.
   */
  private async resolveBase(): Promise<string> {
    if (this.baseResuelta) return this.baseResuelta;

    const { driveId, itemId, ownerUpn, filePath } = this.config.graph!;
    if (driveId && itemId) {
      this.baseResuelta = `${GRAPH_ROOT}/drives/${driveId}/items/${itemId}/workbook`;
      return this.baseResuelta;
    }

    if (!ownerUpn || !filePath) {
      throw new SharePointError(
        'Falta indicar el archivo: o los identificadores de drive y elemento, o la cuenta ' +
          'dueña y la ruta dentro de su OneDrive.',
      );
    }

    const ruta = filePath
      .replace(/^\/+/, '')
      .split('/')
      .map((tramo) => encodeURIComponent(tramo))
      .join('/');

    const response = await fetchWithRetry(
      `${GRAPH_ROOT}/users/${encodeURIComponent(ownerUpn)}/drive/root:/${ruta}?$select=id,parentReference,webUrl`,
      { method: 'GET', headers: await this.headers() },
    );

    if (!response.ok) {
      throw new SharePointError(
        `No se encontró «${filePath}» en el OneDrive de ${ownerUpn}. Revise la ruta y que su ` +
          'cuenta tenga permiso sobre ese archivo.',
        await describeHttpError(response),
        response.status,
      );
    }

    const item = (await response.json()) as {
      id: string;
      parentReference?: { driveId?: string };
    };
    const drive = item.parentReference?.driveId;
    if (!drive || !item.id) {
      throw new SharePointError('Graph no devolvió los identificadores del archivo.');
    }

    this.baseResuelta = `${GRAPH_ROOT}/drives/${drive}/items/${item.id}/workbook`;
    return this.baseResuelta;
  }

  private async headers(): Promise<HeadersInit> {
    const token = await acquireToken(this.config);
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Cuando Graph rechaza `rows/add` por dimensiones, compara cuántas columnas
   * mandó la app contra las que la tabla real tiene en ese momento, para que
   * el error diga la causa exacta en vez de dejarlo a adivinar.
   */
  private async describeColumnMismatch(
    enviadas: number,
    headers: HeadersInit,
    base: string,
  ): Promise<string | null> {
    if (!enviadas) return null;
    try {
      const graph = this.config.graph!;
      const response = await fetchWithRetry(
        `${base}/tables/${encodeURIComponent(graph.tableId)}/columns?$select=name`,
        { method: 'GET', headers },
      );
      if (!response.ok) return null;
      const body = (await response.json()) as { value: { name: string }[] };
      const reales = body.value.length;
      if (reales === enviadas) return null;
      return (
        `La app envió ${enviadas} columna(s) y la tabla real tiene ${reales}: ` +
        `${body.value.map((c) => c.name).join(', ')}.`
      );
    } catch {
      return null;
    }
  }

  async inspect(): Promise<TableInfo> {
    const graph = this.config.graph!;
    const headers = await this.headers();
    const base = await this.resolveBase();

    // 1. Columnas de la tabla.
    const columnsResponse = await fetchWithRetry(
      `${base}/tables/${encodeURIComponent(graph.tableId)}/columns?$select=name`,
      { method: 'GET', headers },
    );
    if (!columnsResponse.ok) {
      throw new SharePointError(
        `No se pudo leer la tabla «${graph.tableId}». Verifique el ID del archivo y de la tabla.`,
        await describeHttpError(columnsResponse),
        columnsResponse.status,
      );
    }
    const columnsBody = (await columnsResponse.json()) as { value: { name: string }[] };
    const columns = columnsBody.value.map((column) => column.name);

    // 2. Última posición del libro: se leen las últimas filas de la tabla.
    let lastPosition: LedgerPosition | null = null;
    let lastConsecutivo: number | null = null;
    let recentKeys: string[] = [];

    try {
      const rangeResponse = await fetchWithRetry(
        `${base}/tables/${encodeURIComponent(graph.tableId)}/dataBodyRange?$select=rowCount,address`,
        { method: 'GET', headers },
      );

      if (rangeResponse.ok) {
        const range = (await rangeResponse.json()) as { rowCount: number; address: string };
        const sheet = graph.worksheetName ?? 'Libro No. 2';
        // `address` viene como `Libro No. 2!A2:R11336`; se toma la última fila.
        const lastRow = Number(range.address.match(/(\d+)$/)?.[1] ?? 0);
        if (lastRow > 1) {
          const cellsResponse = await fetchWithRetry(
            `${base}/worksheets('${encodeURIComponent(sheet)}')` +
              `/range(address='A${lastRow}:D${lastRow}')?$select=values`,
            { method: 'GET', headers },
          );
          if (cellsResponse.ok) {
            const cells = (await cellsResponse.json()) as { values: (string | number)[][] };
            const [n, libro, folio, registro] = (cells.values?.[0] ?? []).map(Number);
            if ([n, libro, folio, registro].every(Number.isFinite)) {
              lastConsecutivo = n;
              lastPosition = { libro, folio, registro };
            }
          }

          // Documento (H) y curso (J) de las últimas filas: con eso se detecta
          // un lote que ya se asentó, sin leer las once mil filas.
          const desde = Math.max(2, lastRow - RECENT_ROWS + 1);
          const recentResponse = await fetchWithRetry(
            `${base}/worksheets('${encodeURIComponent(sheet)}')` +
              `/range(address='H${desde}:J${lastRow}')?$select=values`,
            { method: 'GET', headers },
          );
          if (recentResponse.ok) {
            const body = (await recentResponse.json()) as { values: (string | number)[][] };
            recentKeys = (body.values ?? [])
              .map((fila) => studentKey(String(fila?.[2] ?? ''), String(fila?.[0] ?? '')))
              .filter((key) => !key.endsWith('∷'));
          }
        }
      }
    } catch {
      // La numeración se resuelve con el valor configurado manualmente.
    }

    return { columns, lastPosition, lastConsecutivo, recentKeys };
  }

  /**
   * Borra del libro las filas con esos consecutivos.
   *
   * Se leen los últimos `N` de la columna A para saber en qué posición está
   * cada uno, y se borran de atrás hacia adelante: si se borrara de adelante
   * hacia atrás, cada borrado correría las posiciones de los siguientes.
   */
  async deleteByConsecutive(consecutivos: number[]): Promise<number> {
    if (!consecutivos.length) return 0;
    const graph = this.config.graph!;
    const headers = await this.headers();
    const base = await this.resolveBase();
    const tabla = `${base}/tables/${encodeURIComponent(graph.tableId)}`;

    const rangeResponse = await fetchWithRetry(`${tabla}/dataBodyRange?$select=rowCount,address`, {
      method: 'GET',
      headers,
    });
    if (!rangeResponse.ok) {
      throw new SharePointError(
        'No se pudo leer la tabla para anular el registro.',
        await describeHttpError(rangeResponse),
        rangeResponse.status,
      );
    }

    const range = (await rangeResponse.json()) as { rowCount: number; address: string };
    const hoja = graph.worksheetName ?? 'Libro No. 2';
    const ultima = Number(range.address.match(/(\d+)$/)?.[1] ?? 0);
    const primera = Math.max(2, ultima - Math.max(RECENT_ROWS, consecutivos.length * 4) + 1);

    const valuesResponse = await fetchWithRetry(
      `${base}/worksheets('${encodeURIComponent(hoja)}')` +
        `/range(address='A${primera}:A${ultima}')?$select=values`,
      { method: 'GET', headers },
    );
    if (!valuesResponse.ok) {
      throw new SharePointError(
        'No se pudieron leer los consecutivos del libro.',
        await describeHttpError(valuesResponse),
        valuesResponse.status,
      );
    }

    const values = ((await valuesResponse.json()) as { values: (string | number)[][] }).values ?? [];
    const buscados = new Set(consecutivos.map(Number));

    // Índice dentro del cuerpo de la tabla: la primera fila de datos es 0.
    const primeraFilaDatos = ultima - range.rowCount + 1;
    const indices: number[] = [];
    values.forEach((fila, i) => {
      if (buscados.has(Number(fila?.[0]))) indices.push(primera + i - primeraFilaDatos);
    });

    let borradas = 0;
    for (const indice of indices.sort((a, b) => b - a)) {
      const response = await fetchWithRetry(`${tabla}/rows/$/ItemAt(index=${indice})`, {
        method: 'DELETE',
        headers,
      });
      if (!response.ok) {
        throw new SharePointError(
          `Se anularon ${borradas} filas y la siguiente falló; revise el libro antes de reintentar.`,
          await describeHttpError(response),
          response.status,
        );
      }
      borradas += 1;
    }

    return borradas;
  }

  async append(rows: DatabaseRow[]): Promise<AppendOutcome> {
    const graph = this.config.graph!;
    const headers = await this.headers();
    const base = await this.resolveBase();
    const matrix = toGraphMatrix(rows);

    let sent = 0;
    for (let start = 0; start < matrix.length; start += INSERT_CHUNK) {
      const chunk = matrix.slice(start, start + INSERT_CHUNK);

      const response = await fetchWithRetry(
        `${base}/tables/${encodeURIComponent(graph.tableId)}/rows/add`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ index: null, values: chunk }),
        },
      );

      if (!response.ok) {
        const detalle = await describeHttpError(response);
        // El error de Graph no dice cuántas columnas espera: se averigua aparte
        // para no dejar a ciegas cuando el desajuste es de número de columnas.
        const desajuste = await this.describeColumnMismatch(chunk[0]?.length ?? 0, headers, base);
        throw new SharePointError(
          sent === 0
            ? 'SharePoint rechazó la inserción; no se escribió ninguna fila.'
            : `Se insertaron ${sent} filas y la operación falló en la siguiente tanda. ` +
              'Revise la Base de Datos antes de reintentar para no duplicar registros.',
          desajuste ? `${detalle} — ${desajuste}` : detalle,
          response.status,
        );
      }

      sent += chunk.length;
    }

    return {
      rowsSent: sent,
      message: `${sent} filas anexadas a la tabla ${graph.tableId} en SharePoint.`,
    };
  }

  /**
   * Envía el correo de confirmación con la cuenta que inició sesión para
   * registrar (permiso `Mail.Send`). Nunca lanza: si el correo falla, el
   * registro en la Base de Datos ya quedó hecho y no debe verse como un
   * error del registro.
   *
   * Si `graph.mailFrom` está configurado (p. ej. `certificaciones@enap.edu.co`),
   * el correo se pide enviar desde esa cuenta en vez de la que inició sesión.
   * Microsoft solo lo permite si esa cuenta le dio permiso «Enviar como»
   * sobre ese buzón en Exchange; si no lo tiene, rechaza el envío y hay que
   * pedirle a la Dirección de TIC que conceda ese permiso.
   */
  async notify(context: EmailContext): Promise<NotifyOutcome> {
    if (!context.correoResponsable) {
      return { sent: false, message: 'No se indicó un correo de destino.' };
    }
    const mailFrom = this.config.graph?.mailFrom?.trim();
    try {
      const headers = await this.headers();
      const response = await fetchWithRetry(`${GRAPH_ROOT}/me/sendMail`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: {
            subject: `Registro Oficial ${context.idRegistro} — ${context.curso}`,
            body: { contentType: 'HTML', content: receiptEmailHtml(context) },
            toRecipients: [{ emailAddress: { address: context.correoResponsable } }],
            ...(mailFrom ? { from: { emailAddress: { address: mailFrom } } } : {}),
          },
          saveToSentItems: true,
        }),
      });

      if (!response.ok) {
        const detalleHttp = await describeHttpError(response);
        const pistaPermiso =
          mailFrom && response.status === 403
            ? ` La cuenta con la que inició sesión necesita permiso «Enviar como» sobre ${mailFrom} en Exchange; pídaselo a la Dirección de TIC.`
            : '';
        throw new SharePointError(
          `Microsoft rechazó el envío del correo.${pistaPermiso}`,
          detalleHttp,
          response.status,
        );
      }

      return {
        sent: true,
        message: mailFrom
          ? `Correo de confirmación enviado a ${context.correoResponsable} desde ${mailFrom}.`
          : `Correo de confirmación enviado a ${context.correoResponsable}.`,
      };
    } catch (error) {
      const detalle =
        error instanceof SharePointError
          ? [error.message, error.detail].filter(Boolean).join(' — ')
          : error instanceof Error
            ? error.message
            : String(error);
      return {
        sent: false,
        message: `No se pudo enviar el correo de confirmación: ${detalle}`,
      };
    }
  }
}

/* ------------------------------------------------------------------ */
/* B. Power Automate / Webhook                                          */
/* ------------------------------------------------------------------ */

export class WebhookAdapter implements SharePointAdapter {
  readonly mode: SharePointMode = 'webhook';
  private readonly config: SharePointConfig;

  constructor(config: SharePointConfig) {
    this.config = config;
  }

  async inspect(): Promise<TableInfo> {
    // El flujo no expone la estructura: se asume la tabla estándar.
    return {
      columns: effectiveColumns(),
      lastPosition: null,
      lastConsecutivo: null,
      recentKeys: [],
    };
  }

  async deleteByConsecutive(): Promise<number> {
    throw new SharePointError(
      'Power Automate solo agrega filas: para anular un registro hay que hacerlo en el archivo, ' +
        'o configurar Microsoft Graph.',
    );
  }

  async append(rows: DatabaseRow[]): Promise<AppendOutcome> {
    const webhook = this.config.webhook!;
    const columns = effectiveColumns();

    const response = await fetchWithRetry(webhook.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(webhook.headers ?? {}) },
      body: JSON.stringify({
        tabla: 'Tabla3',
        hoja: 'Libro No. 2',
        columnas: columns,
        filas: rows,
        valores: toGraphMatrix(rows),
      }),
    });

    if (!response.ok) {
      throw new SharePointError(
        'El flujo de Power Automate rechazó el envío.',
        await describeHttpError(response),
        response.status,
      );
    }

    return {
      rowsSent: rows.length,
      message: `${rows.length} filas enviadas al flujo de Power Automate.`,
    };
  }

  /**
   * Le avisa al mismo flujo, con una llamada aparte y `accion: "notificar"`,
   * para que sea el flujo el que envíe el correo (con un paso de «Enviar un
   * correo electrónico (V2)» que use `correoResponsable`, `responsable`,
   * `curso` e `idRegistro` del cuerpo recibido). Así nadie tiene que iniciar
   * sesión en nada: el flujo ya corre con la cuenta de servicio configurada
   * una sola vez al crearlo.
   */
  async notify(context: EmailContext): Promise<NotifyOutcome> {
    const webhook = this.config.webhook!;
    try {
      const response = await fetchWithRetry(webhook.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(webhook.headers ?? {}) },
        body: JSON.stringify({ accion: 'notificar', ...context }),
      });

      if (!response.ok) {
        throw new SharePointError(
          'El flujo de Power Automate rechazó el aviso de correo.',
          await describeHttpError(response),
          response.status,
        );
      }

      return {
        sent: true,
        message: `Correo de confirmación enviado a ${context.correoResponsable}.`,
      };
    } catch (error) {
      const detalle =
        error instanceof SharePointError
          ? [error.message, error.detail].filter(Boolean).join(' — ')
          : error instanceof Error
            ? error.message
            : String(error);
      return { sent: false, message: `No se pudo avisar al flujo para el correo: ${detalle}` };
    }
  }
}

/* ------------------------------------------------------------------ */
/* C. Mock local                                                        */
/* ------------------------------------------------------------------ */

const MOCK_KEY = 'auditor-certificados.mock-tabla3.v1';

/** Filas acumuladas en el modo mock, para poder exportarlas. */
export function readMockRows(): DatabaseRow[] {
  try {
    const stored = window.localStorage.getItem(MOCK_KEY);
    return stored ? (JSON.parse(stored) as DatabaseRow[]) : [];
  } catch {
    return [];
  }
}

export function clearMockRows(): void {
  try {
    window.localStorage.removeItem(MOCK_KEY);
  } catch {
    // Sin almacenamiento disponible.
  }
}

export class MockAdapter implements SharePointAdapter {
  readonly mode: SharePointMode = 'mock';

  async inspect(): Promise<TableInfo> {
    const stored = readMockRows();
    const last = stored[stored.length - 1];

    return {
      columns: effectiveColumns(),
      lastPosition: last
        ? { libro: Number(last.LIBRO), folio: Number(last.FOLIO), registro: Number(last.REG) }
        : null,
      lastConsecutivo: last ? Number(last.N) : null,
      recentKeys: keysFromDatabaseRows(stored),
    };
  }

  async deleteByConsecutive(consecutivos: number[]): Promise<number> {
    const buscados = new Set(consecutivos.map(Number));
    const stored = readMockRows();
    const quedan = stored.filter((row) => !buscados.has(Number(row.N)));
    try {
      window.localStorage.setItem(MOCK_KEY, JSON.stringify(quedan));
    } catch {
      throw new SharePointError('No se pudo actualizar el registro local.');
    }
    return stored.length - quedan.length;
  }

  async append(rows: DatabaseRow[]): Promise<AppendOutcome> {
    const stored = readMockRows();
    const next = [...stored, ...rows];
    try {
      window.localStorage.setItem(MOCK_KEY, JSON.stringify(next));
    } catch {
      throw new SharePointError(
        'No hay espacio en el almacenamiento local del navegador para guardar el lote.',
      );
    }

    // Latencia simulada, para que la animación de la interfaz sea realista.
    await new Promise((resolve) => setTimeout(resolve, 600));

    return {
      rowsSent: rows.length,
      message:
        `${rows.length} filas guardadas en el registro local. ` +
        'Configure Microsoft Graph o Power Automate para escribir en SharePoint.',
    };
  }

  async notify(): Promise<NotifyOutcome> {
    return {
      sent: false,
      message:
        'El registro local no envía correos reales. Configure Microsoft Graph o Power Automate ' +
        'para el envío automático del correo de confirmación.',
    };
  }
}

/* ------------------------------------------------------------------ */
/* Selector                                                             */
/* ------------------------------------------------------------------ */

/** Devuelve el adaptador correspondiente al modo efectivo. */
export function createAdapter(config: SharePointConfig): SharePointAdapter {
  switch (effectiveMode(config)) {
    case 'graph':
      return new GraphAdapter(config);
    case 'webhook':
      return new WebhookAdapter(config);
    default:
      return new MockAdapter();
  }
}

/** Explica por qué el modo elegido no está activo, si es el caso. */
export function describeModeFallback(config: SharePointConfig): string | null {
  if (config.mode === 'graph' && !isGraphReady(config)) {
    return 'Falta configurar el cliente, el tenant o los IDs del archivo de SharePoint. Se usará el registro local.';
  }
  if (config.mode === 'webhook' && !isWebhookReady(config)) {
    return 'Falta la URL del flujo de Power Automate. Se usará el registro local.';
  }
  return null;
}
