/**
 * rules.test.ts
 * Pruebas de las reglas críticas: numeración del libro, fechas, documentos,
 * ciudades, nombres y el mapeo a Tabla3.
 *
 * Ejecutar con `npm test`.
 */

import { describe, expect, it } from 'vitest';

import {
  addYears,
  formatEnglish,
  formatSpanish,
  formatSpanishRange,
  isCanonicalSpanish,
  parseAnyDate,
  parseDateRange,
} from './dateService';
import {
  buildDatabaseRows,
  serialToDisplay,
  tipoDeDocFor,
  toCsv,
  toDatabaseCase,
  toDatabaseName,
  toDatabasePlace,
  toDatabaseText,
  toExcelSerial,
} from './databaseService';
import { ACCENT_NAMES, ACCENT_PLACES, ACCENT_TEXT } from '../data/accents';
import {
  cleanPassportNumber,
  dbAbbreviationFor,
  docFormatFor,
  formatNationalId,
  parseDocumentType,
} from './documentService';
import {
  DEFAULT_LAST_CONSECUTIVO,
  DEFAULT_LAST_POSITION,
  allocate,
  nextPosition,
} from './numberingService';
import { suggestOffice } from './officeService';
import { isEnyeChange, restoreAccents, toTitleCase } from './textUtils';
import { canonicalCity, canonicalName, validateRow } from './validatorService';
import { CANONICAL_FIELDS, type CanonicalField, type StudentRow } from '../types';

/* ------------------------------------------------------------------ */
/* Auxiliares                                                          */
/* ------------------------------------------------------------------ */

const ALL_FIELDS = new Set<CanonicalField>(CANONICAL_FIELDS);

function values(overrides: Partial<Record<CanonicalField, string>>) {
  const base = {} as Record<CanonicalField, string>;
  for (const field of CANONICAL_FIELDS) base[field] = '';
  return { ...base, ...overrides };
}

function codesFor(
  overrides: Partial<Record<CanonicalField, string>>,
  field: CanonicalField,
): string[] {
  const issues = validateRow(values(overrides), ALL_FIELDS)[field] ?? [];
  return issues.map((issue) => issue.code);
}

function suggestionFor(
  overrides: Partial<Record<CanonicalField, string>>,
  field: CanonicalField,
): string | undefined {
  const issues = validateRow(values(overrides), ALL_FIELDS)[field] ?? [];
  return issues.find((issue) => issue.suggestion !== undefined)?.suggestion;
}

function makeRow(overrides: Partial<Record<CanonicalField, string>>, excelRow = 3): StudentRow {
  const filled = values(overrides);
  const cells = {} as StudentRow['cells'];
  for (const field of CANONICAL_FIELDS) {
    cells[field] = { value: filled[field], original: filled[field], issues: [], fixedBy: 'none' };
  }
  return { id: `row-${excelRow}`, excelRow, cells, passthrough: {} };
}

/* ------------------------------------------------------------------ */
/* Numeración del libro                                                */
/* ------------------------------------------------------------------ */

describe('numeración del libro', () => {
  it('avanza el registro dentro del mismo folio', () => {
    expect(nextPosition({ libro: 3, folio: 98, registro: 27 })).toEqual({
      libro: 3,
      folio: 98,
      registro: 28,
    });
  });

  it('abre folio nuevo cuando el registro llega a 99', () => {
    expect(nextPosition({ libro: 3, folio: 98, registro: 99 })).toEqual({
      libro: 3,
      folio: 99,
      registro: 1,
    });
  });

  it('abre libro nuevo cuando el folio llega a 99', () => {
    expect(nextPosition({ libro: 3, folio: 99, registro: 99 })).toEqual({
      libro: 4,
      folio: 1,
      registro: 1,
    });
  });

  it('ningún número asignado pasa de 99', () => {
    const allocation = allocate({ libro: 3, folio: 98, registro: 90 }, 11350, 500);
    for (const position of allocation.positions) {
      expect(position.folio).toBeLessThanOrEqual(99);
      expect(position.folio).toBeGreaterThanOrEqual(1);
      expect(position.registro).toBeLessThanOrEqual(99);
      expect(position.registro).toBeGreaterThanOrEqual(1);
    }
  });

  it('continúa el consecutivo N sin saltos', () => {
    const allocation = allocate({ libro: 3, folio: 98, registro: 27 }, 11350, 4);
    expect(allocation.consecutivos).toEqual([11351, 11352, 11353, 11354]);
    expect(allocation.start).toEqual({ libro: 3, folio: 98, registro: 28 });
    expect(allocation.end).toEqual({ libro: 3, folio: 98, registro: 31 });
    expect(allocation.abreFolioNuevo).toBe(false);
  });

  it('arranca donde quedó la Base de Datos: libro 3, folio 99, registro 54', () => {
    expect(DEFAULT_LAST_POSITION).toEqual({ libro: 3, folio: 99, registro: 54 });
    expect(DEFAULT_LAST_CONSECUTIVO).toBe(11476);

    const allocation = allocate(DEFAULT_LAST_POSITION, DEFAULT_LAST_CONSECUTIVO, 3);
    expect(allocation.start).toEqual({ libro: 3, folio: 99, registro: 55 });
    expect(allocation.consecutivos).toEqual([11477, 11478, 11479]);
  });

  it('pasa a libro 4 cuando el folio 99 se llena', () => {
    // Al folio 99 le quedan 45 registros; el 46.º abre el libro siguiente.
    const allocation = allocate(DEFAULT_LAST_POSITION, DEFAULT_LAST_CONSECUTIVO, 46);
    expect(allocation.positions[44]).toEqual({ libro: 3, folio: 99, registro: 99 });
    expect(allocation.positions[45]).toEqual({ libro: 4, folio: 1, registro: 1 });
    expect(allocation.abreLibroNuevo).toBe(true);
  });

  it('marca cuando el lote abre folio y libro nuevos', () => {
    const allocation = allocate({ libro: 3, folio: 99, registro: 98 }, 11350, 3);
    expect(allocation.abreFolioNuevo).toBe(true);
    expect(allocation.abreLibroNuevo).toBe(true);
    expect(allocation.positions[2]).toEqual({ libro: 4, folio: 1, registro: 2 });
  });
});

/* ------------------------------------------------------------------ */
/* Fechas                                                              */
/* ------------------------------------------------------------------ */

describe('fechas', () => {
  it('quita el cero inicial del día', () => {
    const parsed = parseAnyDate('01 de enero de 2025')!;
    expect(formatSpanish(parsed)).toBe('1 de enero de 2025');
    expect(isCanonicalSpanish('01 de enero de 2025')).toBe(false);
    expect(isCanonicalSpanish('1 de enero de 2025')).toBe(true);
  });

  it('interpreta seriales de Excel', () => {
    // 45658 = 1 de enero de 2025 en la base 1899-12-30.
    expect(formatSpanish(parseAnyDate(45658)!)).toBe('1 de enero de 2025');
  });

  it('interpreta ISO, numérico y texto', () => {
    expect(formatSpanish(parseAnyDate('1990-05-15')!)).toBe('15 de mayo de 1990');
    expect(formatSpanish(parseAnyDate('15/05/1990')!)).toBe('15 de mayo de 1990');
    expect(formatSpanish(parseAnyDate('15 de Mayo de 1990')!)).toBe('15 de mayo de 1990');
    expect(formatSpanish(parseAnyDate('January 1st, 2025')!)).toBe('1 de enero de 2025');
  });

  it('marca como ambigua una fecha donde día y mes caben en ambos órdenes', () => {
    expect(parseAnyDate('05/06/2024')?.ambiguous).toBe(true);
    expect(parseAnyDate('25/06/2024')?.ambiguous).toBe(false);
  });

  it('usa el formato inglés con ordinal de la hoja Parameters', () => {
    expect(formatEnglish(parseAnyDate('2025-01-01')!)).toBe('January 1st, 2025');
    expect(formatEnglish(parseAnyDate('2025-01-02')!)).toBe('January 2nd, 2025');
    expect(formatEnglish(parseAnyDate('2025-01-11')!)).toBe('January 11th, 2025');
    expect(formatEnglish(parseAnyDate('2025-12-23')!)).toBe('December 23rd, 2025');
  });

  it('ajusta el 29 de febrero al sumar años', () => {
    const bisiesto = parseAnyDate('2024-02-29')!;
    expect(formatSpanish(addYears(bisiesto, 5))).toBe('28 de febrero de 2029');
  });

  it('reporta el cero inicial con su propio código', () => {
    expect(codesFor({ fechainicio: '05 de mayo de 2026' }, 'fechainicio')).toContain(
      'FECHA.CERO_INICIAL',
    );
    expect(suggestionFor({ fechainicio: '05 de mayo de 2026' }, 'fechainicio')).toBe(
      '5 de mayo de 2026',
    );
  });

  it('exige que la emisión no sea anterior al inicio', () => {
    const codes = codesFor(
      { fechainicio: '12 de junio de 2026', fechaemite: '1 de junio de 2026' },
      'fechaemite',
    );
    expect(codes).toContain('FECHA.EMISION_ANTERIOR');
  });
});

/* ------------------------------------------------------------------ */
/* Documentos                                                          */
/* ------------------------------------------------------------------ */

describe('tipo de documento', () => {
  it('acepta el valor exacto de la lista Xertify', () => {
    expect(codesFor({ tipodocumento: 'Colombia - Cédula de ciudadanía' }, 'tipodocumento')).toEqual(
      [],
    );
  });

  it('normaliza mayúsculas y tildes al valor exacto', () => {
    expect(suggestionFor({ tipodocumento: 'colombia - cedula de ciudadania' }, 'tipodocumento')).toBe(
      'Colombia - Cédula de ciudadanía',
    );
  });

  it('obliga a pasaporte para extranjeros', () => {
    const codes = codesFor({ tipodocumento: 'Spain - id' }, 'tipodocumento');
    expect(codes).toContain('DOC.EXTRANJERO_SIN_PASAPORTE');
    expect(suggestionFor({ tipodocumento: 'Spain - id' }, 'tipodocumento')).toBe('Spain - Passport');
  });

  it('respeta la grafía de cada país en la lista', () => {
    expect(suggestionFor({ tipodocumento: 'Perú - DNI' }, 'tipodocumento')).toBe('Perú - Pasaporte');
    expect(suggestionFor({ tipodocumento: 'United States - SSN' }, 'tipodocumento')).toBe(
      'United States - PASSPORT',
    );
  });

  it('acepta la cédula de extranjería con país Colombia', () => {
    expect(codesFor({ tipodocumento: 'Colombia - Cédula de extranjería' }, 'tipodocumento')).toEqual(
      [],
    );
  });

  it('sigue rechazando otros tipos con país Colombia', () => {
    expect(codesFor({ tipodocumento: 'Colombia - NIT' }, 'tipodocumento')).toContain(
      'DOC.COLOMBIA_TIPO_INVALIDO',
    );
  });

  it('traduce nombres de país en español a la lista de Xertify', () => {
    expect(parseDocumentType('España - Pasaporte').exactValue).toBe('Spain - Passport');
    expect(parseDocumentType('Estados Unidos - Pasaporte').country).toBe('United States');
  });

  it('avisa cuando el país no tiene pasaporte en la lista', () => {
    expect(codesFor({ tipodocumento: 'Guatemala - ID' }, 'tipodocumento')).toContain(
      'DOC.PAIS_SIN_PASAPORTE',
    );
  });
});

describe('número de documento', () => {
  it('limpia puntos y espacios del pasaporte', () => {
    expect(cleanPassportNumber('A.123.456')).toBe('A123456');
    expect(
      suggestionFor(
        { tipodocumento: 'Spain - Passport', numerodocumento: 'A.123.456' },
        'numerodocumento',
      ),
    ).toBe('A123456');
  });

  it('exige la cédula con separador de miles, en texto', () => {
    // Ya viene bien: no se reclama nada.
    expect(
      codesFor(
        { tipodocumento: 'Colombia - Cédula de ciudadanía', numerodocumento: '1.026.286.605' },
        'numerodocumento',
      ),
    ).toEqual([]);

    // Sin separadores: se los pone.
    expect(
      suggestionFor(
        { tipodocumento: 'Colombia - Cédula de ciudadanía', numerodocumento: '1026286605' },
        'numerodocumento',
      ),
    ).toBe('1.026.286.605');

    // Con basura de por medio: se limpia y se formatea.
    expect(
      suggestionFor(
        { tipodocumento: 'Colombia - Cédula de ciudadanía', numerodocumento: '1 026 286-605' },
        'numerodocumento',
      ),
    ).toBe('1.026.286.605');

    expect(formatNationalId('52345')).toBe('52.345');
    expect(formatNationalId('900123456')).toBe('900.123.456');
  });

  it('rechaza cédulas demasiado cortas', () => {
    expect(
      codesFor(
        { tipodocumento: 'Colombia - Cédula de ciudadanía', numerodocumento: '123' },
        'numerodocumento',
      ),
    ).toContain('NUM.CEDULA_INVALIDA');
  });
});

describe('docformato y TIPO DE DOC', () => {
  it('deriva docformato del tipo de documento', () => {
    expect(docFormatFor(parseDocumentType('Colombia - Cédula de ciudadanía'))).toBe(
      'cédula de ciudadanía',
    );
    expect(docFormatFor(parseDocumentType('Spain - Passport'))).toBe('pasaporte');
  });

  it('abrevia sin puntos para la Base de Datos', () => {
    expect(dbAbbreviationFor(parseDocumentType('Colombia - Cédula de ciudadanía'))).toBe('CC');
    expect(dbAbbreviationFor(parseDocumentType('Colombia - Tarjeta de identidad'))).toBe('TI');
    expect(dbAbbreviationFor(parseDocumentType('Venezuela - Pasaporte'))).toBe('PS');
  });

  it('toma TIPO DE DOC de docformato cuando está diligenciado', () => {
    expect(tipoDeDocFor('pasaporte', '')).toBe('PS');
    expect(tipoDeDocFor('tarjeta de identidad', '')).toBe('TI');
    expect(tipoDeDocFor('', 'Colombia - Cédula de ciudadanía')).toBe('CC');
  });
});

describe('correo electrónico', () => {
  it('rechaza un correo sin arreglo posible', () => {
    expect(codesFor({ email: 'ana.enap.edu.co' }, 'email')).toContain('CORREO.INVALIDO');
    expect(codesFor({ email: 'ana@enap' }, 'email')).toContain('CORREO.INVALIDO');
  });

  it('normaliza mayúsculas y espacios cuando el correo sí es rescatable', () => {
    expect(suggestionFor({ email: 'ANA @enap.edu.co' }, 'email')).toBe('ana@enap.edu.co');
  });

  it('exige el correo por ser obligatorio para Xertify', () => {
    expect(codesFor({ email: '' }, 'email')).toContain('CAMPO.VACIO');
  });
});

/* ------------------------------------------------------------------ */
/* Lugar de expedición                                                 */
/* ------------------------------------------------------------------ */

describe('lugar de expedición', () => {
  it('normaliza todas las variantes de Bogotá', () => {
    for (const variant of ['BOGOTA', 'Bogota D.C.', 'bogotá dc', 'BOGOTA D,C', 'Bogotá']) {
      expect(suggestionFor({ lugarexpedicion: variant }, 'lugarexpedicion')).toBe('Bogotá D.C');
    }
  });

  it('acepta la forma exacta exigida', () => {
    expect(codesFor({ lugarexpedicion: 'Bogotá D.C' }, 'lugarexpedicion')).toEqual([]);
  });

  it('quita el departamento adosado', () => {
    expect(suggestionFor({ lugarexpedicion: 'FLORIDABLANCA, SANTANDER' }, 'lugarexpedicion')).toBe(
      'Floridablanca',
    );
  });

  it('restaura tildes de municipios', () => {
    expect(canonicalCity('IBAGUE')).toBe('Ibagué');
    expect(canonicalCity('cucuta')).toBe('Cúcuta');
    expect(canonicalCity('quibdo')).toBe('Quibdó');
  });

  it('rechaza un departamento suelto', () => {
    expect(codesFor({ lugarexpedicion: 'Cundinamarca' }, 'lugarexpedicion')).toContain(
      'LUGAR.ES_DEPARTAMENTO',
    );
  });
});

/* ------------------------------------------------------------------ */
/* Nombres                                                             */
/* ------------------------------------------------------------------ */

describe('nombres y apellidos', () => {
  it('aplica formato tipo título respetando conectores', () => {
    expect(toTitleCase('JUAN CARLOS DE LA ROSA')).toBe('Juan Carlos de la Rosa');
    expect(toTitleCase('ana van der berg')).toBe('Ana van der Berg');
  });

  it('restaura tildes frecuentes', () => {
    expect(canonicalName('JOSE HERNANDEZ GONZALEZ')).toBe('José Hernández González');
    expect(canonicalName('maria sofia perez')).toBe('María Sofía Pérez');
  });

  it('no toca una grafía ya acentuada por el usuario', () => {
    expect(canonicalName('Jhon Gomez')).toBe('Jhon Gómez');
    expect(canonicalName('Núñez')).toBe('Núñez');
  });

  it('limpia caracteres prohibidos y espacios dobles', () => {
    expect(suggestionFor({ nombres: 'Juan  Carlos' }, 'nombres')).toBe('Juan Carlos');
    expect(suggestionFor({ nombres: 'Juan3 Carlos' }, 'nombres')).toBe('Juan Carlos');
  });

  it('reporta el campo obligatorio vacío', () => {
    expect(codesFor({ nombres: '' }, 'nombres')).toContain('CAMPO.VACIO');
  });
});

/* ------------------------------------------------------------------ */
/* Numeración li / fo / numre                                          */
/* ------------------------------------------------------------------ */

describe('columnas li, fo y numre', () => {
  it('rechaza valores por encima de 99', () => {
    expect(codesFor({ fo: '120' }, 'fo')).toContain('LEDGER.FUERA_RANGO');
    expect(codesFor({ numre: '100' }, 'numre')).toContain('LEDGER.FUERA_RANGO');
  });

  it('acepta valores válidos y el campo vacío', () => {
    expect(codesFor({ fo: '98', numre: '27' }, 'fo')).toEqual([]);
    expect(codesFor({}, 'numre')).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* Oficina responsable                                                 */
/* ------------------------------------------------------------------ */

describe('oficina responsable', () => {
  it('deduce la oficina de un curso conocido', () => {
    const suggestion = suggestOffice('ENGLISH INTERMEDIATE - B1');
    expect(suggestion.oficina).toBe('DICSH - DIVISIÓN CIENCIAS SOCIALES');
    expect(suggestion.reason).toBe('exacto');
    expect(suggestion.support).toBeGreaterThan(100);
  });

  it('tolera diferencias de mayúsculas y tildes', () => {
    expect(suggestOffice('cadete naval por una semana').oficina).toBe(
      'BAENA - BATALLÓN DE CADETES',
    );
  });

  it('no inventa oficina para un curso desconocido', () => {
    expect(suggestOffice('TALLER DE ORIGAMI CUÁNTICO').oficina).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Mapeo a Tabla3                                                      */
/* ------------------------------------------------------------------ */

describe('mapeo a Tabla3', () => {
  const rows = [
    makeRow({
      nombres: 'Luis Gabriel',
      apellidos: 'Alarcón Torres',
      tipodocumento: 'Colombia - Cédula de ciudadanía',
      docformato: 'cédula de ciudadanía',
      numerodocumento: '1026286605',
      lugarexpedicion: 'Bogotá D.C',
      titulo: 'English Intermediate - B1',
      intensidad: '120',
      fechainicio: '12 de enero de 2026',
      fechaemite: '14 de julio de 2026',
      nomfirma1: 'Capitán de Navío',
      nomfirma3: 'Director de la Escuela',
    }),
  ];

  const metadata = {
    curso: 'English Intermediate - B1',
    oficina: 'DICSH - DIVISIÓN CIENCIAS SOCIALES',
    responsable: 'Registro y Control',
    fechaInicio: '12 de enero de 2026',
    fechaRegistro: '14 de julio de 2026',
    intensidad: '120',
    archivoOriginal: 'Plantilla Cursos Extensión.xlsx',
  };

  const allocation = allocate({ libro: 3, folio: 98, registro: 27 }, 11350, 1);

  it('respeta las equivalencias declaradas', () => {
    const [row] = buildDatabaseRows(rows, metadata, allocation);

    expect(row.N).toBe(11351);
    expect(row.LIBRO).toBe(3);
    expect(row.FOLIO).toBe(98);
    expect(row.REG).toBe(28);
    expect(row.APELLIDOS).toBe('ALARCÓN TORRES');
    expect(row.NOMBRES).toBe('LUIS GABRIEL');
    expect(row['TIPO DE DOC']).toBe('CC');
    expect(row['DOCUMENTO DE IDENTIDAD']).toBe(1026286605);
    expect(row['LUGAR EXPEDICION']).toBe('BOGOTÁ D.C');
    expect(row['NOMBRE DEL CURSO']).toBe('ENGLISH INTERMEDIATE - B1');
    expect(row.INTENSIDAD).toBe(120);
    expect(row['OFICINA RESPONSABLE']).toBe('DICSH - DIVISIÓN CIENCIAS SOCIALES');
    expect(row.OBSEVACIONES).toBe('Capitán de Navío');
    expect(row.AÑO).toBe(2026);
  });

  it('deja FECHA FINALIZACION vacía por no tener origen', () => {
    const [row] = buildDatabaseRows(rows, metadata, allocation);
    expect(row['FECHA FINALIZACION']).toBeNull();
  });

  it('convierte las fechas a serial de Excel', () => {
    const [row] = buildDatabaseRows(rows, metadata, allocation);
    expect(row['FECHA INICIO']).toBe(toExcelSerial(parseAnyDate('2026-01-12')!));
    expect(row['FECHA DE REGISTRO']).toBe(toExcelSerial(parseAnyDate('2026-07-14')!));
  });

  it('omite DIRECTOR FIRMANTE cuando la tabla no la tiene', () => {
    const [sin] = buildDatabaseRows(rows, metadata, allocation);
    expect(sin['DIRECTOR FIRMANTE']).toBeUndefined();

    const [con] = buildDatabaseRows(rows, metadata, allocation, {
      availableOptionalColumns: ['DIRECTOR FIRMANTE'],
    });
    expect(con['DIRECTOR FIRMANTE']).toBe('Director de la Escuela');
  });

  it('conserva tildes al pasar a mayúscula', () => {
    expect(toDatabaseCase('Ibagué')).toBe('IBAGUÉ');
    expect(toDatabaseCase('Muñoz Peña')).toBe('MUÑOZ PEÑA');
  });
});

/* ------------------------------------------------------------------ */
/* Exportación CSV                                                     */
/* ------------------------------------------------------------------ */

describe('CSV del lote', () => {
  it('muestra las fechas legibles en lugar del serial de Excel', () => {
    expect(serialToDisplay(toExcelSerial(parseAnyDate('2026-01-12')!))).toBe('12/01/2026');
    expect(serialToDisplay(toExcelSerial(parseAnyDate('2026-07-14')!))).toBe('14/07/2026');
  });

  it('usa punto y coma y encierra la fórmula de PERIODO', () => {
    const rows = buildDatabaseRows(
      [
        makeRow({
          nombres: 'Ana',
          apellidos: 'Pérez',
          numerodocumento: '1026286605',
          docformato: 'pasaporte',
          titulo: 'Curso',
          intensidad: '10',
          fechainicio: '12 de enero de 2026',
          fechaemite: '14 de julio de 2026',
        }),
      ],
      {
        curso: 'Curso',
        oficina: 'SACEN - SECRETARÍA ACADÉMICA',
        responsable: 'R',
        fechaInicio: '12 de enero de 2026',
        fechaRegistro: '14 de julio de 2026',
        intensidad: '10',
        archivoOriginal: 'x.xlsx',
      },
      allocate({ libro: 3, folio: 98, registro: 27 }, 11350, 1),
    );

    const csv = toCsv(rows);
    const [header, line] = csv.split('\r\n');
    expect(header.startsWith('N;LIBRO;FOLIO;REG;APELLIDOS')).toBe(true);
    expect(line).toContain(';14/07/2026;');
    expect(line).toContain('"=YEAR(Tabla3');
  });
});

/* ------------------------------------------------------------------ */
/* Tildes en mayúscula                                                 */
/* ------------------------------------------------------------------ */

describe('tildes, también en mayúscula', () => {
  it('restituye la tilde conservando el patrón de mayúsculas', () => {
    expect(restoreAccents('IBAGUE', ACCENT_PLACES)).toBe('IBAGUÉ');
    expect(restoreAccents('Ibague', ACCENT_PLACES)).toBe('Ibagué');
    expect(restoreAccents('ibague', ACCENT_PLACES)).toBe('ibagué');
    expect(restoreAccents('CUCUTA Y MEDELLIN', ACCENT_PLACES)).toBe('CÚCUTA Y MEDELLÍN');
  });

  it('no toca lo que el usuario ya acentuó', () => {
    expect(restoreAccents('IBAGUÉ', ACCENT_PLACES)).toBe('IBAGUÉ');
    expect(restoreAccents('BOGOTÁ D.C', ACCENT_PLACES)).toBe('BOGOTÁ D.C');
  });

  it('acentúa los nombres de curso en mayúscula', () => {
    expect(restoreAccents('INGENIERIA NAVAL', ACCENT_TEXT)).toBe('INGENIERÍA NAVAL');
    expect(restoreAccents('DIPLOMADO EN NAVEGACION MARITIMA', ACCENT_TEXT)).toBe(
      'DIPLOMADO EN NAVEGACIÓN MARÍTIMA',
    );
    expect(suggestionFor({ titulo: 'CURSO BASICO DE METEOROLOGIA' }, 'titulo')).toBe(
      'CURSO BÁSICO DE METEOROLOGÍA',
    );
  });

  it('escribe la base de datos en mayúscula CON tilde', () => {
    expect(toDatabaseName('jose hernandez')).toBe('JOSÉ HERNÁNDEZ');
    expect(toDatabasePlace('cucuta')).toBe('CÚCUTA');
    expect(toDatabaseText('ingenieria naval')).toBe('INGENIERÍA NAVAL');
  });

  it('acentúa apellidos escritos en mayúscula sin tilde', () => {
    expect(canonicalName('JOSE MARIA GOMEZ VELASQUEZ')).toBe('José María Gómez Velásquez');
    expect(suggestionFor({ apellidos: 'ARÉVALO OTALORA' }, 'apellidos')).toBe('Arévalo Otálora');
  });

  it('nunca convierte n en ñ por su cuenta: eso cambia el apellido', () => {
    expect(isEnyeChange('NINO', 'NIÑO')).toBe(true);
    expect(isEnyeChange('GOMEZ', 'GÓMEZ')).toBe(false);

    // El apellido se deja como venía…
    expect(canonicalName('CARLOS NINO')).toBe('Carlos Nino');
    expect(toDatabaseName('Carlos Nino')).toBe('CARLOS NINO');

    // …pero se avisa, con la sugerencia lista para aplicar a mano.
    const issues = validateRow(values({ apellidos: 'Nino' }), ALL_FIELDS).apellidos ?? [];
    const enye = issues.find((issue) => issue.code === 'NOMBRE.ENYE');
    expect(enye?.suggestion).toBe('Niño');
    expect(enye?.severity).toBe('warning');
    expect(enye?.autoFixable).toBe(false);
  });

  it('corrige las grafías incompletas que traía el histórico', () => {
    expect(ACCENT_NAMES.IBANEZ).toBe('IBÁÑEZ');
    expect(ACCENT_NAMES.NUNEZ).toBe('NÚÑEZ');
    expect(ACCENT_NAMES.ZUNIGA).toBe('ZÚÑIGA');
    expect(ACCENT_TEXT.NAUTICAS).toBe('NÁUTICAS');
  });

  it('respeta los homógrafos donde la forma sin tilde es la correcta', () => {
    // «continua» en «formación continua» no lleva tilde: quedó fuera del diccionario.
    expect(restoreAccents('FORMACION CONTINUA', ACCENT_TEXT)).toBe('FORMACIÓN CONTINUA');
    expect(ACCENT_TEXT.CONTINUA).toBeUndefined();
  });

  it('sí corrige la ñ cuando no hay apellido alternativo', () => {
    expect(canonicalName('MUNOZ LONDONO')).toBe('Muñoz Londoño');
    expect(toDatabaseName('Munoz Londono')).toBe('MUÑOZ LONDOÑO');
  });
});

/* ------------------------------------------------------------------ */
/* Rangos de fecha en fechainicio                                      */
/* ------------------------------------------------------------------ */

describe('rango de fechas del curso', () => {
  it('reconoce «12 de junio al 04 de julio de 2026»', () => {
    const range = parseDateRange('12 de junio al 04 de julio de 2026')!;
    expect(formatSpanish(range.start)).toBe('12 de junio de 2026');
    expect(formatSpanish(range.end)).toBe('4 de julio de 2026');
  });

  it('completa el mes y el año que falten en el extremo izquierdo', () => {
    expect(formatSpanishRange(parseDateRange('12 a 15 de junio de 2026')!)).toBe(
      '12 a 15 de junio de 2026',
    );
    expect(formatSpanishRange(parseDateRange('12 de junio a 4 de julio de 2026')!)).toBe(
      '12 de junio a 4 de julio de 2026',
    );
    expect(
      formatSpanishRange(parseDateRange('12 de diciembre de 2025 a 4 de enero de 2026')!),
    ).toBe('12 de diciembre de 2025 a 4 de enero de 2026');
  });

  it('admite otros separadores', () => {
    for (const texto of [
      '12 de junio a 4 de julio de 2026',
      '12 de junio hasta 4 de julio de 2026',
      '12 de junio - 4 de julio de 2026',
    ]) {
      expect(parseDateRange(texto)).not.toBeNull();
    }
  });

  it('rechaza un rango invertido', () => {
    expect(parseDateRange('4 de julio al 12 de junio de 2026')).toBeNull();
  });

  it('ya no reporta el rango como ilegible y le quita el cero inicial', () => {
    const codes = codesFor({ fechainicio: '12 de junio al 04 de julio de 2026' }, 'fechainicio');
    expect(codes).not.toContain('FECHA.ILEGIBLE');
    expect(codes).toContain('FECHA.FORMATO_RANGO');
    expect(suggestionFor({ fechainicio: '12 de junio al 04 de julio de 2026' }, 'fechainicio')).toBe(
      '12 de junio a 4 de julio de 2026',
    );
  });

  it('acepta el rango ya canónico sin quejarse', () => {
    expect(codesFor({ fechainicio: '12 de junio a 4 de julio de 2026' }, 'fechainicio')).toEqual(
      [],
    );
  });

  it('la fecha de emisión no admite rango: es una sola fecha', () => {
    expect(codesFor({ fechaemite: '12 de junio a 4 de julio de 2026' }, 'fechaemite')).toContain(
      'FECHA.ILEGIBLE',
    );
  });

  it('del rango salen FECHA INICIO y FECHA FINALIZACION de la base', () => {
    const [row] = buildDatabaseRows(
      [
        makeRow({
          nombres: 'Ana',
          apellidos: 'Pérez',
          numerodocumento: '1.026.286.605',
          docformato: 'cédula de ciudadanía',
          titulo: 'Curso',
          intensidad: '10',
          fechainicio: '12 de junio a 4 de julio de 2026',
          fechaemite: '14 de julio de 2026',
        }),
      ],
      {
        curso: 'Curso',
        oficina: 'SACEN - SECRETARÍA ACADÉMICA',
        responsable: 'R',
        fechaInicio: '12 de junio a 4 de julio de 2026',
        fechaRegistro: '14 de julio de 2026',
        intensidad: '10',
        archivoOriginal: 'x.xlsx',
      },
      allocate({ libro: 3, folio: 98, registro: 27 }, 11350, 1),
    );

    expect(row['FECHA INICIO']).toBe(toExcelSerial(parseAnyDate('2026-06-12')!));
    expect(row['FECHA FINALIZACION']).toBe(toExcelSerial(parseAnyDate('2026-07-04')!));
    // La cédula entra a la base como número; el separador lo pone el formato.
    expect(row['DOCUMENTO DE IDENTIDAD']).toBe(1026286605);
  });

  it('sin rango, la fecha de finalización queda vacía', () => {
    const [row] = buildDatabaseRows(
      [makeRow({ nombres: 'Ana', fechainicio: '12 de junio de 2026' })],
      {
        curso: 'Curso',
        oficina: 'SACEN - SECRETARÍA ACADÉMICA',
        responsable: 'R',
        fechaInicio: '12 de junio de 2026',
        fechaRegistro: '14 de julio de 2026',
        intensidad: '10',
        archivoOriginal: 'x.xlsx',
      },
      allocate({ libro: 3, folio: 98, registro: 27 }, 11350, 1),
    );
    expect(row['FECHA FINALIZACION']).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Campos que dejaron de exigirse                                      */
/* ------------------------------------------------------------------ */

describe('campos opcionales', () => {
  it('el lugar de expedición vacío ya no es error', () => {
    expect(codesFor({ lugarexpedicion: '' }, 'lugarexpedicion')).toEqual([]);
  });

  it('pero si viene, se sigue revisando', () => {
    expect(suggestionFor({ lugarexpedicion: 'BOGOTA' }, 'lugarexpedicion')).toBe('Bogotá D.C');
  });

  it('«lugarexpi» no se valida: no alimenta nada', () => {
    expect(codesFor({ lugarexpi: 'cualquier cosa' }, 'lugarexpi')).toEqual([]);
    expect(codesFor({ lugarexpi: '' }, 'lugarexpi')).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* Grados militares, teléfono y documento de extranjero                */
/* ------------------------------------------------------------------ */

describe('grados militares en los firmantes', () => {
  it('respeta la sigla de dos letras en mayúscula', () => {
    expect(canonicalName('CA Juan Pablo Pinilla Acosta')).toBe('CA Juan Pablo Pinilla Acosta');
    expect(canonicalName('CN JOSE HERNANDEZ')).toBe('CN José Hernández');
    expect(canonicalName('CF María Gómez')).toBe('CF María Gómez');
  });

  it('levanta a mayúscula un grado que vino en minúscula', () => {
    expect(canonicalName('ca juan pablo pinilla')).toBe('CA Juan Pablo Pinilla');
    expect(canonicalName('cc ana lopez')).toBe('CC Ana López');
  });

  it('no reclama nada cuando el firmante ya está bien escrito', () => {
    expect(codesFor({ nomfirma3: 'CA Juan Pablo Pinilla Acosta' }, 'nomfirma3')).toEqual([]);
    expect(codesFor({ nomfirma1: 'CN Andrés Vélez Muñoz' }, 'nomfirma1')).toEqual([]);
  });

  it('no confunde los conectores con siglas', () => {
    expect(canonicalName('CN JUAN DE LA ROSA')).toBe('CN Juan de la Rosa');
  });
});

describe('teléfono', () => {
  it('acepta el indicativo separado del número', () => {
    expect(codesFor({ telefono: '+57 3052812384' }, 'telefono')).toEqual([]);
    expect(codesFor({ telefono: '3052812384' }, 'telefono')).toEqual([]);
    expect(codesFor({ telefono: '+573052812384' }, 'telefono')).toEqual([]);
  });

  it('sigue reclamando guiones y paréntesis', () => {
    expect(codesFor({ telefono: '(305) 281-2384' }, 'telefono')).toContain('TEL.FORMATO');
  });

  it('sigue reclamando una cantidad de dígitos imposible', () => {
    expect(codesFor({ telefono: '123' }, 'telefono')).toContain('TEL.INVALIDO');
  });
});

describe('cédula de extranjería', () => {
  it('pasa sin novedades y viaja a la base como CE', () => {
    const issues =
      validateRow(values({ tipodocumento: 'Colombia - Cédula de extranjería' }), ALL_FIELDS)
        .tipodocumento ?? [];
    expect(issues).toEqual([]);
    expect(dbAbbreviationFor(parseDocumentType('Colombia - Cédula de extranjería'))).toBe('CE');
    expect(docFormatFor(parseDocumentType('Colombia - Cédula de extranjería'))).toBe(
      'cédula de extranjería',
    );
  });
});

describe('el «de» del año en un rango es opcional', () => {
  it('acepta las dos formas sin marcar error', () => {
    expect(codesFor({ fechainicio: '19 de febrero a 9 de mayo 2026' }, 'fechainicio')).toEqual([]);
    expect(codesFor({ fechainicio: '19 de febrero a 9 de mayo de 2026' }, 'fechainicio')).toEqual(
      [],
    );
  });

  it('pero sigue corrigiendo lo que sí está mal', () => {
    expect(suggestionFor({ fechainicio: '19 de Febrero al 09 de mayo 2026' }, 'fechainicio')).toBe(
      '19 de febrero a 9 de mayo de 2026',
    );
  });
});
