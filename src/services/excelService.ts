/**
 * excelService.ts
 * Lectura de la plantilla Xertify y reescritura del archivo corregido.
 *
 * La plantilla real («Plantilla Cursos Extensión.xlsx») tiene:
 *   - hoja `People`   → fila 1: leyendas (Obligatorio/Opcional)
 *                        fila 2: encabezados reales
 *                        fila 3+: datos
 *   - hoja `Parameters` → listas de validación (se conserva intacta)
 */

import * as XLSX from 'xlsx';

import { FIELD_LIST, FIELD_SPECS } from '../data/fields';
import {
  CANONICAL_FIELDS,
  TEMPLATE_FIRST_DATA_ROW,
  TEMPLATE_HEADER_ROW,
  TEMPLATE_HEADERS,
  TEMPLATE_SHEET,
  type CanonicalField,
  type CellState,
  type ColumnMapping,
  type HeaderMapResult,
  type StudentRow,
} from '../types';
import { formatSpanish, parseAnyDate } from './dateService';
import { collapseSpaces, normalizeKey, similarity, toDisplayTitle, toText } from './textUtils';

/* ------------------------------------------------------------------ */
/* Detección de encabezados                                            */
/* ------------------------------------------------------------------ */

/** Alias normalizado → campo canónico. */
const ALIAS_INDEX = new Map<string, CanonicalField>();
for (const spec of FIELD_LIST) {
  ALIAS_INDEX.set(normalizeKey(spec.header), spec.field);
  for (const alias of spec.aliases) ALIAS_INDEX.set(normalizeKey(alias), spec.field);
}

/** Resuelve un encabezado a su campo canónico. */
export function resolveHeader(header: string): { field: CanonicalField | null; confidence: number } {
  const key = normalizeKey(header);
  if (!key) return { field: null, confidence: 0 };

  const exact = ALIAS_INDEX.get(key);
  if (exact) return { field: exact, confidence: 1 };

  let best: { field: CanonicalField; score: number } | null = null;
  for (const [alias, field] of ALIAS_INDEX) {
    const score = similarity(key, alias);
    if (!best || score > best.score) best = { field, score };
  }
  return best && best.score >= 0.82
    ? { field: best.field, confidence: best.score }
    : { field: null, confidence: best?.score ?? 0 };
}

/** Puntúa una fila candidata a encabezado. */
function scoreHeaderRow(cells: unknown[]): number {
  let hits = 0;
  for (const cell of cells) {
    const text = toText(cell).trim();
    if (!text) continue;
    if (resolveHeader(text).field) hits += 1;
  }
  return hits;
}

/* ------------------------------------------------------------------ */
/* Lectura                                                              */
/* ------------------------------------------------------------------ */

export interface ParsedTemplate {
  workbook: XLSX.WorkBook;
  /**
   * Bytes originales del archivo. Se guardan para poder devolver el mismo
   * .xlsx con solo las celdas corregidas, sin reconstruirlo: la plantilla de
   * Xertify lleva validaciones y formatos que no sobreviven a una reescritura.
   */
  buffer: ArrayBuffer;
  sheetName: string;
  headerRow: number;
  firstDataRow: number;
  /** Matriz cruda de la hoja de datos, incluidas las filas de leyenda. */
  matrix: unknown[][];
  map: HeaderMapResult;
  rows: StudentRow[];
  activeFields: Set<CanonicalField>;
  fileName: string;
}

/** Convierte el valor de una celda a texto, respetando el tipo del campo. */
function cellToText(value: unknown, field: CanonicalField | null): string {
  if (value === null || value === undefined) return '';

  const isDateField = field ? FIELD_SPECS[field].kind === 'fecha-es' : false;

  if (value instanceof Date) {
    const parsed = parseAnyDate(value);
    return parsed ? formatSpanish(parsed) : value.toISOString().slice(0, 10);
  }

  if (typeof value === 'number') {
    // Un número en una columna de fecha es casi seguro un serial de Excel.
    if (isDateField) {
      const parsed = parseAnyDate(value);
      if (parsed) return formatSpanish(parsed);
    }
    return Number.isInteger(value) ? String(value) : String(value);
  }

  return toText(value).replace(/ /g, ' ');
}

/** Lee un archivo .xlsx/.xls y arma el lote de auditoría. */
export async function readTemplate(file: File): Promise<ParsedTemplate> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { cellDates: true, cellNF: false, cellText: false });

  const sheetName =
    workbook.SheetNames.find((name) => normalizeKey(name) === normalizeKey(TEMPLATE_SHEET)) ??
    workbook.SheetNames[0];

  if (!sheetName) throw new Error('El archivo no contiene ninguna hoja legible.');

  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: '',
    blankrows: true,
  });

  if (!matrix.length) throw new Error(`La hoja «${sheetName}» está vacía.`);

  // Busca la fila de encabezados: se espera la 2, pero se tolera otra.
  let headerRow = TEMPLATE_HEADER_ROW;
  let bestScore = -1;
  const limit = Math.min(matrix.length, 8);
  for (let i = 0; i < limit; i += 1) {
    const score = scoreHeaderRow(matrix[i] ?? []);
    if (score > bestScore) {
      bestScore = score;
      headerRow = i + 1;
    }
  }
  if (bestScore <= 0) {
    throw new Error(
      'No se reconoció ninguna fila de encabezados. Verifique que sea la plantilla de Xertify.',
    );
  }

  const headers = (matrix[headerRow - 1] ?? []).map((cell) => toText(cell).trim());

  const mappings: ColumnMapping[] = headers.map((header, index) => {
    const { field, confidence } = resolveHeader(header);
    return { header, index, field, manual: false, confidence };
  });

  // Un mismo campo no puede quedar asignado a dos columnas: gana la de mayor confianza.
  const bestByField = new Map<CanonicalField, ColumnMapping>();
  for (const mapping of mappings) {
    if (!mapping.field) continue;
    const previous = bestByField.get(mapping.field);
    if (!previous || mapping.confidence > previous.confidence) {
      if (previous) previous.field = null;
      bestByField.set(mapping.field, mapping);
    } else {
      mapping.field = null;
    }
  }

  const activeFields = new Set<CanonicalField>(bestByField.keys());

  const missingRequired = FIELD_LIST.filter(
    (spec) => spec.requirement !== 'opcional' && !activeFields.has(spec.field),
  ).map((spec) => spec.field);

  const seenHeaders = new Set<string>();
  const duplicates: string[] = [];
  for (const header of headers) {
    const key = normalizeKey(header);
    if (!key) continue;
    if (seenHeaders.has(key)) duplicates.push(header);
    seenHeaders.add(key);
  }

  const firstDataRow = Math.max(headerRow + 1, TEMPLATE_FIRST_DATA_ROW - (TEMPLATE_HEADER_ROW - headerRow));
  const rows = buildRows(matrix, headerRow, mappings);

  return {
    workbook,
    buffer,
    sheetName,
    headerRow,
    firstDataRow,
    matrix,
    map: { mappings, missingRequired, duplicates, headerRow, sheetName },
    rows,
    activeFields,
    fileName: file.name,
  };
}

/** Construye las filas del lote desde la matriz cruda. */
export function buildRows(
  matrix: unknown[][],
  headerRow: number,
  mappings: ColumnMapping[],
): StudentRow[] {
  const rows: StudentRow[] = [];

  for (let r = headerRow; r < matrix.length; r += 1) {
    const raw = matrix[r] ?? [];
    const hasContent = raw.some((cell) => toText(cell).trim() !== '');
    if (!hasContent) continue;

    const cells = {} as Record<CanonicalField, CellState>;
    for (const field of CANONICAL_FIELDS) {
      cells[field] = { value: '', original: '', issues: [], fixedBy: 'none' };
    }

    const passthrough: Record<string, string> = {};

    for (const mapping of mappings) {
      const text = cellToText(raw[mapping.index], mapping.field);
      if (mapping.field) {
        cells[mapping.field] = { value: text, original: text, issues: [], fixedBy: 'none' };
      } else if (mapping.header) {
        passthrough[mapping.header] = text;
      }
    }

    rows.push({
      id: `row-${r + 1}`,
      excelRow: r + 1,
      cells,
      passthrough,
    });
  }

  return rows;
}

/** Reasigna manualmente una columna a otro campo canónico. */
export function remapColumn(
  parsed: ParsedTemplate,
  columnIndex: number,
  field: CanonicalField | null,
): ParsedTemplate {
  const mappings = parsed.map.mappings.map((mapping) => {
    if (mapping.index === columnIndex) return { ...mapping, field, manual: true, confidence: 1 };
    if (field && mapping.field === field) return { ...mapping, field: null };
    return mapping;
  });

  const activeFields = new Set<CanonicalField>(
    mappings.map((m) => m.field).filter((f): f is CanonicalField => f !== null),
  );

  const missingRequired = FIELD_LIST.filter(
    (spec) => spec.requirement !== 'opcional' && !activeFields.has(spec.field),
  ).map((spec) => spec.field);

  return {
    ...parsed,
    map: { ...parsed.map, mappings, missingRequired },
    activeFields,
    rows: buildRows(parsed.matrix, parsed.headerRow, mappings),
  };
}

/* ------------------------------------------------------------------ */
/* Escritura del archivo corregido                                     */
/* ------------------------------------------------------------------ */

/**
 * Reconstruye el archivo con los valores corregidos, conservando las demás
 * hojas (incluida `Parameters`, con sus listas) y las columnas no mapeadas.
 */
export function buildCorrectedWorkbook(
  parsed: ParsedTemplate,
  rows: StudentRow[],
): XLSX.WorkBook {
  const { workbook, sheetName, headerRow, matrix, map } = parsed;

  // Encabezado: se conservan las filas previas (leyendas) tal cual.
  const output: unknown[][] = [];
  for (let r = 0; r < headerRow; r += 1) {
    output.push([...(matrix[r] ?? [])]);
  }

  const columnCount = Math.max(
    map.mappings.length,
    ...output.map((line) => line.length),
    TEMPLATE_HEADERS.length,
  );

  for (const row of rows) {
    const line: unknown[] = new Array(columnCount).fill('');
    for (const mapping of map.mappings) {
      if (mapping.field) {
        line[mapping.index] = row.cells[mapping.field]?.value ?? '';
      } else if (mapping.header) {
        line[mapping.index] = row.passthrough[mapping.header] ?? '';
      }
    }
    output.push(line);
  }

  const nextSheet = XLSX.utils.aoa_to_sheet(output);

  // Anchos de columna razonables para revisión visual.
  nextSheet['!cols'] = map.mappings.map((mapping) =>
    mapping.field ? { wch: Math.round(FIELD_SPECS[mapping.field].width / 8) } : { wch: 16 },
  );

  const nextWorkbook: XLSX.WorkBook = {
    ...workbook,
    Sheets: { ...workbook.Sheets, [sheetName]: nextSheet },
  };

  return nextWorkbook;
}

/** Serializa el libro a bytes descargables. */
export function workbookToBlob(workbook: XLSX.WorkBook): Blob {
  const array = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  return new Blob([array], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/** Dispara la descarga en el navegador. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Bytes a base64, por trozos para no reventar la pila con archivos grandes. */
export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binario = '';
  const TROZO = 0x8000;
  for (let i = 0; i < bytes.length; i += TROZO) {
    binario += String.fromCharCode(...bytes.subarray(i, i + TROZO));
  }
  return btoa(binario);
}

/** El camino de vuelta: base64 a un archivo descargable. */
export function base64ToBlob(base64: string, type: string): Blob {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  return new Blob([bytes], { type });
}

/** Fecha de un ISO timestamp en formato `dd-mm-aaaa`, para usar en nombres de archivo. */
export function fileDateFromIso(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const dia = String(date.getDate()).padStart(2, '0');
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  return `${dia}-${mes}-${date.getFullYear()}`;
}

/** Quita del nombre de archivo los caracteres que Windows no admite. */
function sanitizeFileNamePart(text: string): string {
  return collapseSpaces(text.replace(/[\\/:*?"<>|]/g, ' ')).trim();
}

/**
 * Nombre sugerido para el archivo corregido: `Plantilla Xertify - <curso> -
 * <fecha>.xlsx`. Si el curso viene vacío se usa el nombre original como
 * respaldo, para no dejar el archivo sin identificar.
 */
export function correctedFileName(curso: string, fecha: string, original?: string): string {
  const nombreCurso = sanitizeFileNamePart(curso ? toDisplayTitle(curso) : '');
  const nombreFecha = sanitizeFileNamePart(fecha);
  if (!nombreCurso) {
    const base = (original ?? 'Plantilla Xertify').replace(/\.(xlsx|xlsm|xls)$/i, '');
    return nombreFecha ? `${base} — ${nombreFecha}.xlsx` : `${base}.xlsx`;
  }
  return nombreFecha
    ? `Plantilla Xertify - ${nombreCurso} - ${nombreFecha}.xlsx`
    : `Plantilla Xertify - ${nombreCurso}.xlsx`;
}

/**
 * Nombre sugerido para la plantilla con las novedades marcadas en amarillo.
 * No lleva número de registro: todavía no se ha registrado nada, porque el
 * lote sigue con errores.
 */
export function annotatedFileName(original: string): string {
  const base = original.replace(/\.(xlsx|xlsm|xls)$/i, '');
  return `${base} — NOVEDADES.xlsx`;
}
