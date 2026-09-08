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

/**
 * Oculta una hoja del libro por su nombre visible (no toca su contenido).
 *
 * La hoja `Parameters` alimenta los desplegables de la plantilla, pero no es
 * algo que la facultad o la Oficina de Estadística deban andar mirando ni
 * editando por accidente, así que el archivo que se entrega siempre la trae
 * oculta, sin importar si venía oculta o visible en la plantilla original.
 */
function hideSheetByName(files: Record<string, Uint8Array>, sheetName: string): void {
  const path = 'xl/workbook.xml';
  const workbook = strFromU8(files[path] ?? new Uint8Array());
  if (!workbook) return;

  const tag = [...workbook.matchAll(/<sheet\b[^>]*\/?>/g)]
    .map((match) => match[0])
    .find((candidate) => {
      const name = new RegExp(`\\sname=${Q}([^${Q}]*)${Q}`).exec(candidate)?.[1];
      return name !== undefined && decodeXmlAttribute(name) === sheetName;
    });
  if (!tag) return;

  const sinEstado = tag.replace(new RegExp(`\\sstate=${Q}[^${Q}]*${Q}`), '');
  const oculto = sinEstado.replace(/^<sheet\b/, `<sheet state=${Q}hidden${Q}`);

  files[path] = strToU8(workbook.replace(tag, oculto));
}

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
  hideSheetByName(files, 'Parameters');
  setZoom100(files);

  // El archivo que subió la facultad puede venir de una descarga previa de
  // `annotateTemplate` (amarillos + comentarios) a la que solo se le
  // corrigieron los VALORES en Excel, sin quitarle el resaltado. El registro
  // final nunca debe llevar amarillos ni comentarios, así que se limpian
  // aquí, sin importar de dónde vino el archivo.
  stripComments(files, sheetPath);

  return new Blob([zipSync(files)], { type: XLSX_MIME });
}

/**
 * Quita cualquier comentario clásico (VML) y su resaltado de relleno que la
 * hoja ya trajera —típicamente de una descarga previa de `annotateTemplate`
 * que el responsable solo corrigió por valor, sin limpiar el formato—.
 *
 * Elimina las partes `xl/commentsN.xml` y `xl/drawings/vmlDrawingN.vml`, el
 * `<legacyDrawing>` de la hoja, las relaciones que los declaran en el
 * `.rels` de la hoja y las entradas `Override` correspondientes en
 * `[Content_Types].xml`. No toca el relleno amarillo de las celdas: ese ya
 * queda sobrescrito por `estiloDe`, que en `patchTemplate` toma el estilo de
 * una fila modelo limpia, nunca el de la fila original.
 */
function stripComments(files: Record<string, Uint8Array>, sheetPath: string): void {
  const commentParts = Object.keys(files).filter((name) => /^xl\/comments\d*\.xml$/.test(name));
  const vmlParts = Object.keys(files).filter((name) =>
    /^xl\/drawings\/vmlDrawing\d*\.vml$/.test(name),
  );
  if (!commentParts.length && !vmlParts.length) return;

  for (const part of [...commentParts, ...vmlParts]) delete files[part];

  // `<legacyDrawing r:id="…"/>` en la hoja: es lo que le dice a Excel dónde
  // están los comentarios clásicos.
  const sheetXml = strFromU8(files[sheetPath] ?? new Uint8Array());
  const sinLegacy = sheetXml.replace(/<legacyDrawing\b[^>]*\/>/g, '');
  if (sinLegacy !== sheetXml) files[sheetPath] = strToU8(sinLegacy);

  // Relaciones de la hoja que apuntan a esas partes.
  const sheetMatch = /^xl\/worksheets\/sheet(\d+)\.xml$/.exec(sheetPath);
  if (sheetMatch) {
    const relsPath = `xl/worksheets/_rels/sheet${sheetMatch[1]}.xml.rels`;
    const rels = files[relsPath] ? strFromU8(files[relsPath]) : '';
    if (rels) {
      // Se identifican por su `Type` (termina en `/comments` o
      // `/vmlDrawing`), no por el nombre del archivo destino, para no
      // depender de cómo esté escrita la ruta relativa.
      const relacionesAEliminar = [...rels.matchAll(/<Relationship\b[^>]*\/>/g)]
        .map((match) => match[0])
        .filter((tag) => /Type="[^"]*\/(comments|vmlDrawing)"/.test(tag));

      let nextRels = rels;
      for (const tag of relacionesAEliminar) nextRels = nextRels.replace(tag, '');
      if (nextRels !== rels) {
        if (/<Relationships[^>]*>\s*<\/Relationships>/.test(nextRels)) {
          delete files[relsPath];
        } else {
          files[relsPath] = strToU8(nextRels);
        }
      }
    }
  }

  // Entradas de `[Content_Types].xml` para las partes borradas.
  const typesPath = '[Content_Types].xml';
  const types = files[typesPath] ? strFromU8(files[typesPath]) : '';
  if (types) {
    const nextTypes = types.replace(
      /<Override\b[^>]*PartName="\/xl\/comments\d*\.xml"[^>]*\/>/g,
      '',
    );
    if (nextTypes !== types) files[typesPath] = strToU8(nextTypes);
  }
}

/* ------------------------------------------------------------------ */
/* Señalización de novedades: amarillo + comentario, sin corregir       */
/* ------------------------------------------------------------------ */

export interface AnnotateOptions {
  /** Nombre visible de la hoja de datos («People»). */
  sheetName: string;
  /** Columnas reconocidas de la plantilla. */
  mappings: ColumnMapping[];
}

/** Referencia de celda («AB12») → mensajes de las novedades pendientes ahí. */
type IssueMap = Map<string, string[]>;

/**
 * Devuelve el mismo archivo que se subió —con el mismo formato de siempre—
 * pero sin corregir ni un solo valor: la Oficina de Estadística ya no
 * autocorrige dentro de la aplicación. En vez de eso, cada celda con una
 * novedad pendiente queda resaltada en amarillo y con un comentario de Excel
 * que explica qué hay que corregir. El responsable corrige en Excel y vuelve
 * a cargar la plantilla; en la siguiente descarga, la celda que ya quedó bien
 * pierde el amarillo y el comentario, porque ya no tiene novedad.
 */
export function annotateTemplate(
  original: ArrayBuffer,
  rows: StudentRow[],
  options: AnnotateOptions,
): Blob {
  const files = unzipSync(new Uint8Array(original));
  const sheetPath = findSheetPath(files, options.sheetName);

  const columnOf = new Map<string, number>();
  for (const mapping of options.mappings) {
    if (mapping.field) columnOf.set(mapping.field, mapping.index);
  }

  const issues: IssueMap = new Map();
  for (const row of rows) {
    for (const [field, cell] of Object.entries(row.cells)) {
      const column = columnOf.get(field);
      if (column === undefined || !cell.issues.length) continue;

      const ref = `${columnLetter(column)}${row.excelRow}`;
      const mensajes = cell.issues.map((issue) =>
        issue.suggestion && issue.suggestion !== cell.value
          ? `${issue.message} Sugerencia: «${issue.suggestion}».`
          : issue.message,
      );
      issues.set(ref, [...(issues.get(ref) ?? []), ...mensajes]);
    }
  }

  // Ajustes de formato que no dependen de las novedades: van siempre, tenga
  // o no el lote algo pendiente.
  applyColumnFormatting(files, sheetPath, rows, columnOf);

  if (issues.size > 0) {
    highlightCells(files, sheetPath, issues);
    attachComments(files, sheetPath, issues);
  }

  // El archivo que se entrega —tenga o no novedades— siempre sale con el
  // mismo formato: fuente Aptos, `Parameters` oculta y zoom al 100 %.
  dropCalcChain(files);
  normalizeFonts(files);
  hideSheetByName(files, 'Parameters');
  setZoom100(files);

  return new Blob([zipSync(files)], { type: XLSX_MIME });
}

/** Campos cuya columna debe leerse siempre alineada a la izquierda. */
const LEFT_ALIGN_FIELDS = ['apellidos', 'email'] as const;

/**
 * Campos de teléfono: si Excel ya convirtió el número en una celda numérica
 * —lo que la muestra en notación científica y le borra el «+»—, se guardan
 * como texto y la columna queda en formato de texto, para que no se vuelva a
 * dañar aunque alguien reescriba una celda a mano.
 */
const TEXT_FORMAT_FIELDS = ['telefono', 'telefono2'] as const;

/**
 * Ajustes de formato que no son novedades y no dependen de si el lote tiene
 * errores: alinea apellidos y correo a la izquierda, y deja el teléfono en
 * formato de texto. No cambia ningún valor —solo cómo se ve o se guarda—, así
 * que corre siempre, tenga o no el lote algo pendiente.
 */
function applyColumnFormatting(
  files: Record<string, Uint8Array>,
  sheetPath: string,
  rows: StudentRow[],
  columnOf: Map<string, number>,
): void {
  const leftAlignRefs = new Set<string>();
  const textRefs = new Set<string>();

  for (const row of rows) {
    for (const field of LEFT_ALIGN_FIELDS) {
      const column = columnOf.get(field);
      if (column !== undefined) leftAlignRefs.add(`${columnLetter(column)}${row.excelRow}`);
    }
    for (const field of TEXT_FORMAT_FIELDS) {
      const column = columnOf.get(field);
      if (column !== undefined) textRefs.add(`${columnLetter(column)}${row.excelRow}`);
    }
  }
  if (!leftAlignRefs.size && !textRefs.size) return;

  const xml = strFromU8(files[sheetPath]);
  const openMatch = /<sheetData\b[^>]*>/.exec(xml);
  if (!openMatch) return;
  const start = openMatch.index + openMatch[0].length;
  const end = xml.indexOf('</sheetData>', start);
  if (end === -1) return;

  const sheetData = xml.slice(start, end);
  const cache = new Map<string, number>();

  const rewritten = sheetData.replace(CELL_PATTERN, (cellXml) => {
    const ref = /\sr="([A-Z]+\d+)"/.exec(cellXml)?.[1];
    if (!ref) return cellXml;

    const left = leftAlignRefs.has(ref);
    const text = textRefs.has(ref);
    if (!left && !text) return cellXml;

    const originalStyle = Number(/\ss="(\d+)"/.exec(cellXml)?.[1] ?? '0');
    const key = `${originalStyle}|${left ? 1 : 0}|${text ? 1 : 0}`;
    const newStyle = resolveFormattedStyle(files, originalStyle, left, text, key, cache);

    let out = restyleCell(cellXml, String(newStyle));
    if (text) out = coerceToText(out);
    return out;
  });

  files[sheetPath] = strToU8(xml.slice(0, start) + rewritten + xml.slice(end));
}

/**
 * Da de alta —si hace falta— un estilo igual a `originalStyle` pero con la
 * alineación y/o el formato de texto pedidos, y devuelve su índice. Compone
 * con lo que ya tenga la celda (por ejemplo, con el amarillo de una novedad,
 * que se clona por separado): cada combinación de ajustes se cachea aparte.
 */
function resolveFormattedStyle(
  files: Record<string, Uint8Array>,
  originalStyle: number,
  left: boolean,
  text: boolean,
  key: string,
  cache: Map<string, number>,
): number {
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const path = 'xl/styles.xml';
  const xml = strFromU8(files[path] ?? new Uint8Array());
  const block = /<cellXfs\b[^>]*>[\s\S]*?<\/cellXfs>/.exec(xml);
  if (!block) {
    cache.set(key, originalStyle);
    return originalStyle;
  }

  const XF_PATTERN = /<xf\b[^>]*\/>|<xf\b[^>]*>[\s\S]*?<\/xf>/g;
  const entries = [...block[0].matchAll(XF_PATTERN)].map((match) => match[0]);
  let base = entries[originalStyle] ?? entries[0] ?? '<xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>';

  if (left) base = withAlignment(base, { horizontal: 'left' });
  if (text) base = withTextFormat(base);

  const newIndex = entries.length;
  entries.push(base);

  const newBlock = `<cellXfs count="${entries.length}">${entries.join('')}</cellXfs>`;
  files[path] = strToU8(xml.slice(0, block.index) + newBlock + xml.slice(block.index + block[0].length));

  cache.set(key, newIndex);
  return newIndex;
}

/** Fusiona atributos de `<alignment>` en un `<xf>`, conservando los que ya traía. */
function withAlignment(xfXml: string, extra: Record<string, string>): string {
  const isSelfClosing = /\/>\s*$/.test(xfXml);
  const openTag = isSelfClosing
    ? xfXml.replace(/\/>\s*$/, '>')
    : (/^<xf\b[^>]*>/.exec(xfXml)?.[0] ?? xfXml);
  const inner = isSelfClosing ? '' : xfXml.slice(openTag.length, xfXml.length - '</xf>'.length);

  const alignMatch = /<alignment\b([^>]*)\/>/.exec(inner);
  const attrs: Record<string, string> = {};
  if (alignMatch) {
    for (const m of alignMatch[1].matchAll(/(\w+)="([^"]*)"/g)) attrs[m[1]] = m[2];
  }
  Object.assign(attrs, extra);

  const alignmentTag = `<alignment ${Object.entries(attrs)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ')}/>`;
  const nextInner = alignMatch ? inner.replace(alignMatch[0], alignmentTag) : inner + alignmentTag;

  const tag = /\sapplyAlignment="1"/.test(openTag)
    ? openTag
    : openTag.replace(/^<xf\b/, '<xf applyAlignment="1"');

  return `${tag}${nextInner}</xf>`;
}

/** Fuerza el formato «Texto» (numFmtId 49, el `@` reservado de Excel) en un `<xf>`. */
function withTextFormat(xfXml: string): string {
  let out = xfXml.replace(/\snumFmtId="\d+"/, '').replace(/^<xf\b/, '<xf numFmtId="49"');
  if (!/\sapplyNumberFormat="1"/.test(out)) out = out.replace(/^<xf\b/, '<xf applyNumberFormat="1"');
  return out;
}

/**
 * Si la celda quedó guardada como número —lo que hace que Excel la muestre en
 * notación científica y le borre el «+»—, la vuelve texto sin tocar un solo
 * dígito: el valor sale exactamente igual, solo cambia cómo queda guardado.
 */
function coerceToText(cellXml: string): string {
  const type = /\st="([a-zA-Z]+)"/.exec(cellXml)?.[1];
  if (type && type !== 'n') return cellXml; // ya es texto, fórmula, error, etc.

  const value = /<v>([^<]*)<\/v>/.exec(cellXml)?.[1];
  if (value === undefined) return cellXml; // celda vacía: nada que convertir

  const ref = /\sr="[A-Z]+\d+"/.exec(cellXml)?.[0] ?? '';
  const style = /\ss="\d+"/.exec(cellXml)?.[0] ?? '';
  return `<c${ref}${style} t="inlineStr"><is><t xml:space="preserve">${value}</t></is></c>`;
}

/** Pinta de amarillo cada celda de `issues`, sin tocar su valor. */
function highlightCells(
  files: Record<string, Uint8Array>,
  sheetPath: string,
  issues: IssueMap,
): void {
  const xml = strFromU8(files[sheetPath]);
  const openMatch = /<sheetData\b[^>]*>/.exec(xml);
  if (!openMatch) return;

  const start = openMatch.index + openMatch[0].length;
  const end = xml.indexOf('</sheetData>', start);
  if (end === -1) return;

  const sheetData = xml.slice(start, end);
  const cache = new Map<number, number>();

  const porFila = new Map<number, string[]>();
  for (const ref of issues.keys()) {
    const parsed = parseRef(ref);
    if (!parsed) continue;
    porFila.set(parsed.row, [...(porFila.get(parsed.row) ?? []), ref]);
  }

  const rewritten = sheetData.replace(ROW_PATTERN, (rowXml) => {
    const rowNumber = Number(/\sr="(\d+)"/.exec(rowXml)?.[1] ?? '0');
    const refsEnFila = rowNumber ? porFila.get(rowNumber) : undefined;
    if (!refsEnFila?.length) return rowXml;

    const isSelfClosing = /\/>\s*$/.test(rowXml);
    const openTag = isSelfClosing
      ? rowXml.replace(/\/>\s*$/, '>')
      : (/^<row\b[^>]*>/.exec(rowXml)?.[0] ?? rowXml);
    const innerXml = isSelfClosing ? '' : rowXml.slice(openTag.length, rowXml.length - '</row>'.length);

    const cells = new Map<number, string>();
    for (const cellMatch of innerXml.matchAll(CELL_PATTERN)) {
      const cellXml = cellMatch[0];
      const ref = /\sr="([A-Z]+\d+)"/.exec(cellXml)?.[1];
      const parsed = ref ? parseRef(ref) : null;
      if (!parsed) continue;
      cells.set(parsed.column, cellXml);
    }

    for (const ref of refsEnFila) {
      const parsed = parseRef(ref);
      if (!parsed) continue;
      const existing = cells.get(parsed.column);
      const originalStyle = Number((existing ? /\ss="(\d+)"/.exec(existing)?.[1] : undefined) ?? '0');
      const highlighted = resolveHighlightStyle(files, originalStyle, cache);
      cells.set(
        parsed.column,
        existing ? restyleCell(existing, String(highlighted)) : `<c r="${ref}" s="${highlighted}"/>`,
      );
    }

    const ordenadas = [...cells.entries()].sort((a, b) => a[0] - b[0]).map(([, cellXml]) => cellXml);
    return `${openTag}${ordenadas.join('')}</row>`;
  });

  files[sheetPath] = strToU8(xml.slice(0, start) + rewritten + xml.slice(end));
}

/**
 * Da de alta —si hace falta— un estilo igual a `originalStyle` pero con
 * relleno amarillo, y devuelve su índice. Nunca se toca el estilo original:
 * otras celdas de la hoja lo siguen usando tal cual, así que se clona en vez
 * de modificarlo, y el clon se reutiliza para toda celda que compartía ese
 * mismo estilo.
 */
function resolveHighlightStyle(
  files: Record<string, Uint8Array>,
  originalStyle: number,
  cache: Map<number, number>,
): number {
  const cached = cache.get(originalStyle);
  if (cached !== undefined) return cached;

  const path = 'xl/styles.xml';
  const xml = strFromU8(files[path] ?? new Uint8Array());
  const block = /<cellXfs\b[^>]*>[\s\S]*?<\/cellXfs>/.exec(xml);
  if (!block) {
    cache.set(originalStyle, originalStyle);
    return originalStyle;
  }

  const XF_PATTERN = /<xf\b[^>]*\/>|<xf\b[^>]*>[\s\S]*?<\/xf>/g;
  const entries = [...block[0].matchAll(XF_PATTERN)].map((match) => match[0]);
  const base = entries[originalStyle] ?? entries[0] ?? '<xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>';

  const fillId = ensureYellowFill(files);
  const amarillo = withFill(base, fillId);

  const newIndex = entries.length;
  entries.push(amarillo);

  const newBlock = `<cellXfs count="${entries.length}">${entries.join('')}</cellXfs>`;
  files[path] = strToU8(xml.slice(0, block.index) + newBlock + xml.slice(block.index + block[0].length));

  cache.set(originalStyle, newIndex);
  return newIndex;
}

/** Reemplaza el `fillId` (y marca `applyFill`) de un `<xf>`, sin tocar lo demás. */
function withFill(xfXml: string, fillId: number): string {
  let out = xfXml.replace(/\sfillId="\d+"/, '').replace(/\sapplyFill="\d"/, '');
  out = out.replace(/^<xf\b/, `<xf applyFill="1" fillId="${fillId}"`);
  return out;
}

/**
 * Índice de un relleno sólido amarillo puro en `<fills>`; si la plantilla no
 * trae ninguno, se agrega. Buscarlo primero evita que el archivo termine con
 * dos amarillos casi idénticos si la plantilla ya traía uno de fábrica.
 */
function ensureYellowFill(files: Record<string, Uint8Array>): number {
  const path = 'xl/styles.xml';
  const xml = strFromU8(files[path] ?? new Uint8Array());
  const block = /<fills\b[^>]*>[\s\S]*?<\/fills>/.exec(xml);
  if (!block) return 0;

  const FILL_PATTERN = /<fill>[\s\S]*?<\/fill>/g;
  const entries = [...block[0].matchAll(FILL_PATTERN)].map((match) => match[0]);

  const yaExiste = entries.findIndex(
    (entry) => /patternType="solid"/.test(entry) && /fgColor rgb="FF?FFFF00"/i.test(entry),
  );
  if (yaExiste !== -1) return yaExiste;

  entries.push(
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFFFF00"/><bgColor indexed="64"/></patternFill></fill>',
  );
  const newIndex = entries.length - 1;

  const newBlock = `<fills count="${entries.length}">${entries.join('')}</fills>`;
  files[path] = strToU8(xml.slice(0, block.index) + newBlock + xml.slice(block.index + block[0].length));
  return newIndex;
}

/** Agrega el comentario legado (VML) de cada celda de `issues` a la hoja. */
function attachComments(
  files: Record<string, Uint8Array>,
  sheetPath: string,
  issues: IssueMap,
): void {
  const sheetMatch = /^xl\/worksheets\/sheet(\d+)\.xml$/.exec(sheetPath);
  if (!sheetMatch) return;
  const sheetNumber = sheetMatch[1];

  const nextIndex = nextPartIndex(files, /^xl\/comments(\d+)\.xml$/);
  const commentsPath = `xl/comments${nextIndex}.xml`;
  const vmlPath = `xl/drawings/vmlDrawing${nextIndex}.vml`;
  const relsPath = `xl/worksheets/_rels/sheet${sheetNumber}.xml.rels`;

  const refs = [...issues.entries()];

  files[commentsPath] = strToU8(buildCommentsXml(refs));
  files[vmlPath] = strToU8(buildVmlDrawing(refs));

  const relId = registerRelationships(files, relsPath, [
    { type: 'comments', target: `../comments${nextIndex}.xml` },
    { type: 'vmlDrawing', target: `../drawings/vmlDrawing${nextIndex}.vml` },
  ]);

  registerContentTypes(files, nextIndex);
  insertLegacyDrawing(files, sheetPath, relId.vmlDrawing);
}

/** Próximo número libre para una parte que se repite por índice (`commentsN.xml`…). */
function nextPartIndex(files: Record<string, Uint8Array>, pattern: RegExp): number {
  let max = 0;
  for (const name of Object.keys(files)) {
    const match = pattern.exec(name);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max + 1;
}

function buildCommentsXml(refs: [string, string[]][]): string {
  const comments = refs
    .map(
      ([ref, mensajes]) =>
        `<comment ref="${ref}" authorId="0" shapeId="0"><text><r><t xml:space="preserve">` +
        `${escapeXml(mensajes.join('\n'))}</t></r></text></comment>`,
    )
    .join('');

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<comments xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<authors><author>Auditoría de Plantillas Xertify</author></authors>` +
    `<commentList>${comments}</commentList></comments>`
  );
}

/** Dibujo VML mínimo que hace falta para que Excel muestre comentarios clásicos. */
function buildVmlDrawing(refs: [string, string[]][]): string {
  const shapes = refs
    .map(([ref], i) => {
      const parsed = parseRef(ref);
      const row = parsed ? parsed.row - 1 : 0;
      const column = parsed ? parsed.column : 0;
      const id = 1024 + i;
      return (
        `<v:shape id="_x0000_s${id}" type="#_x0000_t202" ` +
        `style='position:absolute;margin-left:59.25pt;margin-top:1.5pt;width:108pt;` +
        `height:59.25pt;z-index:${i + 1};visibility:hidden' fillcolor="#ffffe1" o:insetmode="auto">` +
        '<v:fill color2="#ffffe1"/>' +
        '<v:shadow on="t" color="black" obscured="t"/>' +
        '<v:path o:connecttype="none"/>' +
        `<v:textbox style='mso-direction-alt:auto'><div style='text-align:left'></div></v:textbox>` +
        '<x:ClientData ObjectType="Note">' +
        '<x:MoveWithCells/><x:SizeWithCells/>' +
        `<x:Anchor>1, 15, ${row}, 2, ${row + 2}, 15, ${row + 4}, 2</x:Anchor>` +
        '<x:AutoFill>False</x:AutoFill>' +
        `<x:Row>${row}</x:Row><x:Column>${column}</x:Column>` +
        '</x:ClientData></v:shape>'
      );
    })
    .join('');

  return (
    '<xml xmlns:v="urn:schemas-microsoft-com:vml" ' +
    'xmlns:o="urn:schemas-microsoft-com:office:office" ' +
    'xmlns:x="urn:schemas-microsoft-com:office:excel">' +
    '<o:shapelayout v:ext="edit"><o:idmap v:ext="edit" data="1"/></o:shapelayout>' +
    '<v:shapetype id="_x0000_t202" coordsize="21600,21600" o:spt="202" ' +
    'path="m,l,21600r21600,l21600,xe">' +
    '<v:stroke joinstyle="miter"/>' +
    '<v:path gradientshapeok="t" o:connecttype="rect"/>' +
    `</v:shapetype>${shapes}</xml>`
  );
}

interface RelationshipRequest {
  type: 'comments' | 'vmlDrawing';
  target: string;
}

const RELATIONSHIP_TYPE: Record<RelationshipRequest['type'], string> = {
  comments: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments',
  vmlDrawing: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/vmlDrawing',
};

/** Agrega relaciones a un `.rels` de hoja, creándolo si no existía, sin pisar las que ya traía. */
function registerRelationships(
  files: Record<string, Uint8Array>,
  relsPath: string,
  requests: RelationshipRequest[],
): Record<RelationshipRequest['type'], string> {
  const existing = files[relsPath]
    ? strFromU8(files[relsPath])
    : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';

  let usados = 0;
  for (const match of existing.matchAll(new RegExp(`Id=${Q}rId(\\d+)${Q}`, 'g'))) {
    usados = Math.max(usados, Number(match[1]));
  }

  const ids = {} as Record<RelationshipRequest['type'], string>;
  const nuevas = requests
    .map((request, i) => {
      const id = `rId${usados + i + 1}`;
      ids[request.type] = id;
      return (
        `<Relationship Id="${id}" Type="${RELATIONSHIP_TYPE[request.type]}" ` +
        `Target="${escapeXml(request.target)}"/>`
      );
    })
    .join('');

  files[relsPath] = strToU8(existing.replace('</Relationships>', `${nuevas}</Relationships>`));
  return ids;
}

/** Registra `comentsN.xml` y la extensión `.vml` en `[Content_Types].xml`. */
function registerContentTypes(files: Record<string, Uint8Array>, index: number): void {
  const path = '[Content_Types].xml';
  let xml = strFromU8(files[path] ?? new Uint8Array());
  if (!xml) return;

  if (!/Extension="vml"/.test(xml)) {
    xml = xml.replace(
      '</Types>',
      `<Default Extension="vml" ContentType="application/vnd.openxmlformats-officedocument.vmlDrawing"/></Types>`,
    );
  }

  xml = xml.replace(
    '</Types>',
    `<Override PartName="/xl/comments${index}.xml" ` +
      `ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml"/></Types>`,
  );

  files[path] = strToU8(xml);
}

/** Inserta `<legacyDrawing r:id="…"/>` en la hoja, declarando `xmlns:r` si hacía falta. */
function insertLegacyDrawing(
  files: Record<string, Uint8Array>,
  sheetPath: string,
  relId: string,
): void {
  let xml = strFromU8(files[sheetPath]);

  if (!/<worksheet\b[^>]*\sxmlns:r=/.test(xml)) {
    xml = xml.replace(
      /^<worksheet\b/,
      `<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"`,
    );
  }

  const tag = `<legacyDrawing r:id="${relId}"/>`;
  // `legacyDrawing` va después de todo lo de impresión y antes de `extLst`,
  // que siempre es lo último si aparece.
  if (xml.includes('<extLst>')) {
    xml = xml.replace('<extLst>', `${tag}<extLst>`);
  } else {
    xml = xml.replace('</worksheet>', `${tag}</worksheet>`);
  }

  files[sheetPath] = strToU8(xml);
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

/**
 * Fuerza el zoom al 100 % en todas las hojas del libro.
 *
 * Excel guarda el zoom con el que se cerró por última vez la plantilla, así
 * que cada facultad la entrega con el suyo. El archivo que sale siempre abre
 * al 100 %, sin importar cómo venía.
 */
function setZoom100(files: Record<string, Uint8Array>): void {
  for (const path of Object.keys(files)) {
    if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(path)) continue;
    const xml = strFromU8(files[path]);
    if (!xml.includes('<sheetView')) continue;

    const withZoom = xml.replace(/<sheetView\b[^>]*>/g, (tag) => {
      const selfClosing = tag.endsWith('/>');
      const attrs = tag
        .replace(/^<sheetView\b/, '')
        .replace(/\/?>$/, '')
        .replace(new RegExp(`\\szoomScale=${Q}[^${Q}]*${Q}`, 'g'), '')
        .replace(new RegExp(`\\szoomScaleNormal=${Q}[^${Q}]*${Q}`, 'g'), '');
      const conZoom = `${attrs} zoomScale=${Q}100${Q} zoomScaleNormal=${Q}100${Q}`;
      return `<sheetView${conZoom}${selfClosing ? '/>' : '>'}`;
    });

    if (withZoom !== xml) files[path] = strToU8(withZoom);
  }
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
