/**
 * appConfig.ts
 * Configuración de entorno. Se lee de las variables `VITE_*` y se puede
 * sobrescribir en caliente desde el panel de ajustes de la aplicación
 * (útil mientras Registro y Control consigue los IDs de SharePoint).
 */

import type { SharePointConfig, SharePointMode } from '../types';

const env = import.meta.env as Record<string, string | undefined>;

const STORAGE_KEY = 'auditor-certificados.config.v1';

function read(name: string, fallback = ''): string {
  return (env[name] ?? '').trim() || fallback;
}

/** Configuración por defecto, tomada del archivo `.env`. */
export function defaultConfig(): SharePointConfig {
  const mode = (read('VITE_SHAREPOINT_MODE', 'mock') as SharePointMode) ?? 'mock';

  return {
    mode: ['graph', 'webhook', 'mock'].includes(mode) ? mode : 'mock',
    graph: {
      clientId: read('VITE_GRAPH_CLIENT_ID'),
      tenantId: read('VITE_GRAPH_TENANT_ID'),
      driveId: read('VITE_GRAPH_DRIVE_ID'),
      itemId: read('VITE_GRAPH_ITEM_ID'),
      ownerUpn: read('VITE_GRAPH_OWNER_UPN'),
      filePath: read('VITE_GRAPH_FILE_PATH'),
      tableId: read('VITE_GRAPH_TABLE_ID', 'Tabla3'),
      worksheetName: read('VITE_GRAPH_WORKSHEET', 'Libro No. 2'),
      mailFrom: read('VITE_GRAPH_MAIL_FROM'),
      // Apunta al puente de MSAL (`redirect.html`), no al `index.html`
      // normal: si el login vuelve directo a la app completa, Microsoft
      // nunca deja que esa ventana se cierre sola (ver sharepointService.ts).
      redirectUri: read('VITE_GRAPH_REDIRECT_URI', `${window.location.origin}/redirect.html`),
    },
    webhook: {
      url: read('VITE_WEBHOOK_URL'),
      headers: read('VITE_WEBHOOK_KEY')
        ? { 'x-api-key': read('VITE_WEBHOOK_KEY') }
        : undefined,
    },
  };
}

/** Carga la configuración vigente, con lo guardado por el usuario si existe. */
export function loadConfig(): SharePointConfig {
  const base = defaultConfig();
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return base;
    const parsed = JSON.parse(stored) as Partial<SharePointConfig>;
    return {
      mode: parsed.mode ?? base.mode,
      // El `redirectUri` nunca se toma de lo guardado: si quedó grabado
      // desde una sesión abierta en otra dirección (p. ej. localhost:5173,
      // el puerto de desarrollo), el inicio de sesión de Microsoft intentaría
      // volver a una dirección que ya no existe. Siempre se usa la dirección
      // real donde la app se está ejecutando ahora mismo (o la de la
      // variable de entorno, si se fijó al compilar).
      graph: { ...base.graph!, ...(parsed.graph ?? {}), redirectUri: base.graph!.redirectUri },
      webhook: { ...base.webhook!, ...(parsed.webhook ?? {}) },
    };
  } catch {
    return base;
  }
}

/** Persiste la configuración editada desde el panel de ajustes. */
export function saveConfig(config: SharePointConfig): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Sin almacenamiento disponible: la configuración vive solo en memoria.
  }
}

/** `true` si la configuración de Graph tiene todo lo necesario. */
export function isGraphReady(config: SharePointConfig): boolean {
  const graph = config.graph;
  if (!graph?.clientId || !graph?.tenantId || !graph?.tableId) return false;
  // El archivo se puede indicar por identificadores o por ruta; basta una vía.
  const porId = Boolean(graph.driveId && graph.itemId);
  const porRuta = Boolean(graph.ownerUpn && graph.filePath);
  return porId || porRuta;
}

/* ------------------------------------------------------------------ */
/* Facultad y responsable recordados                                    */
/* ------------------------------------------------------------------ */

const RESPONSABLE_STORAGE_KEY = 'auditor-certificados.responsable.v1';

export interface RememberedResponsable {
  oficina: string;
  responsable: string;
  correoResponsable: string;
}

const EMPTY_REMEMBERED: RememberedResponsable = {
  oficina: '',
  responsable: '',
  correoResponsable: '',
};

/**
 * Facultad, responsable y correo de la última vez: quien registra suele ser
 * siempre la misma persona, así que no tiene sentido pedírselos en cada
 * lote. Vive en el navegador de quien usa la app, no en el archivo `.env`.
 */
export function loadRememberedResponsable(): RememberedResponsable {
  try {
    const stored = window.localStorage.getItem(RESPONSABLE_STORAGE_KEY);
    if (!stored) return EMPTY_REMEMBERED;
    const parsed = JSON.parse(stored) as Partial<RememberedResponsable>;
    return {
      oficina: parsed.oficina ?? '',
      responsable: parsed.responsable ?? '',
      correoResponsable: parsed.correoResponsable ?? '',
    };
  } catch {
    return EMPTY_REMEMBERED;
  }
}

export function saveRememberedResponsable(data: RememberedResponsable): void {
  try {
    window.localStorage.setItem(RESPONSABLE_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Sin almacenamiento disponible: simplemente no se recuerda.
  }
}

/** `true` si el webhook está configurado. */
export function isWebhookReady(config: SharePointConfig): boolean {
  return Boolean(config.webhook?.url);
}

/* ------------------------------------------------------------------ */
/* Correos autorizados para registrar                                   */
/* ------------------------------------------------------------------ */

const AUTHORIZED_REGISTRARS_KEY = 'auditor-certificados.authorized-registrars.v1';

/**
 * Correos precargados la primera vez que se abre la app en un navegador
 * (antes de que Administración guarde su propia lista). Beyty pidió dejar
 * estos ya listos para que ella solo tenga que agregar el resto desde el
 * panel de Administración.
 */
const DEFAULT_AUTHORIZED_REGISTRARS: string[] = [
  'jestadisticaplen@enap.edu.co',
  'cien@enap.edu.co',
  'ccomi@enap.edu.co',
  'administrativocidiam@enap.edu.co',
  'jcley@enap.edu.co',
  'cursosextensionfcn@enap.edu.co',
  'posfam@enap.edu.co',
  'cursosextensionfacof@enap.edu.co',
  'sea@enap.edu.co',
  'maestriaingnaval@enap.edu.co',
  'jatfim@enap.edu.co',
];

/**
 * Lista de correos que pueden llegar hasta el registro real en el libro.
 * Se edita desde Administración, sin tocar código ni Vercel.
 *
 * La primera vez que se abre en un navegador (sin nada guardado todavía) se
 * precarga con `DEFAULT_AUTHORIZED_REGISTRARS` y se guarda de una vez, para
 * que Administración ya la muestre lista y solo falte agregar el resto.
 * Una vez que existe algo guardado —aunque se borre por completo a
 * propósito—, esa lista guardada manda: lista vacía guardada intencionalmente
 * sigue significando «sin restricción adicional».
 */
export function loadAuthorizedRegistrars(): string[] {
  try {
    const stored = window.localStorage.getItem(AUTHORIZED_REGISTRARS_KEY);
    if (!stored) {
      saveAuthorizedRegistrars(DEFAULT_AUTHORIZED_REGISTRARS);
      return [...DEFAULT_AUTHORIZED_REGISTRARS];
    }
    const parsed = JSON.parse(stored) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === 'string');
  } catch {
    return [];
  }
}

export function saveAuthorizedRegistrars(emails: string[]): void {
  try {
    window.localStorage.setItem(AUTHORIZED_REGISTRARS_KEY, JSON.stringify(emails));
  } catch {
    // Sin almacenamiento disponible: la lista solo dura mientras la pestaña
    // siga abierta, en memoria.
  }
}

/** `true` si ese correo puede llegar hasta el registro real. */
export function isAuthorizedRegistrar(email: string, list: string[]): boolean {
  if (list.length === 0) return true; // sin lista cargada: no hay restricción extra.
  const limpio = email.trim().toLowerCase();
  return list.some((permitido) => permitido.trim().toLowerCase() === limpio);
}

/** Modo efectivo: si el elegido no está configurado, se cae a `mock`. */
export function effectiveMode(config: SharePointConfig): SharePointMode {
  if (config.mode === 'graph' && isGraphReady(config)) return 'graph';
  if (config.mode === 'webhook' && isWebhookReady(config)) return 'webhook';
  return 'mock';
}
