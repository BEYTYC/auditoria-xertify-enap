/**
 * xlsxPatchService.ts
 * Reescritura quirúrgica del archivo que subió la facultad.
 *
 * La plantilla de Xertify no es una hoja cualquiera: trae listas de validación,
 * formatos, nombres definidos y una hoja `Parameters` de la que dependen los
 * desplegables. Si el archivo se reconstruye con una librería de escritura,
 * todo eso se pierde y Xertify rechaza el cargue.
 *
 * Por eso aquí no se genera un libro nuevo: se abre el .xlsx original —que es
 * un zip—, se cambian únicamente las celdas corregidas dentro de la hoja de
 * datos y se vuelve a cerrar el zip. Cada parte que no se toca sale byte por
 * byte igual que como entró.
 */

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

import type { ColumnMapping, StudentRow } from '../types';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Comilla doble, para armar los patrones de OOXML sin escribir `atributo="` en
 * el código: ese literal, dentro del paquete publicado, se confunde con un
 * enlace de la propia página y hace fallar la validación al publicarla.
 */
const Q = String.fromCharCode(34);

/* ------------------------------------------------------------------ */
/* Utilidades de referencia de celda                                    */
/* ------------------------------------------------------------------ */

/** 0 → `A`, 25 → `Z`, 26 → `AA`. */
export function columnLetter(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rest = (n - 1) % 26;
    out = String.fromCharCode(65 + rest) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** `AB12` → `{ column: 27, row: 12 }` (columna en base 0). */
export function parseRef(ref: string): { column: number; row: number } | null {
  const match = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!match) return null;
  let column = 0;
  for (const character of match[1]) column = column * 26 + (character.charCodeAt(0) - 64);
  return { column: column - 1, row: Number(match[2]) };
}

/** Escapa lo que no puede ir crudo dentro de un nodo de texto XML. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ------------------------------------------------------------------ */
/* Localización de la hoja dentro del paquete                           */
/* ------------------------------------------------------------------ */

/** Ruta interna del XML de la hoja cuyo nombre visible es `sheetName`. */
function findSheetPath(files: Record<string, Uint8Array>, sheetName: string): string {
  const workbook = strFromU8(files['xl/workbook.xml'] ?? new Uint8Array());
  const rels = strFromU8(files['xl/_rels/workbook.xml.rels'] ?? new Uint8Array());

  const sheetTag = [...workbook.matchAll(/<sheet\b[^>]*\/?>/g)]
    .map((match) => match[0])
    .find((tag) => {
      const name = new RegExp(`\\sname=${Q}([^${Q}]*)${Q}`).exec(tag)?.[1];
      return name !== undefined && decodeXmlAttribute(name) === sheetName;
    });

  const relId = sheetTag
    ? new RegExp(`r:id=${Q}([^${Q}]+)${Q}`).exec(sheetTag)?.[1]
    : undefined;

  if (relId) {
    const relTag = [...rels.matchAll(/<Relationship\b[^>]*\/?>/g)]
      .map((match) => match[0])
      .find((tag) => tag.includes(`Id=${Q}${relId}${Q}`));
    const target = relTag
      ? new RegExp(`Target=${Q}([^${Q}]+)${Q}`).exec(relTag)?.[1]
      : undefined;
    if (target) {
      const clean = target.replace(/^\/?xl\//, '').replace(/^\//, '');
      const path = `xl/${clean}`;
      if (files[path]) return path;
    }
  }

  // Sin relación utilizable: la primera hoja del paquete.
  const fallback = Object.keys(files).find((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name));
  if (!fallback) throw new Error('El archivo no contiene ninguna hoja de cálculo legible.');
  return fallback;
}

function decodeXmlAttribute(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/* ------------------------------------------------------------------ */
/* Reescritura de la hoja de datos                                      */
/* ------------------------------------------------------------------ */

const ROW_PATTERN = /<row\b[^>]*\/>|<row\b[^>]*>[\s\S]*?<\/row>/g;
const CELL_PATTERN = /<c\b[^>]*\/>|<c\b[^>]*>[\s\S]*?<\/c>/g;

interface OriginalRow {
  /** Atributos del `<row …>` sin `r`, para conservar alto y estilo. */
  attributes: string;
  /** Celdas de la fila, por índice de columna, con su XML original. */
  cells: Map<number, { xml: string; style: string }>;
}

/** Descompone las filas del `<sheetData>` en algo manipulable. */
function indexRows(sheetData: string): Map<number, OriginalRow> {
  const out = new Map<number, OriginalRow>();

  for (const match of sheetData.matchAll(ROW_PATTERN)) {
    const xml = match[0];
    const openTag = /^<row\b[^>]*>/.exec(xml)?.[0] ?? xml;
    const rowNumber = Number(/\sr="(\d+)"/.exec(openTag)?.[1] ?? '0');
    if (!rowNumber) continue;

    const attributes = openTag
      .replace(/^<row/, '')
      .replace(/\/?>$/, '')
      .replace(/\sr="\d+"/, '')
      .replace(/\sspans="[^"]*"/, '');

    const cells = new Map<number, { xml: string; style: string }>();
    for (const cellMatch of xml.matchAll(CELL_PATTERN)) {
      const cellXml = cellMatch[0];
      const ref = /\sr="([A-Z]+\d+)"/.exec(cellXml)?.[1];
      const parsed = ref ? parseRef(ref) : null;
      if (!parsed) continue;
      cells.set(parsed.column, {
        xml: cellXml,
        style: /\ss="(\d+)"/.exec(cellXml)?.[1] ?? '',
      });
    }

    out.set(rowNumber, { attributes, cells });
  }

  return out;
}

/** `true` si la fila original traía algún valor, no solo formato. */
function hasContent(row: OriginalRow): boolean {
  for (const cell of row.cells.values()) {
    if (/<v>|<is>/.test(cell.xml)) return true;
  }
  return false;
}

/** Celda de texto, respetando el estilo que tenía la celda original. */
function textCell(ref: string, style: string, value: string): string {
  const s = style ? ` s="${style}"` : '';
  if (!value) return `<c r="${ref}"${s}/>`;
  return (
    `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">` +
    `${escapeXml(value)}</t></is></c>`
  );
}

/**
 * Estilo declarado por columna en `<cols>`. Es el formato propio de la
 * plantilla, independiente de lo que traigan las filas: sirve de respaldo
 * cuando ya no queda ninguna fila vacía de la que copiarlo.
 */
function columnStyles(sheetXml: string): Map<number, string> {
  const out = new Map<number, string>();
  const bloque = /<cols>[\s\S]*?<\/cols>/.exec(sheetXml)?.[0];
  if (!bloque) return out;

  for (const match of bloque.matchAll(/<col\b[^>]*\/>/g)) {
    const tag = match[0];
    const min = Number(new RegExp(`\\smin=${Q}(\\d+)${Q}`).exec(tag)?.[1] ?? '0');
    const max = Number(new RegExp(`\\smax=${Q}(\\d+)${Q}`).exec(tag)?.[1] ?? '0');
    const style = new RegExp(`\\sstyle=${Q}(\\d+)${Q}`).exec(tag)?.[1];
    if (!min || !max || !style) continue;
    for (let columna = min; columna <= max && columna <= 1024; columna += 1) {
      out.set(columna - 1, style);
    }
  }
  return out;
}

/** Cambia el estilo de una celda dejando su contenido intacto. */
function restyleCell(xml: string, style: string): string {
  const sinEstilo = xml.replace(/\ss="\d+"/, '');
  if (!style) return sinEstilo;
  return sinEstilo.replace(/^<c\b/, `<c s="${style}"`);
}

/** Reubica una celda original en otra fila, cambiando solo su referencia. */
function moveCell(xml: string, column: number, rowNumber: number): string {
  return xml.replace(/\sr="[A-Z]+\d+"/, ` r="${columnLetter(column)}${rowNumber}"`);
}

export interface PatchOptions {
  /** Nombre visible de la hoja de datos («People»). */
  sheetName: string;
  /** Primera fila con datos (1-based). */
  firstDataRow: number;
  /** Columnas reconocidas de la plantilla. */
  mappings: ColumnMapping[];
}

/**
 * Devuelve el mismo archivo que se subió, con las celdas corregidas.
 *
 * Las filas que el responsable retiró del lote no se escriben, y las demás
 * quedan consecutivas desde `firstDataRow`. Todo lo que está fuera de la zona
 * de datos —leyendas, encabezados, validaciones, `Parameters`— no se toca.
 */
export function patchTemplate(
  original: ArrayBuffer,
  rows: StudentRow[],
  options: PatchOptions,
): Blob {
  const files = unzipSync(new Uint8Array(original));
  const sheetPath = findSheetPath(files, options.sheetName);
  const xml = strFromU8(files[sheetPath]);

  const openMatch = /<sheetData\b[^>]*>/.exec(xml);
  if (!openMatch) {
    // Hoja sin datos: no hay nada que corregir.
    return new Blob([zipSync(files)], { type: XLSX_MIME });
  }

  const start = openMatch.index + openMatch[0].length;
  const end = xml.indexOf('</sheetData>', start);
  if (end === -1) return new Blob([zipSync(files)], { type: XLSX_MIME });

  const sheetData = xml.slice(start, end);
  const originals = indexRows(sheetData);

  // La plantilla llega de mil maneras: filas pegadas de otro archivo, con la
  // letra, el relleno y el alto que traía su origen. El archivo que sale tiene
  // que verse parejo, así que todas las filas de datos adoptan un mismo
  // formato.
  //
  // Como modelo se prefiere una fila vacía del área de datos: esas conservan el
  // formato original de la plantilla, sin lo que haya traído pegado quien la
  // diligenció. Si no hay ninguna, se usa la primera fila de datos.
  // Se busca una fila vacía dentro del área de datos: esas conservan el formato
  // limpio de la plantilla, sin lo que haya traído pegado quien la diligenció.
  // Si no hay ninguna, las filas salen sin formato propio, que es el aspecto
  // llano de la plantilla en blanco: nunca se copia el de una fila pegada.
  const modelo =
    [...originals.entries()]
      .filter(([number]) => number >= options.firstDataRow)
      .sort((a, b) => a[0] - b[0])
      .find(([, row]) => !hasContent(row))?.[1] ?? null;

  const porColumna = columnStyles(xml);

  // Las filas anteriores a los datos —leyendas y encabezados— salen igual.
  const preserved: string[] = [];
  for (const match of sheetData.matchAll(ROW_PATTERN)) {
    const rowNumber = Number(/\sr="(\d+)"/.exec(match[0])?.[1] ?? '0');
    if (rowNumber && rowNumber < options.firstDataRow) preserved.push(match[0]);
  }

  const rebuilt: string[] = [];
  let target = options.firstDataRow;

  for (const row of rows) {
    const source = originals.get(row.excelRow);
    const attributes = modelo?.attributes ?? '';
    const estiloDe = (column: number) =>
      modelo?.cells.get(column)?.style ?? porColumna.get(column) ?? '';
    const cells: { column: number; xml: string }[] = [];

    // Columnas que la app audita: se escribe el valor ya corregido.
    const audited = new Set<number>();
    for (const mapping of options.mappings) {
      if (!mapping.field) continue;
      audited.add(mapping.index);
      const value = row.cells[mapping.field]?.value ?? '';
      cells.push({
        column: mapping.index,
        xml: textCell(
          `${columnLetter(mapping.index)}${target}`,
          estiloDe(mapping.index),
          value,
        ),
      });
    }

    // Las demás columnas conservan su contenido, pero toman el formato de la
    // primera fila para que la hoja se vea pareja.
    if (source) {
      for (const [column, cell] of source.cells) {
        if (audited.has(column)) continue;
        cells.push({
          column,
          xml: restyleCell(moveCell(cell.xml, column, target), estiloDe(column)),
        });
      }
    }

    cells.sort((a, b) => a.column - b.column);
    rebuilt.push(`<row r="${target}"${attributes}>${cells.map((c) => c.xml).join('')}</row>`);
    target += 1;
  }

  // La plantilla trae cientos de filas vacías ya formateadas —el área que la
  // facultad rellena—. Se conservan detrás de los datos, renumeradas, para que
  // el archivo conserve su aspecto y su rango protegido.
  const usadas = new Set(rows.map((row) => row.excelRow));
  const ultimaOriginal = Math.max(...originals.keys());
  const vacias = [...originals.entries()]
    .filter(([number]) => number >= options.firstDataRow && !usadas.has(number))
    .filter(([, row]) => !hasContent(row))
    .sort((a, b) => a[0] - b[0]);

  for (const [, row] of vacias) {
    if (target > ultimaOriginal) break;
    const cells = [...row.cells.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([column, cell]) => moveCell(cell.xml, column, target));
    rebuilt.push(`<row r="${target}"${row.attributes}>${cells.join('')}</row>`);
    target += 1;
  }

  const nextXml =
    xml.slice(0, start) + preserved.join('') + rebuilt.join('') + xml.slice(end);
  files[sheetPath] = strToU8(nextXml);

  // La cadena de cálculo apunta a fórmulas que quizá ya no existan; Excel la
  // reconstruye sola, y dejarla desactualizada es lo que dispara el aviso de
  // «archivo dañado».
  dropCalcChain(files);
  normalizeFonts(files);

  return new Blob([zipSync(files)], { type: XLSX_MIME });
}

/**
 * Deja toda la hoja en Aptos 11.
 *
 * Se toca únicamente la tipografía y el tamaño de cada fuente declarada; la
 * negrita, la cursiva y los colores se respetan, así que el encabezado sigue
 * viéndose como el encabezado. Es lo que hace que dos plantillas llenadas en
 * equipos distintos salgan idénticas.
 */
function normalizeFonts(files: Record<string, Uint8Array>): void {
  const ruta = 'xl/styles.xml';
  if (!files[ruta]) return;

  const xml = strFromU8(files[ruta])
    .replace(new RegExp(`<sz val=${Q}[^${Q}]*${Q}\\s*/>`, 'g'), `<sz val=${Q}11${Q}/>`)
    .replace(new RegExp(`<name val=${Q}[^${Q}]*${Q}\\s*/>`, 'g'), `<name val=${Q}Aptos${Q}/>`)
    // El «scheme» remite a la fuente del tema y le ganaría al nombre.
    .replace(/<scheme val=[^/]*\/>/g, '');

  files[ruta] = strToU8(xml);
}

/** Quita `calcChain.xml` y las dos referencias que lo declaran. */
function dropCalcChain(files: Record<string, Uint8Array>): void {
  if (!files['xl/calcChain.xml']) return;
  delete files['xl/calcChain.xml'];

  const types = '[Content_Types].xml';
  if (files[types]) {
    const xml = strFromU8(files[types]).replace(
      new RegExp(`<Override\\b[^>]*PartName=${Q}/xl/calcChain\\.xml${Q}[^>]*/>`, 'g'),
      '',
    );
    files[types] = strToU8(xml);
  }

  const rels = 'xl/_rels/workbook.xml.rels';
  if (files[rels]) {
    const xml = strFromU8(files[rels]).replace(
      new RegExp(`<Relationship\\b[^>]*Target=${Q}calcChain\\.xml${Q}[^>]*/>`, 'g'),
      '',
    );
    files[rels] = strToU8(xml);
  }
}
