/**
 * databaseService.ts
 * Traduce el lote auditado a las filas exactas que se anexan a `Tabla3`
 * («Base de Datos Cursos de Extensión.xlsx», hoja `Libro No. 2`).
 *
 * Equivalencias confirmadas por la institución (plantilla → base de datos):
 *
 *   NOMBRES          → NOMBRES
 *   APELLIDOS        → APELLIDOS
 *   NUMERODOCUMENTO  → DOCUMENTO DE IDENTIDAD
 *   LUGAREXPEDICION  → LUGAR EXPEDICION
 *   docformato       → TIPO DE DOC        (abreviado: CC, TI, CE, PS)
 *   titulo           → NOMBRE DEL CURSO
 *   intensidad       → INTENSIDAD
 *   fechainicio      → FECHA INICIO
 *   fechaemite       → FECHA DE REGISTRO
 *   nomfirma1        → OBSEVACIONES
 *   nomfirma3        → DIRECTOR FIRMANTE  (columna opcional, ver más abajo)
 *   li / fo / numre  → LIBRO / FOLIO / REG
 *
 * Columnas que la app calcula por su cuenta:
 *   N        consecutivo global
 *   PERIODO  fórmula estructurada idéntica a la del archivo
 *   AÑO      año de FECHA DE REGISTRO
 *   OFICINA RESPONSABLE  confirmada por el responsable (ver officeService)
 *
 * `FECHA FINALIZACION` no tiene origen en la plantilla: se deja vacía.
 * `DIRECTOR FIRMANTE` todavía no existe en Tabla3; solo se escribe si la
 * tabla la ofrece, para no romper la inserción.
 */

import {
  DB_COLUMNS,
  DB_OPTIONAL_COLUMNS,
  type BatchMetadata,
  type DbColumn,
  type DbOptionalColumn,
  type DatabaseRow,
  type LedgerAllocation,
  type StudentRow,
} from '../types';
import { parseAnyDate, parseDateRange, type ParsedDate } from './dateService';
import {
  cleanNationalId,
  dbAbbreviationFor,
  normalizeNumericCell,
  parseDocumentType,
} from './documentService';
import { ACCENT_NAMES, ACCENT_PLACES, ACCENT_TEXT } from '../data/accents';
import { AMBIGUOUS_ENYE } from '../data/names';
import { collapseSpaces, restoreAccents } from './textUtils';

/** Fórmula de la columna calculada `PERIODO`, idéntica a la del archivo. */
export const PERIODO_FORMULA =
  '=YEAR(Tabla3[[#This Row],[FECHA DE REGISTRO]])&" - "&IF(MONTH(Tabla3[[#This Row],[FECHA DE REGISTRO]])<7,1,2)';

/** Mayúscula conservando tildes y eñes, como el resto del histórico. */
export function toDatabaseCase(text: string): string {
  return collapseSpaces(text).toLocaleUpperCase('es-CO');
}

/**
 * Mayúscula con las tildes restituidas: la base va en MAYÚSCULA y en
 * mayúscula también lleva tilde. Es la última red antes de escribir, por si
 * el responsable forzó a mano un valor sin acentuar.
 *
 * Los apellidos de `AMBIGUOUS_ENYE` quedan fuera: cambiar «NINO» por «NIÑO»
 * sería cambiarle el apellido a la persona, no corregirle una tilde.
 */
export function toDatabaseName(text: string): string {
  return toDatabaseCase(restoreAccents(text, ACCENT_NAMES, AMBIGUOUS_ENYE));
}

export function toDatabasePlace(text: string): string {
  return toDatabaseCase(restoreAccents(text, ACCENT_PLACES));
}

export function toDatabaseText(text: string): string {
  return toDatabaseCase(restoreAccents(text, ACCENT_TEXT));
}

/** Convierte una fecha a número de serie de Excel (base 1899-12-30). */
export function toExcelSerial(date: ParsedDate): number {
  const utc = Date.UTC(date.year, date.month - 1, date.day);
  const base = Date.UTC(1899, 11, 30);
  return Math.round((utc - base) / 86400000);
}

function dateCell(text: string): number | null {
  const parsed = parseAnyDate(text);
  return parsed ? toExcelSerial(parsed) : null;
}

/** Texto equivalente a la fórmula PERIODO, p. ej. `2026 - 2`. */
export function computePeriodo(fechaRegistro: string): string {
  const parsed = parseAnyDate(fechaRegistro);
  if (!parsed) return '';
  return `${parsed.year} - ${parsed.month < 7 ? 1 : 2}`;
}

/**
 * Abreviatura de TIPO DE DOC a partir de `docformato`, con respaldo en
 * `TIPODOCUMENTO` cuando `docformato` viene vacío.
 */
export function tipoDeDocFor(docformato: string, tipodocumento: string): string {
  const key = collapseSpaces(docformato).toLowerCase();
  if (key) {
    if (key.includes('pasaporte')) return 'PS';
    if (key.includes('extranjer')) return 'CE';
    if (key.includes('tarjeta')) return 'TI';
    if (key.includes('ciudadan')) return 'CC';
  }
  return dbAbbreviationFor(parseDocumentType(tipodocumento));
}

export interface DatabaseBuildOptions {
  /** `true` para enviar la fórmula de PERIODO; `false` para el texto calculado. */
  usePeriodoFormula?: boolean;
  /** Columnas opcionales que la tabla destino sí tiene (p.ej. DIRECTOR FIRMANTE). */
  availableOptionalColumns?: string[];
}

/**
 * Arma las filas de Tabla3 para todo el lote.
 * `rows` y `allocation.positions` deben tener la misma longitud y orden.
 */
export function buildDatabaseRows(
  rows: StudentRow[],
  metadata: BatchMetadata,
  allocation: LedgerAllocation,
  options: DatabaseBuildOptions = {},
): DatabaseRow[] {
  const usePeriodoFormula = options.usePeriodoFormula ?? true;
  const optional = new Set(options.availableOptionalColumns ?? []);

  return rows.map((row, index) => {
    const position = allocation.positions[index];
    const consecutivo = allocation.consecutivos[index];
    const cell = (field: keyof typeof row.cells) => row.cells[field]?.value ?? '';

    // En la plantilla la cédula va como texto con separador de miles
    // («1.026.286.605»); en la base es un número, y el formato `#,##0` de la
    // columna es el que muestra los separadores. El pasaporte va como texto.
    const numeroRaw = normalizeNumericCell(cell('numerodocumento')).trim();
    const soloDigitos = cleanNationalId(numeroRaw);
    const esNumerico = soloDigitos.length > 0 && /^[\d.]+$/.test(numeroRaw);
    const numero = esNumerico ? Number(soloDigitos) : numeroRaw;

    // El valor de la fila manda; la metadata del lote es el respaldo.
    const curso = collapseSpaces(cell('titulo') || metadata.curso);
    const intensidadRaw = collapseSpaces(cell('intensidad') || metadata.intensidad);
    const intensidad = Number(intensidadRaw.replace(',', '.'));
    const fechaRegistro = cell('fechaemite') || metadata.fechaRegistro;

    // `fechainicio` puede traer el rango completo del curso: de ahí salen las
    // dos fechas de la base, incluida la finalización que antes quedaba vacía.
    const inicioTexto = cell('fechainicio') || metadata.fechaInicio;
    const rango = parseDateRange(inicioTexto);

    const built: DatabaseRow = {
      N: consecutivo,
      LIBRO: position.libro,
      FOLIO: position.folio,
      REG: position.registro,
      APELLIDOS: toDatabaseName(cell('apellidos')),
      NOMBRES: toDatabaseName(cell('nombres')),
      'TIPO DE DOC': tipoDeDocFor(cell('docformato'), cell('tipodocumento')),
      'DOCUMENTO DE IDENTIDAD': numero,
      'LUGAR EXPEDICION': toDatabasePlace(cell('lugarexpedicion')),
      'NOMBRE DEL CURSO': toDatabaseText(curso),
      'FECHA INICIO': rango ? toExcelSerial(rango.start) : dateCell(inicioTexto),
      // Solo se llena cuando `fechainicio` viene como rango; si trae una fecha
      // suelta no hay de dónde sacarla y queda vacía.
      'FECHA FINALIZACION': rango ? toExcelSerial(rango.end) : null,
      'FECHA DE REGISTRO': dateCell(fechaRegistro),
      PERIODO: usePeriodoFormula ? PERIODO_FORMULA : computePeriodo(fechaRegistro),
      AÑO: parseAnyDate(fechaRegistro)?.year ?? null,
      INTENSIDAD: Number.isFinite(intensidad) ? intensidad : null,
      'OFICINA RESPONSABLE': metadata.oficina,
      OBSEVACIONES: collapseSpaces(cell('nomfirma1')) || null,
    };

    if (optional.has('DIRECTOR FIRMANTE')) {
      built['DIRECTOR FIRMANTE'] = collapseSpaces(cell('nomfirma3')) || null;
    }

    return built;
  });
}

/** Columnas efectivas de la inserción, en orden. */
export function effectiveColumns(
  availableOptionalColumns: string[] = [],
): (DbColumn | DbOptionalColumn)[] {
  const optional = DB_OPTIONAL_COLUMNS.filter((column) =>
    availableOptionalColumns.includes(column),
  );
  return [...DB_COLUMNS, ...optional];
}

/** Convierte las filas al arreglo bidimensional que espera Microsoft Graph. */
export function toGraphMatrix(
  rows: DatabaseRow[],
  availableOptionalColumns: string[] = [],
): (string | number | null)[][] {
  const columns = effectiveColumns(availableOptionalColumns);
  return rows.map((row) => columns.map((column) => row[column] ?? null));
}

/** Columnas de fecha, que en el CSV se muestran legibles y no como serial. */
const DATE_COLUMNS = new Set<string>([
  'FECHA INICIO',
  'FECHA FINALIZACION',
  'FECHA DE REGISTRO',
]);

/** Convierte un serial de Excel a `dd/mm/aaaa`. */
export function serialToDisplay(serial: number): string {
  const millis = Date.UTC(1899, 11, 30) + serial * 86400000;
  const date = new Date(millis);
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getUTCFullYear()}`;
}

/**
 * Vuelca las filas a CSV, como respaldo descargable del lote.
 *
 * A diferencia del envío por API, aquí las fechas van como `dd/mm/aaaa`:
 * el CSV lo abre una persona y pega el contenido en la Base de Datos, donde
 * un serial suelto («46034») no se entiende.
 */
export function toCsv(rows: DatabaseRow[], availableOptionalColumns: string[] = []): string {
  const columns = effectiveColumns(availableOptionalColumns);
  const escape = (value: string | number | null | undefined): string => {
    if (value === null || value === undefined) return '';
    const text = String(value);
    return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const render = (column: string, value: string | number | null | undefined) => {
    if (DATE_COLUMNS.has(column) && typeof value === 'number') return serialToDisplay(value);
    return escape(value);
  };

  const header = columns.join(';');
  const body = rows.map((row) => columns.map((column) => render(column, row[column])).join(';'));
  return [header, ...body].join('\r\n');
}
