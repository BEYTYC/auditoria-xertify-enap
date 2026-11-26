/**
 * api/registrar.js
 *
 * Recibe el lote de la app de Auditoría Xertify, escribe en la Tabla del Excel
 * (Microsoft Graph, permisos de aplicación) y envía el correo de confirmación.
 *
 * Variables de entorno (Vercel → Settings → Environment Variables):
 *   GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET, GRAPH_UPN_DRIVE,
 *   GRAPH_RUTA_ARCHIVO, GRAPH_TABLE_ID (opcional, "Tabla3"), GRAPH_WORKSHEET
 *   (opcional, "Libro No. 2"), GRAPH_MAIL_FROM, API_KEY (opcional).
 *
 * CAMBIOS DE ESTA VERSIÓN
 *  - El "turno" (.registro-en-curso.lock) ahora CADUCA: si una ejecución anterior
 *    murió sin borrarlo (por ejemplo, Vercel cortó la función por tiempo), el
 *    archivo quedaba para siempre y TODOS los registros siguientes fallaban.
 *    Ahora, si el turno tiene más de 45 s, se considera abandonado y se borra.
 *  - Se reduce el tiempo máximo de espera por el turno (~9 s) para no pasar el
 *    límite de duración de la función de Vercel.
 *  - La numeración (libro/folio/registro) solo se asigna y devuelve cuando Excel
 *    confirmó la escritura. Si falla, la respuesta trae solo `error` (sin
 *    numeración): el front-end no debe mostrar folio en ese caso.
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

let cachedFileRef = null; // { driveId, itemId, parentId }

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
    parentId: data.parentReference.id,
  };
  return cachedFileRef;
}

/* -------------------------------------------------------------------- */
/* Numeración institucional del libro (LIBRO / FOLIO / REGISTRO / N)      */
/* -------------------------------------------------------------------- */

const MAX_FOLIO = 99;
const MAX_REGISTRO = 99;

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

function tablaYHojaDe(payload) {
  if (payload.destino === 'tabla2') {
    return { tabla: 'Tabla2', hoja: 'Cursos de Ascenso' };
  }
  return {
    tabla: process.env.GRAPH_TABLE_ID || 'Tabla3',
    hoja: process.env.GRAPH_WORKSHEET || 'Libro No. 2',
  };
}

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
/* Turno (con caducidad)                                                  */
/* -------------------------------------------------------------------- */

const NOMBRE_TURNO = '.registro-en-curso.lock';
const TURNO_CADUCA_MS = 45_000; // un registro normal tarda unos pocos segundos
const INTENTOS_TURNO = 14;      // ~14 × (0.3–0.8 s) ≈ 9 s, dentro del límite de Vercel

/** Si el archivo de turno lleva más de TURNO_CADUCA_MS, quedó abandonado: se borra. */
async function limpiarTurnoAbandonado(driveId, parentId) {
  try {
    const resp = await graphFetch(
      `/drives/${driveId}/items/${parentId}:/${encodeURIComponent(NOMBRE_TURNO)}` +
        '?$select=id,createdDateTime,lastModifiedDateTime',
    );
    if (resp.status === 404) return true; // ya no existe: se puede reintentar de inmediato
    if (!resp.ok) return false;
    const item = await resp.json();
    const desde = Date.parse(item.lastModifiedDateTime || item.createdDateTime || '');
    if (Number.isFinite(desde) && Date.now() - desde > TURNO_CADUCA_MS) {
      const del = await graphFetch(`/drives/${driveId}/items/${item.id}`, { method: 'DELETE' });
      return del.ok || del.status === 404;
    }
  } catch {
    // si no se puede revisar, simplemente se sigue esperando
  }
  return false;
}

async function adquirirTurno(driveId, parentId) {
  for (let intento = 0; intento < INTENTOS_TURNO; intento += 1) {
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
    // Otro registro tiene el turno. Si ese turno quedó abandonado, se limpia
    // y se reintenta enseguida.
    if (await limpiarTurnoAbandonado(driveId, parentId)) continue;
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
    // ver limpiarTurnoAbandonado: un turno que no se borró caduca solo.
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

  const lockItemId = await adquirirTurno(driveId, parentId);

  try {
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
          <p>Este registro certifica que la plantilla superó las reglas de validación del
          cargue. La verificación de la información asociada a los datos registrados es
          responsabilidad de la dependencia que solicita el registro.</p>
          <p>Cordialmente,<br/>
          PD02 Beyty P. Camargo M.<br/>
          Jefe de Estadística<br/>
          Escuela Naval de Cadetes "Almirante Padilla"</p>
          <p style="color:#888;font-size:12px;">Este es un mensaje generado automáticamente por
          el Sistema de Auditoría de Plantillas Xertify y Registro de Cursos de Extensión.</p>
        `,
      },
      toRecipients: [{ emailAddress: { address: payload.correoResponsable } }],
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

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
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
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      detail: error && error.detail ? error.detail : undefined,
    });
  }
}
