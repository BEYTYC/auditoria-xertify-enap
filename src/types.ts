/**
 * types.ts
 * Contratos de dominio de la aplicación de auditoría de plantillas Xertify
 * y registro en la Base de Datos de Cursos de Extensión.
 */

/* ------------------------------------------------------------------ */
/* Columnas de la plantilla (hoja `People`, encabezados en la fila 2)   */
/* ------------------------------------------------------------------ */

/**
 * Encabezados literales de la plantilla, en su orden real (A..Z).
 * Se usan tal cual al reescribir el archivo corregido.
 */
export const TEMPLATE_HEADERS = [
  'NOMBRES',
  'APELLIDOS',
  'TELEFONO',
  'EMAIL',
  'TIPODOCUMENTO',
  'NUMERODOCUMENTO',
  'LUGAREXPEDICION',
  'FECHAEXPEDICION',
  'GENERO',
  'fechanacimiento2',
  'DIRECCION',
  'EMAIL2',
  'TELEFONO2',
  'COMENTARIOS',
  'docformato',
  'lugarexpi',
  'titulo',
  'intensidad',
  'fechainicio',
  'fechaemite',
  'nomfirma1',
  'nomfirma2',
  'nomfirma3',
  'li',
  'fo',
  'numre',
] as const;

/** Clave canónica de cada columna (encabezado en minúscula). */
export const CANONICAL_FIELDS = [
  'nombres',
  'apellidos',
  'telefono',
  'email',
  'tipodocumento',
  'numerodocumento',
  'lugarexpedicion',
  'fechaexpedicion',
  'genero',
  'fechanacimiento2',
  'direccion',
  'email2',
  'telefono2',
  'comentarios',
  'docformato',
  'lugarexpi',
  'titulo',
  'intensidad',
  'fechainicio',
  'fechaemite',
  'nomfirma1',
  'nomfirma2',
  'nomfirma3',
  'li',
  'fo',
  'numre',
  // Propios de la plantilla de Cursos de Ley: ese lote no se registra en
  // Tabla3 sino en Tabla2 («Cursos de Ascenso»), que trae estas cinco
  // columnas adicionales. Ver databaseService.ts (buildAscensoRows) y
  // registryService.ts (destino según la plantilla).
  'numerocurso',
  'modalidad',
  'tipo',
  'promedio',
  'puesto',
] as const;

export type CanonicalField = (typeof CANONICAL_FIELDS)[number];

/** Fila del encabezado real dentro de la hoja `People` (1-based). */
export const TEMPLATE_HEADER_ROW = 2;
/** Primera fila con datos (1-based). */
export const TEMPLATE_FIRST_DATA_ROW = 3;
/** Nombre de la hoja de datos en la plantilla. */
export const TEMPLATE_SHEET = 'People';

/* ------------------------------------------------------------------ */
/* Mapeo de encabezados                                                 */
/* ------------------------------------------------------------------ */

export interface ColumnMapping {
  /** Encabezado tal cual aparece en la fila 2 del Excel. */
  header: string;
  /** Índice de columna (0-based) dentro de la hoja. */
  index: number;
  /** Campo canónico asignado; `null` = columna no reconocida. */
  field: CanonicalField | null;
  /** `true` si el usuario forzó el mapeo desde la UI. */
  manual: boolean;
  /** Confianza 0..1 de la detección automática. */
  confidence: number;
}

export interface HeaderMapResult {
  mappings: ColumnMapping[];
  missingRequired: CanonicalField[];
  duplicates: string[];
  /** Fila donde se localizaron los encabezados (puede no ser la 2). */
  headerRow: number;
  sheetName: string;
}

/* ------------------------------------------------------------------ */
/* Filas y validación                                                   */
/* ------------------------------------------------------------------ */

export type IssueSeverity = 'error' | 'warning';
export type FixOrigin = 'auto' | 'manual' | 'none';

export interface ValidationIssue {
  /** Identificador estable de la regla, p.ej. `DOC.EXTRANJERO_SIN_PASAPORTE`. */
  code: string;
  field: CanonicalField;
  severity: IssueSeverity;
  message: string;
  /** Valor propuesto por el autocorrector; `undefined` si no es autocorregible. */
  suggestion?: string;
  /**
   * Texto que la interfaz pinta con marcas: cada `\u0001` es un espacio de más
   * y se dibuja como un guion rojo, para que se vea dónde sobra.
   */
  preview?: string;
  autoFixable: boolean;
}

export interface CellState {
  value: string;
  original: string;
  issues: ValidationIssue[];
  fixedBy: FixOrigin;
}

export interface StudentRow {
  id: string;
  /** Número de fila en el Excel original (1-based). */
  excelRow: number;
  cells: Record<CanonicalField, CellState>;
  /** Columnas no mapeadas, preservadas para la reexportación. */
  passthrough: Record<string, string>;
}

/* ------------------------------------------------------------------ */
/* Documento                                                            */
/* ------------------------------------------------------------------ */

export interface ParsedDocument {
  /** País tal como aparece en la lista Xertify (p.ej. `Colombia`, `Spain`). */
  country: string | null;
  /** Tipo tal como aparece en la lista Xertify (p.ej. `Cédula de ciudadanía`). */
  kind: string | null;
  /** Valor exacto de la lista Xertify, si hubo coincidencia. */
  exactValue: string | null;
  isColombian: boolean;
  /** `true` si el tipo corresponde a un pasaporte en cualquier idioma. */
  isPassport: boolean;
}

/* ------------------------------------------------------------------ */
/* Numeración del libro de registro                                     */
/* ------------------------------------------------------------------ */

/** Ningún folio ni registro puede superar 99: al llegar, se avanza. */
export const MAX_FOLIO = 99;
export const MAX_REGISTRO = 99;

export interface LedgerPosition {
  libro: number;
  folio: number;
  registro: number;
}

export interface LedgerAllocation {
  /** Posición del primer registro asignado al lote. */
  start: LedgerPosition;
  /** Posición del último registro asignado. */
  end: LedgerPosition;
  /** Posición asignada a cada fila, en orden. */
  positions: LedgerPosition[];
  /** Consecutivo global `N` asignado a cada fila. */
  consecutivos: number[];
  /** `true` si el lote obliga a abrir un libro nuevo. */
  abreLibroNuevo: boolean;
  /** `true` si el lote obliga a abrir uno o más folios nuevos. */
  abreFolioNuevo: boolean;
}

/* ------------------------------------------------------------------ */
/* Lote                                                                 */
/* ------------------------------------------------------------------ */

export interface BatchMetadata {
  /** Nombre del curso, respaldo cuando la fila no trae `titulo`. */
  curso: string;
  /** Oficina responsable confirmada por el responsable (una de las 12). */
  oficina: string;
  /** Persona que valida y firma la auditoría. */
  responsable: string;
  /** Correo del responsable: ahí se envía el comprobante del registro. */
  correoResponsable: string;
  /** Fecha de inicio, respaldo cuando la fila no trae `fechainicio`. */
  fechaInicio: string;
  /** Fecha de registro, respaldo cuando la fila no trae `fechaemite`. */
  fechaRegistro: string;
  /** Intensidad horaria, respaldo cuando la fila no trae `intensidad`. */
  intensidad: string;
  /** Nombre del archivo original cargado. */
  archivoOriginal: string;
}

export interface BatchStats {
  totalGraduados: number;
  totalColombianos: number;
  totalExtranjeros: number;
  erroresAuto: number;
  erroresManuales: number;
  erroresPendientes: number;
  advertencias: number;
}

export type BatchStatus =
  | 'AUDITADO Y APROBADO 100%'
  | 'PENDIENTE DE CORRECCIÓN'
  | 'REGISTRO FALLIDO'
  | 'REGISTRO ANULADO';

/* ------------------------------------------------------------------ */
/* Filas que se anexan a Tabla3 (Base de Datos, hoja `Libro No. 2`)      */
/* ------------------------------------------------------------------ */

/** Encabezados exactos de Tabla3, en orden. */
export const DB_COLUMNS = [
  'N',
  'LIBRO',
  'FOLIO',
  'REG',
  'APELLIDOS',
  'NOMBRES',
  'TIPO DE DOC',
  'DOCUMENTO DE IDENTIDAD',
  'LUGAR EXPEDICION',
  'NOMBRE DEL CURSO',
  'FECHA INICIO',
  'FECHA FINALIZACION',
  'FECHA DE REGISTRO',
  'PERIODO',
  'AÑO',
  'INTENSIDAD',
  'OFICINA RESPONSABLE',
  'FIRMANTE 1',
  'FIRMANTE 2',
  'FIRMANTE 3',
] as const;

export type DbColumn = (typeof DB_COLUMNS)[number];

/**
 * Esta lista es la única fuente de verdad de lo que se escribe en Tabla3: el
 * orden importa (Microsoft Graph inserta por posición, no por nombre) y debe
 * coincidir EXACTAMENTE con las columnas reales de la tabla en SharePoint —
 * ni una de más ni una de menos, en el mismo orden.
 *
 * `Tabla3` no tiene columna `OBSEVACIONES`: se quitó de esta lista porque la
 * tabla real no la tiene (confirmado por Graph al rechazar la inserción por
 * descuadre de columnas).
 *
 * `FIRMANTE 1/2/3` van al final porque así se agregaron en la tabla de Excel.
 * Salen de `nomfirma1/2/3` de la plantilla; cuando el certificado no trae un
 * tercer firmante, `FIRMANTE 3` queda vacío.
 */

/** Una fila lista para insertarse en Tabla3. */
export type DatabaseRow = Record<DbColumn, string | number | null>;

/* ------------------------------------------------------------------ */
/* Filas que se anexan a Tabla2 (Base de Datos, hoja «Cursos de Ascenso»)*/
/* ------------------------------------------------------------------ */

/**
 * Los lotes registrados con la plantilla de Cursos de Ley no van a Tabla3:
 * la institución los asienta en el mismo archivo, hoja «Cursos de Ascenso»,
 * tabla `Tabla2`, con su propia numeración de libro/folio/registro y cinco
 * columnas propias (NUMERO DE CURSO, MODALIDAD, TIPO, PROMEDIO, PUESTO
 * GENERAL) que Tabla3 no tiene. Orden confirmado por la Oficina de
 * Estadística — igual que en `DB_COLUMNS`, el orden importa porque Graph
 * inserta por posición.
 */
export const DB_COLUMNS_ASCENSO = [
  'N',
  'LIBRO',
  'FOLIO',
  'REG.',
  'APELLIDOS',
  'NOMBRES',
  'APELLIDOS Y NOMBRES',
  'DOCUMENTO DE IDENTIDAD',
  'LUGAR EXPEDICION',
  'PROMEDIO',
  'PUESTO GENERAL',
  'NOMBRE DEL CURSO',
  'NUMERO DE CURSO',
  'MODALIDAD',
  'TIPO',
  'FECHA INICIO',
  'FECHA FINALIZACION',
  'FECHA DE REGISTRO',
  'AÑO',
  'SEM',
  'OFICINA RESPONSABLE',
] as const;

export type DbColumnAscenso = (typeof DB_COLUMNS_ASCENSO)[number];

/** Una fila lista para insertarse en Tabla2 («Cursos de Ascenso»). */
export type AscensoRow = Record<DbColumnAscenso, string | number | null>;

/** Valores válidos de la columna `MODALIDAD` de Tabla2. */
export const MODALIDADES_ASCENSO = ['Presencial', 'A distancia', 'Sincrónico'] as const;
export type ModalidadAscenso = (typeof MODALIDADES_ASCENSO)[number];

/** Valores válidos de la columna `TIPO` de Tabla2. */
export const TIPOS_ASCENSO = ['Línea', 'Administrativo'] as const;
export type TipoAscenso = (typeof TIPOS_ASCENSO)[number];

/**
 * A qué libro va el lote. `tabla3` es Cursos de Extensión (el de siempre);
 * `tabla2` es «Cursos de Ascenso», donde se asientan los lotes auditados con
 * la plantilla de Cursos de Ley — mismo archivo, otra hoja, numeración de
 * libro/folio/registro propia e independiente.
 */
export type RegistroDestino = 'tabla3' | 'tabla2';

/* ------------------------------------------------------------------ */
/* Comprobante del lote                                                 */
/* ------------------------------------------------------------------ */

export interface BatchReceipt {
  /** Código único del lote, p.ej. `REG-2026-0825-001`. */
  idRegistro: string;
  timestampIso: string;
  fechaHoraLegible: string;
  archivoOriginal: string;
  curso: string;
  oficina: string;
  responsable: string;
  stats: BatchStats;
  allocation: LedgerAllocation;
  estado: BatchStatus;
  referenciaAuditoria: string;
}

/* ------------------------------------------------------------------ */
/* Integración SharePoint                                               */
/* ------------------------------------------------------------------ */

export type SharePointMode = 'graph' | 'webhook' | 'mock';

export interface GraphConfig {
  clientId: string;
  tenantId: string;
  /** Drive (biblioteca) que contiene la Base de Datos. Opcional si se da la ruta. */
  driveId: string;
  /** ID del archivo .xlsx dentro del drive. Opcional si se da la ruta. */
  itemId: string;
  /**
   * Cuenta dueña del archivo, p. ej. `jestadisticaplen@enap.edu.co`.
   * Con la ruta, evita tener que averiguar los identificadores a mano.
   */
  ownerUpn?: string;
  /** Ruta del archivo dentro del OneDrive de esa cuenta. */
  filePath?: string;
  /** Nombre de la tabla: `Tabla3`. */
  tableId: string;
  /** Hoja de respaldo: `Libro No. 2`. */
  worksheetName?: string;
  redirectUri?: string;
  /**
   * Cuenta desde la que debe verse enviado el correo de confirmación, p. ej.
   * `certificaciones@enap.edu.co`. Si se deja vacío, el correo sale de la
   * cuenta con la que se inició sesión para registrar.
   *
   * Para que funcione, quien inicia sesión (hoy, la cuenta administradora)
   * necesita permiso «Enviar como» sobre este buzón en Exchange; si no lo
   * tiene, Microsoft rechaza el envío y hay que pedirle a la Dirección de
   * TIC que lo conceda.
   */
  mailFrom?: string;
}

export interface WebhookConfig {
  url: string;
  headers?: Record<string, string>;
}

export interface SharePointConfig {
  mode: SharePointMode;
  graph?: GraphConfig;
  webhook?: WebhookConfig;
}

export type RegistrationOutcome = 'success' | 'error';

/** Datos que necesita el correo de confirmación del registro. */
export interface EmailContext {
  responsable: string;
  correoResponsable: string;
  curso: string;
  idRegistro: string;
  /**
   * La plantilla ya con el registro asentado (numeración de libro/folio/
   * registro incluida), para adjuntarla al correo de confirmación. Si no se
   * pudo generar —por ejemplo, si no queda el archivo original a mano—, el
   * correo se manda igual, solo que sin adjunto.
   */
  attachment?: {
    fileName: string;
    /** Contenido del .xlsx codificado en base64, listo para Graph. */
    contentBase64: string;
  };
}

export interface RegistrationResult {
  outcome: RegistrationOutcome;
  mode: SharePointMode;
  receipt: BatchReceipt;
  /** Filas efectivamente enviadas a Tabla3. */
  rowsSent: number;
  message: string;
  workbookUrl?: string;
  errorDetail?: string;
  completedAt: string;
  /**
   * Resultado del correo de confirmación. Solo se intenta cuando el registro
   * en la Base de Datos quedó en firme: no tiene sentido avisar de un lote
   * que no se asentó.
   */
  emailSent: boolean;
  emailMessage: string;
}

export interface LogEntry {
  idRegistro: string;
  timestampIso: string;
  fechaHoraLegible: string;
  archivoOriginal: string;
  curso: string;
  oficina: string;
  responsable: string;
  /**
   * Correo de quien registró el lote. Sirve para que, en la Bitácora, cada
   * quien vea solo sus propios registros (la Oficina de Estadística sigue
   * viendo todos). Los lotes registrados antes de este campo quedan vacíos.
   */
  correoResponsable?: string;
  totalGraduados: number;
  totalColombianos: number;
  totalExtranjeros: number;
  erroresAuto: number;
  erroresManuales: number;
  estado: BatchStatus;
  libro: number;
  folioInicial: number;
  registroInicial: number;
  folioFinal: number;
  registroFinal: number;
  outcome: RegistrationOutcome;
  mode: SharePointMode;
  syncedToSharePoint: boolean;
  /**
   * A qué libro se registró: Tabla3 (Cursos de Extensión) si falta —así
   * quedaron todos los lotes de antes de este campo— o Tabla2 («Cursos de
   * Ascenso») para los lotes de Cursos de Ley. Al anular, dice de cuál de
   * los dos libros hay que borrar las filas.
   */
  destino?: RegistroDestino;
  /** Filas generadas (de Tabla3 o de Tabla2, según `destino`), para reexportar el lote si hace falta. */
  rows?: DatabaseRow[] | AscensoRow[];
  /** `true` si la Oficina de Estadística anuló el registro en el libro. */
  anulado?: boolean;
  /** Nombre del archivo corregido que se entregó a la facultad. */
  plantillaNombre?: string;
  /**
   * El archivo corregido, en base64, para poder volver a descargarlo desde la
   * bitácora. Solo lo conservan los lotes más recientes: el navegador tiene
   * poco espacio y el renglón de la bitácora vale por sí solo.
   */
  plantillaBase64?: string;
}

/* ------------------------------------------------------------------ */
/* UI                                                                   */
/* ------------------------------------------------------------------ */

export type WizardStep = 'upload' | 'audit' | 'register' | 'history';
export type RowFilter = 'all' | 'errors' | 'fixed' | 'clean';
