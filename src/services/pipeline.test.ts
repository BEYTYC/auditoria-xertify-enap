/**
 * pipeline.test.ts
 * Prueba de extremo a extremo sobre la plantilla real de Xertify:
 * lectura del archivo → detección de columnas → validación → autocorrección
 * → generación de las filas de Tabla3.
 *
 * La fixture `plantilla-sucia.xlsx` es una copia literal de
 * «Plantilla Cursos Extensión.xlsx» con cuatro filas deliberadamente sucias.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { strFromU8, unzipSync } from 'fflate';
import { beforeAll, describe, expect, it } from 'vitest';

import { autoFixAll, computeMetrics, revalidate } from './correctorService';
import { buildDatabaseRows } from './databaseService';
import { buildCorrectedWorkbook, readTemplate, type ParsedTemplate } from './excelService';
import { allocate } from './numberingService';
import { annotateTemplate } from './xlsxPatchService';
import type { StudentRow } from '../types';

const FIXTURE = fileURLToPath(new URL('./__fixtures__/plantilla-sucia.xlsx', import.meta.url));

async function loadFixture(): Promise<ParsedTemplate> {
  const bytes = await readFile(FIXTURE);
  const file = new File([bytes], 'plantilla-sucia.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  return readTemplate(file);
}

describe('lectura de la plantilla real', () => {
  let parsed: ParsedTemplate;

  beforeAll(async () => {
    parsed = await loadFixture();
  });

  it('encuentra la hoja People y los encabezados de la fila 2', () => {
    expect(parsed.sheetName).toBe('People');
    expect(parsed.headerRow).toBe(2);
  });

  it('reconoce las 26 columnas de la plantilla', () => {
    expect(parsed.activeFields.size).toBe(26);
    for (const field of [
      'nombres',
      'apellidos',
      'tipodocumento',
      'numerodocumento',
      'lugarexpedicion',
      'docformato',
      'titulo',
      'intensidad',
      'fechainicio',
      'fechaemite',
      'nomfirma1',
      'nomfirma3',
      'li',
      'fo',
      'numre',
    ]) {
      expect(parsed.activeFields.has(field as never)).toBe(true);
    }
  });

  it('lee las cuatro filas de datos y descarta las vacías', () => {
    expect(parsed.rows).toHaveLength(4);
    expect(parsed.rows[0].excelRow).toBe(3);
  });

  it('no reporta columnas obligatorias faltantes', () => {
    expect(parsed.map.missingRequired).toEqual([]);
  });
});

describe('auditoría de extremo a extremo', () => {
  let parsed: ParsedTemplate;
  let rows: StudentRow[];

  beforeAll(async () => {
    parsed = await loadFixture();
    rows = revalidate(parsed.rows, parsed.activeFields);
  });

  it('detecta errores en el archivo sucio', () => {
    const metrics = computeMetrics(rows);
    expect(metrics.errores).toBeGreaterThan(0);
    expect(metrics.filasConError).toBeGreaterThan(0);
  });

  it('detecta el documento duplicado entre dos filas', () => {
    const duplicated = rows.filter((row) =>
      row.cells.numerodocumento.issues.some((issue) => issue.code === 'NUM.DUPLICADO'),
    );
    expect(duplicated).toHaveLength(2);
  });

  it('acepta el documento propio de la estudiante española y la peruana, sin exigir pasaporte', () => {
    // «Spain - id» y «Perú - DNI» son el documento de identidad que cada país
    // ofrece en la lista Xertify: ya no se fuerza a pasaporte.
    const spanish = rows[1].cells.tipodocumento.issues.map((issue) => issue.code);
    const peruvian = rows[2].cells.tipodocumento.issues.map((issue) => issue.code);
    expect(spanish).toEqual([]);
    expect(peruvian).toEqual([]);
  });

  it('libro, folio y registro deben venir vacíos: los asigna la Oficina de Estadística', () => {
    const codes = [
      ...rows[2].cells.li.issues.map((issue) => issue.code),
      ...rows[2].cells.fo.issues.map((issue) => issue.code),
      ...rows[2].cells.numre.issues.map((issue) => issue.code),
    ];
    expect(codes.filter((code) => code === 'LEDGER.DEBE_VENIR_VACIO')).toHaveLength(3);
  });

  it('la autocorrección arregla lo determinista y deja el resto visible', () => {
    const report = autoFixAll(rows, parsed.activeFields);
    const after = report.rows;

    expect(report.fixedCells).toBeGreaterThan(10);

    expect(after[0].cells.nombres.value).toBe('José Hernández');
    expect(after[0].cells.apellidos.value).toBe('González Torres');
    expect(after[0].cells.numerodocumento.value).toBe('1.026.286.605');
    expect(after[0].cells.lugarexpedicion.value).toBe('Bogotá D.C.');
    expect(after[0].cells.tipodocumento.value).toBe('Colombia - Cédula de ciudadanía');
    expect(after[0].cells.docformato.value).toBe('cédula de ciudadanía');
    expect(after[0].cells.fechaexpedicion.value).toBe('5 de mayo de 2010');
    expect(after[0].cells.fechanacimiento2.value).toBe('15 de mayo de 1990');

    // «Spain - id» ya es su documento propio: no se toca.
    expect(after[1].cells.tipodocumento.value).toBe('Spain - id');
    expect(after[1].cells.numerodocumento.value).toBe('A123456');
    expect(after[1].cells.lugarexpedicion.value).toBe('Floridablanca');
    expect(after[1].cells.nombres.value).toBe('María Sofía');
    expect(after[1].cells.apellidos.value).toBe('Pérez de la Rosa');

    // «Perú - DNI» también es su documento propio: tampoco se fuerza a pasaporte.
    expect(after[2].cells.tipodocumento.value).toBe('Perú - DNI');
    expect(after[2].cells.lugarexpedicion.value).toBe('Ibagué');
    // `lugarexpi` no alimenta la Base de Datos, pero igual se le revisa la
    // ortografía, igual que a `lugarexpedicion`.
    expect(after[2].cells.lugarexpi.value).toBe('Cúcuta');
    expect(after[2].cells.fechainicio.value).toBe('12 de enero de 2026');
    expect(after[2].cells.fechaemite.value).toBe('1 de julio de 2026');
    expect(after[2].cells.nombres.value).toBe('Ana Lucía');
    // «ANA @enap.edu.co» solo tenía un espacio de más: se limpia sin intervención.
    expect(after[2].cells.email.value).toBe('ana@enap.edu.co');
    expect(after[2].cells.apellidos.value).toBe('Muñoz Quiñónez');

    // «Rincón» se acentúa solo; «Nino» no se toca, porque Nino y Niño son
    // dos apellidos reales: se avisa y decide el responsable.
    expect(after[3].cells.apellidos.value).toBe('Rincón Nino');
    const aviso = after[3].cells.apellidos.issues.find((issue) => issue.code === 'NOMBRE.ENYE');
    expect(aviso?.suggestion).toBe('Rincón Niño');
    expect(aviso?.autoFixable).toBe(false);
    expect(aviso?.severity).toBe('warning');
  });

  it('lo que no es autocorregible sigue bloqueando el registro', () => {
    const { rows: fixed } = autoFixAll(rows, parsed.activeFields);
    const metrics = computeMetrics(fixed);

    // Quedan: intensidad 0, departamento en lugar de municipio, correo inválido,
    // documento duplicado y la numeración fuera de rango.
    expect(metrics.errores).toBeGreaterThan(0);

    const pending = fixed.flatMap((row) =>
      Object.values(row.cells).flatMap((cell) =>
        cell.issues.filter((issue) => issue.severity === 'error').map((issue) => issue.code),
      ),
    );
    expect(pending).toContain('NUMERO.NO_POSITIVO');
    expect(pending).toContain('LUGAR.ES_DEPARTAMENTO');
    expect(pending).toContain('NUM.DUPLICADO');
  });
});

describe('salidas del lote', () => {
  it('reexporta el libro conservando la hoja Parameters', async () => {
    const parsed = await loadFixture();
    const { rows } = autoFixAll(parsed.rows, parsed.activeFields);
    const workbook = buildCorrectedWorkbook(parsed, rows);

    expect(workbook.SheetNames).toContain('People');
    expect(workbook.SheetNames).toContain('Parameters');
  });

  it('genera una fila de Tabla3 por graduado', async () => {
    const parsed = await loadFixture();
    const { rows } = autoFixAll(parsed.rows, parsed.activeFields);
    const allocation = allocate({ libro: 3, folio: 98, registro: 27 }, 11350, rows.length);

    const dbRows = buildDatabaseRows(
      rows,
      {
        curso: 'English Intermediate - B1',
        oficina: 'DICSH - DIVISIÓN CIENCIAS SOCIALES',
        responsable: 'Registro y Control',
        fechaInicio: '12 de enero de 2026',
        fechaRegistro: '14 de julio de 2026',
        intensidad: '120',
        archivoOriginal: 'plantilla-sucia.xlsx',
      },
      allocation,
    );

    expect(dbRows).toHaveLength(rows.length);
    expect(dbRows.map((row) => row.REG)).toEqual([28, 29, 30, 31]);
    expect(dbRows.map((row) => row.N)).toEqual([11351, 11352, 11353, 11354]);
    expect(dbRows[0].APELLIDOS).toBe('GONZÁLEZ TORRES');
    // La cédula sale de la plantilla como texto con puntos y entra a la base
    // como número: el separador lo pone el formato `#,##0` de la columna.
    expect(dbRows[0]['DOCUMENTO DE IDENTIDAD']).toBe(1026286605);
    // `TIPO DE DOC` sale de `docformato` (que en esta fila ya traía
    // «pasaporte» en la plantilla sucia), no de si `tipodocumento` se corrigió.
    expect(dbRows[1]['TIPO DE DOC']).toBe('PS');
    expect(dbRows[3]['TIPO DE DOC']).toBe('TI');
    expect(
      dbRows.every((row) => String(row['OFICINA RESPONSABLE'] ?? '').startsWith('DICSH')),
    ).toBe(true);
  });
});

describe('plantilla con las novedades marcadas (sin corregir nada)', () => {
  it('resalta en amarillo y comenta cada celda con novedad, sin cambiar ningún valor', async () => {
    const parsed = await loadFixture();
    const rows = revalidate(parsed.rows, parsed.activeFields);

    const blob = annotateTemplate(parsed.buffer, rows, {
      sheetName: parsed.sheetName,
      mappings: parsed.map.mappings,
    });
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));

    // El valor de la primera celda sucia («jose  hernandez», con espacios de
    // más) sigue intacto: la plantilla que se descarga no corrige nada.
    const sheet = strFromU8(files['xl/worksheets/sheet1.xml']);
    expect(sheet).toContain('JOSE  HERNANDEZ');

    // Cada celda con novedad quedó con un estilo distinto al que traía
    // (el clon amarillo), y el comentario existe con el mensaje de la regla.
    expect(sheet).toMatch(/<legacyDrawing r:id="rId\d+"\/>/);
    const comments = strFromU8(files['xl/comments1.xml']);
    expect(comments).toContain('Tiene espacios sobrantes');
    expect(comments).toContain('Documento repetido en las filas');

    // El formato de siempre se conserva: Aptos, `Parameters` oculta, zoom 100 %.
    expect(strFromU8(files['xl/workbook.xml'])).toMatch(
      /<sheet\b(?=[^>]*\bname="Parameters")(?=[^>]*\bstate="hidden")[^>]*\/>/,
    );
    expect(sheet).toContain('zoomScale="100"');
    expect(strFromU8(files['xl/styles.xml'])).not.toContain('Calibri');
  });

  it('dejar bien una celda le quita el amarillo y el comentario en la próxima descarga', async () => {
    const parsed = await loadFixture();
    const rows = revalidate(parsed.rows, parsed.activeFields);

    // Simula que el responsable ya corrigió a mano, en Excel, la primera
    // celda («jose  hernandez» → «José Hernández») y volvió a cargar.
    const corregido = rows.map((row, index) =>
      index === 0
        ? {
            ...row,
            cells: {
              ...row.cells,
              nombres: { ...row.cells.nombres, value: 'José Hernández', original: 'José Hernández' },
            },
          }
        : row,
    );
    const revalidated = revalidate(corregido, parsed.activeFields);
    expect(revalidated[0].cells.nombres.issues).toEqual([]);

    const blob = annotateTemplate(parsed.buffer, revalidated, {
      sheetName: parsed.sheetName,
      mappings: parsed.map.mappings,
    });
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));

    // La app nunca reescribe el valor dentro del Excel: quien corrige es el
    // responsable, en Excel. Lo que aquí se prueba es que, sin la novedad,
    // la celda deja de comentarse y de resaltarse en la próxima descarga.

    // Sin la novedad en `nombres`, esa celda ya no aparece en el comentario.
    const comments = strFromU8(files['xl/comments1.xml']);
    expect(comments).not.toContain('Tiene espacios sobrantes');
    // Pero el resto de las novedades del lote —que siguen pendientes— sí.
    expect(comments).toContain('Documento repetido en las filas');
  });
});
