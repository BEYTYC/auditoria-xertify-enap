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

import { beforeAll, describe, expect, it } from 'vitest';

import { autoFixAll, computeMetrics, revalidate } from './correctorService';
import { buildDatabaseRows } from './databaseService';
import { buildCorrectedWorkbook, readTemplate, type ParsedTemplate } from './excelService';
import { allocate } from './numberingService';
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

  it('exige pasaporte para la estudiante española y la peruana', () => {
    const spanish = rows[1].cells.tipodocumento.issues.map((issue) => issue.code);
    const peruvian = rows[2].cells.tipodocumento.issues.map((issue) => issue.code);
    expect(spanish).toContain('DOC.EXTRANJERO_SIN_PASAPORTE');
    expect(peruvian).toContain('DOC.EXTRANJERO_SIN_PASAPORTE');
  });

  it('rechaza folio y registro por encima de 99', () => {
    const codes = [
      ...rows[2].cells.fo.issues.map((issue) => issue.code),
      ...rows[2].cells.numre.issues.map((issue) => issue.code),
    ];
    expect(codes.filter((code) => code === 'LEDGER.FUERA_RANGO')).toHaveLength(2);
  });

  it('la autocorrección arregla lo determinista y deja el resto visible', () => {
    const report = autoFixAll(rows, parsed.activeFields);
    const after = report.rows;

    expect(report.fixedCells).toBeGreaterThan(10);

    expect(after[0].cells.nombres.value).toBe('José Hernández');
    expect(after[0].cells.apellidos.value).toBe('González Torres');
    expect(after[0].cells.numerodocumento.value).toBe('1.026.286.605');
    expect(after[0].cells.lugarexpedicion.value).toBe('Bogotá D.C');
    expect(after[0].cells.tipodocumento.value).toBe('Colombia - Cédula de ciudadanía');
    expect(after[0].cells.docformato.value).toBe('cédula de ciudadanía');
    expect(after[0].cells.fechaexpedicion.value).toBe('5 de mayo de 2010');
    expect(after[0].cells.fechanacimiento2.value).toBe('15 de mayo de 1990');

    expect(after[1].cells.tipodocumento.value).toBe('Spain - Passport');
    expect(after[1].cells.numerodocumento.value).toBe('A123456');
    expect(after[1].cells.lugarexpedicion.value).toBe('Floridablanca');
    expect(after[1].cells.nombres.value).toBe('María Sofía');
    expect(after[1].cells.apellidos.value).toBe('Pérez de la Rosa');

    expect(after[2].cells.tipodocumento.value).toBe('Perú - Pasaporte');
    expect(after[2].cells.docformato.value).toBe('pasaporte');
    expect(after[2].cells.lugarexpedicion.value).toBe('Ibagué');
    // `lugarexpi` no alimenta nada: se conserva tal cual, sin tocar.
    expect(after[2].cells.lugarexpi.value).toBe('cucuta');
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
    expect(dbRows[1]['TIPO DE DOC']).toBe('PS');
    expect(dbRows[3]['TIPO DE DOC']).toBe('TI');
    expect(
      dbRows.every((row) => String(row['OFICINA RESPONSABLE'] ?? '').startsWith('DICSH')),
    ).toBe(true);
  });
});
