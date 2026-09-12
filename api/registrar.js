/**
 * api/registrar.js
 *
 * Reemplazo gratuito de Power Automate: recibe exactamente el mismo JSON que
 * el modo "webhook" de la app ya envía (ver src/services/sharepointService.ts,
 * clase WebhookAdapter) y hace ella misma, sin que nadie inicie sesión, lo
 * que iba a hacer el flujo:
 *   1. Escribir el lote en Tabla3 del Excel real (Excel Online / Microsoft
 *      Graph, con permisos de "aplicación" — no de una persona).
 *   2. Mandar el correo de confirmación al responsable.
 *
 * No cambia nada del front-end: en el panel de Administración de la app
 * (⚙ → modo "Power Automate") se pega la URL de este mismo endpoint, por
 * ejemplo:
 *   https://auditoria-xertify.vercel.app/api/registrar
 * en vez de la URL de Power Automate.
 *
 * Variables de entorno que necesita este archivo (se configuran en Vercel,
 * Project Settings → Environment Variables — NUNCA con prefijo VITE_, para
 * que no terminen expuestas en el navegador):
 *
 *   GRAPH_TENANT_ID       Id. de directorio (tenant) de Entra ID.
 *   GRAPH_CLIENT_ID       Id. de aplicación (cliente) del App Registration.
 *   GRAPH_CLIENT_SECRET   Secreto de cliente creado para ese registro
 *                         (Certificados y secretos → Nuevo secreto de cliente).
 *   GRAPH_UPN_DRIVE       Correo de la cuenta dueña del OneDrive donde vive
 *                         el Excel real, por ejemplo
 *                         jestadisticaplen@enap.edu.co. NO hace falta ir a
 *                         buscar ningún identificador largo: la función
 *                         resuelve sola el archivo a partir de esta cuenta y
 *                         la ruta de abajo, igual que hace el Portal de
 *                         Solicitud de Certificados.
 *   GRAPH_RUTA_ARCHIVO   Ruta del archivo .xlsx dentro de ese OneDrive, por
 *                         ejemplo "Estadística/Bases de Datos/BD Cursos de
 *                         Ley - Cursos de Extensión/Base de Datos Cursos de
 *                         Extensión.xlsx".
 *   GRAPH_TABLE_ID        Nombre de la tabla (por defecto "Tabla3").
 *   GRAPH_MAIL_FROM       Cuenta desde la que debe salir el correo, por
 *                         ejemplo jestadisticaplen@enap.edu.co.
 *   API_KEY               (opcional pero recomendado) clave compartida; la
 *                         app la manda como cabecera x-api-key cuando se
 *                         configura VITE_WEBHOOK_KEY en la app. Si se define
 *                         aquí, cualquier solicitud sin la clave correcta se
 *                         rechaza — así nadie más en internet puede escribir
 *                         en el Excel solo por conocer la URL.
 *
 * Ver GUIA-FUNCION-GRATIS-SIN-POWER-AUTOMATE.md para el paso a paso completo
 * de cómo obtener y cargar cada uno de estos valores.
 */

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

let cachedToken = null; // { value, expiresAt }

async function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const { GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET } = process.env;
  if (!GRAPH_TENANT_ID || !GRAPH_CLIENT_ID || !GRAPH_CLIENT_SECRET) {
    throw new Error(
      'Faltan GRAPH_TENANT_ID, GRAPH_CLIENT_ID o GRAPH_CLIENT_SECRET en las variables de entorno de Vercel.',
    );
  }

  const body = new URLSearchParams({
    client_id: GRAPH_CLIENT_ID,
    client_secret: GRAPH_CLIENT_SECRET,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });

  const resp = await fetch(`https://login.microsoftonline.com/${GRAPH_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!resp.ok) {
    throw new Error(`No se pudo autenticar con Microsoft Graph (${resp.status}): ${await resp.text()}`);
  }

  const data = await resp.json();
  cachedToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.value;
}

async function graphFetch(path, init = {}) {
  const token = await getAccessToken();
  return fetch(`${GRAPH_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// Igual que idArchivoRegistro_() en el Portal de Certificados: el archivo se
// resuelve una sola vez (cuenta dueña + ruta) y se recuerda en memoria — así
// configurar esto es poner un correo y una ruta, no ir a buscar
// identificadores en Graph Explorer. Se cachea a nivel de módulo porque una
// misma función de Vercel suele atender varias solicitudes seguidas sin
// reiniciarse ("instancia caliente"); si Vercel arranca una instancia nueva,
// simplemente se vuelve a resolver una vez más.
let cachedFileRef = null; // { driveId, itemId }

function rutaDrive() {
  const upn = process.env.GRAPH_UPN_DRIVE;
  if (!upn) {
    throw new Error('Falta GRAPH_UPN_DRIVE en las variables de entorno de Vercel.');
  }
  return `/users/${encodeURIComponent(upn)}/drive`;
}

async function resolverArchivo() {
  if (cachedFileRef) return cachedFileRef;

  const ruta = String(process.env.GRAPH_RUTA_ARCHIVO || '').replace(/^\/+/, '');
  if (!ruta) {
    throw new Error('Falta GRAPH_RUTA_ARCHIVO en las variables de entorno de Vercel.');
  }
  const segmentos = ruta.split('/').map(encodeURIComponent).join('/');

  const resp = await graphFetch(`${rutaDrive()}/root:/${segmentos}:?$select=id,parentReference`);
  if (!resp.ok) {
    const error = new Error(
      'No se encontró el archivo de Excel en OneDrive. Revise que GRAPH_UPN_DRIVE y '
      + 'GRAPH_RUTA_ARCHIVO estén escritos exactamente igual que en OneDrive, con sus tildes.',
    );
    error.status = 502;
    error.detail = await resp.text();
    throw error;
  }

  const data = await resp.json();
  cachedFileRef = {
    driveId: data.parentReference.driveId,
    itemId: data.id,
    // Carpeta donde vive el archivo: aquí se crea el archivo de turno (ver
    // adquirirBloqueo) para que dos registros casi simultáneos no calculen el
    // mismo folio/registro.
    parentId: data.parentReference.id,
  };
  return cachedFileRef;
}

/* -------------------------------------------------------------------- */
/* Numeración institucional del libro (LIBRO / FOLIO / REGISTRO / N)      */
/* -------------------------------------------------------------------- */
//
// Antes, cada navegador calculaba esta numeración por su cuenta a partir de
// lo último que él mismo había leído (o, si nunca lo había leído, de un
// valor de arranque fijo en el código). Cuando dos personas registraban
// —incluso sin coincidir en el segundo exacto: bastaba con que cada una
// abriera la app en su propio equipo sin haber registrado antes ahí—, las
// dos partían del mismo punto y el libro terminaba con el mismo folio/
// registro repetido para dos lotes distintos (el caso reportado: el 11477
// libro 3 folio 99 registro 55 salió dos veces, con personas distintas).
//
// La solución: quien de verdad sabe cuál es la última fila es el Excel
// mismo, así que ahora es este servidor —justo antes de escribir, y con un
// turno para que nadie más escriba al mismo tiempo— el que relee la última
// fila y asigna los números. El navegador sigue mandando su propio cálculo
// (para mostrar el comprobante mientras espera la respuesta), pero el que
// manda es el que se calcula aquí; se le devuelve al navegador para que
// corrija el comprobante, la bitácora y la plantilla adjunta si hacía falta.

const MAX_FOLIO = 99;
const MAX_REGISTRO = 99;

/** Posición de arranque si el libro está vacío o no se pudo leer. */
const POSICION_INICIAL = { libro: 3, folio: 99, registro: 54 };
const CONSECUTIVO_INICIAL = 11476;

function siguientePosicion(posicion) {
  if (posicion.registro < MAX_REGISTRO) {
    return { ...posicion, registro: posicion.registro + 1 };
  }
  if (posicion.folio < MAX_FOLIO) {
    return { libro: posicion.libro, folio: posicion.folio + 1, registro: 1 };
  }
  return { libro: posicion.libro + 1, folio: 1, registro: 1 };
}

/**
 * Tabla y hoja reales según el destino que ya calculó el front-end
 * (WebhookAdapter.append, en sharepointService.ts): "tabla2" es Tabla2 /
 * «Cursos de Ascenso» (lotes de Cursos de Ley, 21 columnas); cualquier otro
 * valor — incluido "tabla3" o si no viene el campo, por compatibilidad con
 * llamadas antiguas — es Tabla3 / «Libro No. 2» (20 columnas). Antes esta
 * función siempre usaba Tabla3/Libro No. 2 sin importar el destino, así que
 * un lote de Cursos de Ley terminaba con sus 21 columnas escritas contra
 * Tabla3 (que solo tiene 20) y Excel Online lo rechazaba con "El número de
 * filas o columnas de la matriz de entrada no coincide con el tamaño o las
 * dimensiones del rango."
 */
function tablaYHojaDe(payload) {
  if (payload.destino === 'tabla2') {
    return { tabla: 'Tabla2', hoja: 'Cursos de Ascenso' };
  }
  return {
    tabla: process.env.GRAPH_TABLE_ID || 'Tabla3',
    hoja: process.env.GRAPH_WORKSHEET || 'Libro No. 2',
  };
}

/** Relee la última fila real de la tabla: libro/folio/registro/consecutivo. */
async function leerUltimaPosicion(driveId, itemId, tabla, hoja) {
  const base = `/drives/${driveId}/items/${itemId}/workbook`;

  const rangeResp = await graphFetch(
    `${base}/tables/${encodeURIComponent(tabla)}/dataBodyRange?$select=rowCount,address`,
  );
  if (!rangeResp.ok) return null;

  const range = await rangeResp.json();
  const ultimaFila = Number(String(range.address || '').match(/(\d+)$/)?.[1] ?? 0);
  if (!(ultimaFila > 1)) return null;

  const cellsResp = await graphFetch(
    `${base}/worksheets('${encodeURIComponent(hoja)}')` +
      `/range(address='A${ultimaFila}:D${ultimaFila}')?$select=values`,
  );
  if (!cellsResp.ok) return null;

  const cells = await cellsResp.json();
  const [n, libro, folio, registro] = (cells.values?.[0] ?? []).map(Number);
  if (![n, libro, folio, registro].every(Number.isFinite)) return null;

  return { consecutivo: n, posicion: { libro, folio, registro } };
}

/* -------------------------------------------------------------------- */
/* Turno: evita que dos registros casi simultáneos se pisen                */
/* -------------------------------------------------------------------- */
//
// Microsoft Graph no ofrece un "bloqueo" de verdad para Excel, así que se usa
// un truco conocido: crear un archivo de 0 bytes con
// `@microsoft.graph.conflictBehavior: "fail"` es una operación atómica —si
// ya existe, Graph responde 409 en vez de crear un duplicado—. Mientras ese
// archivo exista, nadie más puede "tomar el turno"; al terminar de escribir,
// se borra para que el siguiente pueda entrar.

const NOMBRE_TURNO = '.registro-en-curso.lock';

async function adquirirTurno(driveId, parentId) {
  const intentosMax = 25;
  for (let intento = 0; intento < intentosMax; intento += 1) {
    const resp = await graphFetch(`/drives/${driveId}/items/${parentId}/children`, {
      method: 'POST',
      body: JSON.stringify({
        name: NOMBRE_TURNO,
        file: {},
        '@microsoft.graph.conflictBehavior': 'fail',
      }),
    });
    if (resp.ok) {
      const item = await resp.json();
      return item.id;
    }
    if (resp.status !== 409) {
      const error = new Error('No se pudo tomar el turno para registrar en el libro.');
      error.status = 502;
      error.detail = await resp.text();
      throw error;
    }
    // Otro registro tiene el turno: espera un poco (con variación, para que
    // dos solicitudes que llegaron juntas no reintenten en el mismo instante)
    // y vuelve a intentar.
    await new Promise((resolve) => setTimeout(resolve, 300 + Math.random() * 500));
  }

  const error = new Error(
    'Hay varias personas registrando lotes al mismo tiempo y no se pudo tomar el turno. ' +
      'Espere unos segundos y vuelva a intentarlo.',
  );
  error.status = 503;
  throw error;
}

async function liberarTurno(driveId, lockItemId) {
  if (!lockItemId) return;
  try {
    await graphFetch(`/drives/${driveId}/items/${lockItemId}`, { method: 'DELETE' });
  } catch {
    // Si el borrado falla, el siguiente registro esperará un poco más de la
    // cuenta la próxima vez que lea este archivo con conflictBehavior=fail,
    // pero no debe verse como si el registro que sí se acaba de completar
    // hubiera fallado.
  }
}

async function escribirLote(payload) {
  const { tabla, hoja } = tablaYHojaDe(payload);

  const filas = Array.isArray(payload.filas) ? payload.filas : [];
  const columnas = Array.isArray(payload.columnas) ? payload.columnas : [];
  const valores = Array.isArray(payload.valores) && payload.valores.length
    ? payload.valores
    : filas.map((fila) => columnas.map((col) => fila[col] ?? null));

  if (!valores.length) {
    const error = new Error('La solicitud no trae "filas"/"valores" para escribir.');
    error.status = 400;
    throw error;
  }

  const { driveId, itemId, parentId } = await resolverArchivo();

  // Turno: mientras este lote no termine de escribirse, nadie más puede
  // entrar a leer-y-escribir la numeración (ver comentario arriba de
  // `adquirirTurno`). Así dos registros casi simultáneos no calculan el
  // mismo folio/registro.
  const lockItemId = await adquirirTurno(driveId, parentId);

  try {
    // La numeración que mandó el navegador (columnas 0-3 de cada fila: N,
    // LIBRO, FOLIO, REGISTRO) es solo su mejor cálculo con lo último que él
    // sabía; aquí se descarta y se vuelve a calcular con la última fila real
    // del libro, leída con el turno ya tomado.
    const ultima = await leerUltimaPosicion(driveId, itemId, tabla, hoja);
    const posicionPrevia = ultima?.posicion ?? POSICION_INICIAL;
    const consecutivoPrevio = ultima?.consecutivo ?? CONSECUTIVO_INICIAL;

    let cursor = posicionPrevia;
    const asignados = valores.map((fila, indice) => {
      cursor = siguientePosicion(cursor);
      const consecutivo = consecutivoPrevio + indice + 1;
      const nuevaFila = fila.slice();
      nuevaFila[0] = consecutivo;
      nuevaFila[1] = cursor.libro;
      nuevaFila[2] = cursor.folio;
      nuevaFila[3] = cursor.registro;
      return nuevaFila;
    });

    const resp = await graphFetch(
      `/drives/${driveId}/items/${itemId}/workbook/tables/${encodeURIComponent(tabla)}/rows/add`,
      { method: 'POST', body: JSON.stringify({ values: asignados }) },
    );

    if (!resp.ok) {
      const error = new Error('Excel Online rechazó la escritura del lote.');
      error.status = 502;
      error.detail = await resp.text();
      throw error;
    }

    return {
      rowsSent: asignados.length,
      // Con esto la app recalcula, del lado del navegador, el mismo rango
      // exacto que se acaba de escribir aquí (misma fórmula, mismo punto de
      // partida) y corrige el comprobante, la bitácora y la plantilla
      // adjunta si habían quedado con la numeración vieja.
      numeracion: {
        previoPosicion: posicionPrevia,
        previoConsecutivo: consecutivoPrevio,
      },
    };
  } finally {
    await liberarTurno(driveId, lockItemId);
  }
}

async function enviarCorreo(payload) {
  const from = process.env.GRAPH_MAIL_FROM;
  if (!from) {
    throw new Error('Falta GRAPH_MAIL_FROM en las variables de entorno de Vercel.');
  }

  const mensaje = {
    message: {
      subject: `Registro Oficial ${payload.idRegistro ?? ''} — ${payload.curso ?? ''}`,
      body: {
        contentType: 'HTML',
        content: `
          <p>Estimado(a) <b>${escapeHtml(payload.responsable)}</b>:</p>
          <p>Se le informa que el lote de certificados correspondiente al curso
          <b>${escapeHtml(payload.curso)}</b> quedó registrado oficialmente en el Libro de
          Registro de Cursos de Extensión de la Escuela Naval de Cadetes "Almirante Padilla".</p>
          <p>Número de registro: <b>${escapeHtml(payload.idRegistro)}</b></p>
          <p>Este registro certifica que la información de los graduados fue verificada y
          consignada en la base de datos institucional. Si encuentra alguna inconsistencia en
          los datos registrados, por favor comuníquese con la Oficina de Estadística a la
          brevedad para su corrección.</p>
          <p>Cordialmente,<br/>
          PD02 Beyty P. Camargo M.<br/>
          Jefe de Estadística<br/>
          Escuela Naval de Cadetes "Almirante Padilla"</p>
          <p style="color:#888;font-size:12px;">Este es un mensaje generado automáticamente por
          el Sistema de Auditoría de Plantillas Xertify y Registro de Cursos de Extensión.</p>
        `,
      },
      toRecipients: [{ emailAddress: { address: payload.correoResponsable } }],
      // La app manda la plantilla ya con el registro asentado, codificada en
      // base64, en `payload.attachment`. Si por algún motivo no llegó, el
      // correo se manda igual, solo que sin adjunto.
      ...(payload.attachment
        ? {
            attachments: [
              {
                '@odata.type': '#microsoft.graph.fileAttachment',
                name: payload.attachment.fileName,
                contentType:
                  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                contentBytes: payload.attachment.contentBase64,
              },
            ],
          }
        : {}),
    },
    saveToSentItems: true,
  };

  const resp = await graphFetch(`/users/${encodeURIComponent(from)}/sendMail`, {
    method: 'POST',
    body: JSON.stringify(mensaje),
  });

  if (!resp.ok) {
    const error = new Error('No se pudo enviar el correo de confirmación.');
    error.status = 502;
    error.detail = await resp.text();
    throw error;
  }
}

/**
 * CORS: esta función se llama desde el dominio del PORTAL (o desde el que
 * sea, embebido en un iframe) — nunca desde el mismo dominio que
 * `auditoria-xertify-enap.vercel.app` — así que sin estos encabezados el
 * navegador bloquea la respuesta antes de que la app la vea y todo parece
 * "Failed to fetch" aunque la función haya funcionado bien. `*` es seguro
 * aquí porque el único secreto real es la propia `API_KEY`, que igual se
 * exige por encabezado y nunca queda visible en el navegador de nadie más.
 */
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    // Preflight: el navegador pregunta antes del POST real si tiene permiso.
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido: use POST.' });
    return;
  }

  const apiKey = process.env.API_KEY;
  if (apiKey && req.headers['x-api-key'] !== apiKey) {
    res.status(401).json({ error: 'Clave de API inválida o ausente.' });
    return;
  }

  const payload = typeof req.body === 'object' && req.body ? req.body : {};

  try {
    if (payload.accion === 'notificar') {
      await enviarCorreo(payload);
      res.status(200).json({ ok: true });
      return;
    }

    const outcome = await escribirLote(payload);
    res.status(200).json({ ok: true, ...outcome });
  } catch (error) {
    const status = error && error.status ? error.status : 500;
    res.status(status).json({
      error: error instanceof Error ? error.message : String(error),
      detail: error && error.detail ? error.detail : undefined,
    });
  }
}
