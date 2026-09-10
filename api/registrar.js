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
  cachedFileRef = { driveId: data.parentReference.driveId, itemId: data.id };
  return cachedFileRef;
}

async function escribirLote(payload) {
  const tabla = process.env.GRAPH_TABLE_ID || 'Tabla3';

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

  const { driveId, itemId } = await resolverArchivo();

  const resp = await graphFetch(
    `/drives/${driveId}/items/${itemId}/workbook/tables/${encodeURIComponent(tabla)}/rows/add`,
    { method: 'POST', body: JSON.stringify({ values: valores }) },
  );

  if (!resp.ok) {
    const error = new Error('Excel Online rechazó la escritura del lote.');
    error.status = 502;
    error.detail = await resp.text();
    throw error;
  }

  return { rowsSent: valores.length };
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
          el Sistema de Auditoría de Plantillas Xertify y Registro de Cursos de Extensión.
          Por favor no responda a esta dirección.</p>
        `,
      },
      toRecipients: [{ emailAddress: { address: payload.correoResponsable } }],
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

export default async function handler(req, res) {
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
