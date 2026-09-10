/**
 * fields.ts
 * Metadatos de cada columna de la plantilla: etiqueta legible, alias de
 * encabezado admitidos, obligatoriedad y tipo de validación.
 */

import type { CanonicalField } from '../types';

export type Requirement =
  /** Xertify rechaza el cargue si viene vacío. */
  | 'xertify'
  /** La institución lo exige para poder asentar el registro en el libro. */
  | 'institucional'
  /** Puede quedar vacío. */
  | 'opcional';

export type FieldKind =
  | 'nombre'
  | 'texto'
  | 'email'
  | 'telefono'
  | 'documento-tipo'
  | 'documento-numero'
  | 'ciudad'
  | 'fecha-es'
  | 'genero'
  | 'docformato'
  | 'numero'
  | 'ledger'
  | 'libre';

export interface FieldSpec {
  field: CanonicalField;
  /** Encabezado literal en la plantilla. */
  header: string;
  label: string;
  requirement: Requirement;
  kind: FieldKind;
  /** Alias normalizados aceptados al detectar el encabezado. */
  aliases: string[];
  /** Ancho sugerido de la columna en la tabla de la UI. */
  width: number;
  /**
   * `true` si la COLUMNA puede faltar por completo en la plantilla sin que
   * eso cuente como «falta una columna obligatoria» (algunas plantillas,
   * como Cursos PreAntártico, solo llevan dos firmantes y nunca traen esta
   * columna). No afecta la otra regla: si la columna sí viene en el archivo,
   * cada celda sigue exigiéndose igual que cualquier campo `requirement`
   * distinto de `opcional`.
   */
  columnOptional?: boolean;
}

export const FIELD_SPECS: Record<CanonicalField, FieldSpec> = {
  nombres: {
    field: 'nombres',
    header: 'NOMBRES',
    label: 'Nombres',
    requirement: 'xertify',
    kind: 'nombre',
    aliases: ['nombres', 'nombre', 'first name', 'primer nombre', 'nombres del estudiante'],
    width: 190,
  },
  apellidos: {
    field: 'apellidos',
    header: 'APELLIDOS',
    label: 'Apellidos',
    requirement: 'institucional',
    kind: 'nombre',
    aliases: ['apellidos', 'apellido', 'last name', 'surname'],
    width: 190,
  },
  telefono: {
    field: 'telefono',
    header: 'TELEFONO',
    label: 'Teléfono',
    requirement: 'institucional',
    kind: 'telefono',
    aliases: ['telefono', 'tel', 'celular', 'phone', 'movil'],
    width: 140,
  },
  email: {
    field: 'email',
    header: 'EMAIL',
    label: 'Correo electrónico',
    requirement: 'xertify',
    kind: 'email',
    aliases: ['email', 'correo', 'correo electronico', 'e mail', 'mail'],
    width: 220,
  },
  tipodocumento: {
    field: 'tipodocumento',
    header: 'TIPODOCUMENTO',
    label: 'Tipo de documento',
    requirement: 'institucional',
    kind: 'documento-tipo',
    aliases: ['tipodocumento', 'tipo documento', 'tipo de documento', 'tipo doc', 'tipo de doc'],
    width: 260,
  },
  numerodocumento: {
    field: 'numerodocumento',
    header: 'NUMERODOCUMENTO',
    label: 'Número de documento',
    requirement: 'institucional',
    kind: 'documento-numero',
    aliases: [
      'numerodocumento',
      'numero documento',
      'numero de documento',
      'documento',
      'documento de identidad',
      'cedula',
      'identificacion',
      // Grafías vistas en las plantillas de las facultades.
      'no documento',
      'no de documento',
      'nro documento',
      'nro de documento',
      'num documento',
      'documento no',
      'numero de identificacion',
      'numero identificacion',
      'cedula de ciudadania numero',
    ],
    width: 170,
  },
  lugarexpedicion: {
    field: 'lugarexpedicion',
    header: 'LUGAREXPEDICION',
    label: 'Lugar de expedición',
    requirement: 'opcional',
    kind: 'ciudad',
    aliases: [
      'lugarexpedicion',
      'lugar expedicion',
      'lugar de expedicion',
      'ciudad expedicion',
      'lugar exp',
    ],
    width: 180,
  },
  fechaexpedicion: {
    field: 'fechaexpedicion',
    header: 'FECHAEXPEDICION',
    label: 'Fecha de expedición',
    requirement: 'opcional',
    kind: 'fecha-es',
    aliases: ['fechaexpedicion', 'fecha expedicion', 'fecha de expedicion'],
    width: 190,
  },
  genero: {
    field: 'genero',
    header: 'GENERO',
    label: 'Género',
    requirement: 'opcional',
    kind: 'genero',
    aliases: ['genero', 'sexo', 'gender'],
    width: 90,
  },
  fechanacimiento2: {
    field: 'fechanacimiento2',
    header: 'fechanacimiento2',
    label: 'Fecha de nacimiento',
    requirement: 'opcional',
    kind: 'fecha-es',
    aliases: [
      'fechanacimiento2',
      'fechanacimiento',
      'fecha nacimiento',
      'fecha de nacimiento',
      'nacimiento',
    ],
    width: 190,
  },
  direccion: {
    field: 'direccion',
    header: 'DIRECCION',
    label: 'Dirección',
    requirement: 'opcional',
    kind: 'libre',
    aliases: ['direccion', 'address'],
    width: 200,
  },
  email2: {
    field: 'email2',
    header: 'EMAIL2',
    label: 'Correo alterno',
    requirement: 'opcional',
    kind: 'email',
    aliases: ['email2', 'correo2', 'correo alterno', 'segundo correo'],
    width: 200,
  },
  telefono2: {
    field: 'telefono2',
    header: 'TELEFONO2',
    label: 'Teléfono alterno',
    requirement: 'opcional',
    kind: 'telefono',
    aliases: ['telefono2', 'celular2', 'telefono alterno'],
    width: 140,
  },
  comentarios: {
    field: 'comentarios',
    header: 'COMENTARIOS',
    label: 'Comentarios',
    requirement: 'opcional',
    kind: 'libre',
    aliases: ['comentarios', 'observaciones', 'notas'],
    width: 200,
  },
  docformato: {
    field: 'docformato',
    header: 'docformato',
    // Alimenta la columna TIPO DE DOC de la Base de Datos.
    label: 'Documento formateado (→ TIPO DE DOC)',
    requirement: 'institucional',
    kind: 'docformato',
    aliases: ['docformato', 'documento formateado', 'doc formato'],
    width: 190,
  },
  lugarexpi: {
    field: 'lugarexpi',
    header: 'lugarexpi',
    // Alimenta LUGAR EXPEDICION en la Base de Datos (con lugarexpedicion
    // como respaldo si viene vacío); ver databaseService.ts.
    label: 'Lugar expedición (→ LUGAR EXPEDICION)',
    requirement: 'opcional',
    kind: 'libre',
    aliases: ['lugarexpi', 'lugar expi', 'lugar expedicion certificado'],
    width: 190,
  },
  titulo: {
    field: 'titulo',
    header: 'titulo',
    label: 'Título / curso',
    requirement: 'institucional',
    kind: 'texto',
    aliases: ['titulo', 'título', 'curso', 'nombre del curso', 'programa'],
    width: 280,
  },
  intensidad: {
    field: 'intensidad',
    header: 'intensidad',
    label: 'Intensidad horaria',
    requirement: 'institucional',
    kind: 'numero',
    aliases: ['intensidad', 'intensidad horaria', 'horas', 'duracion'],
    width: 120,
  },
  fechainicio: {
    field: 'fechainicio',
    header: 'fechainicio',
    label: 'Fecha de inicio',
    requirement: 'institucional',
    kind: 'fecha-es',
    // Es una sola columna y lleva todo el periodo del curso: «2 de septiembre a
    // 5 de octubre de 2025». Algunas plantillas la traen en inglés.
    aliases: [
      'fechainicio',
      'fecha inicio',
      'fecha de inicio',
      'startdate',
      'start date',
      'fecha inicio y fin',
      'fecha del curso',
      'periodo del curso',
    ],
    width: 190,
  },
  fechaemite: {
    field: 'fechaemite',
    header: 'fechaemite',
    label: 'Fecha de emisión',
    requirement: 'institucional',
    kind: 'fecha-es',
    aliases: ['fechaemite', 'fecha emite', 'fecha emision', 'fecha de emision'],
    width: 190,
  },
  nomfirma1: {
    field: 'nomfirma1',
    header: 'nomfirma1',
    label: 'Firmante 1',
    requirement: 'institucional',
    kind: 'nombre',
    aliases: ['nomfirma1', 'firmante 1', 'nombre firmante 1'],
    width: 190,
  },
  nomfirma2: {
    field: 'nomfirma2',
    header: 'nomfirma2',
    label: 'Firmante 2',
    requirement: 'institucional',
    kind: 'nombre',
    aliases: ['nomfirma2', 'firmante 2', 'nombre firmante 2'],
    width: 190,
  },
  nomfirma3: {
    field: 'nomfirma3',
    header: 'nomfirma3',
    label: 'Firmante 3',
    requirement: 'institucional',
    kind: 'nombre',
    aliases: ['nomfirma3', 'firmante 3', 'nombre firmante 3'],
    width: 190,
    // Cursos PreAntártico solo lleva dos firmantes y nunca trae esta
    // columna: que falte del todo no cuenta como columna obligatoria
    // faltante. Si la plantilla sí la trae, cada celda se sigue exigiendo.
    columnOptional: true,
  },
  li: {
    field: 'li',
    header: 'li',
    label: 'Libro',
    requirement: 'opcional',
    kind: 'ledger',
    aliases: ['li', 'libro', 'numero libro'],
    width: 80,
  },
  fo: {
    field: 'fo',
    header: 'fo',
    label: 'Folio',
    requirement: 'opcional',
    kind: 'ledger',
    aliases: ['fo', 'folio', 'numero folio'],
    width: 80,
  },
  numre: {
    field: 'numre',
    header: 'numre',
    label: 'Registro',
    requirement: 'opcional',
    kind: 'ledger',
    aliases: ['numre', 'registro', 'numero registro', 'num registro', 'reg'],
    width: 90,
  },
};

export const FIELD_LIST = Object.values(FIELD_SPECS);

/** Campos que la app rellena automáticamente al registrar el lote. */
export const LEDGER_FIELDS: CanonicalField[] = ['li', 'fo', 'numre'];

/** Campos que se muestran por defecto en la tabla de auditoría. */
export const PRIMARY_FIELDS: CanonicalField[] = [
  'nombres',
  'apellidos',
  'tipodocumento',
  'numerodocumento',
  'email',
  'titulo',
  'intensidad',
  'fechainicio',
  'fechaemite',
];
