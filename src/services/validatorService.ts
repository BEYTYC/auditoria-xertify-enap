/**
 * validatorService.ts
 * Motor de reglas de la auditoría, ajustado a la plantilla real de Xertify
 * («Plantilla Cursos Extensión.xlsx», hoja `People`).
 *
 * El validador es puro: recibe los valores actuales de una fila y devuelve
 * los hallazgos por campo. Las sugerencias son las que aplica el autocorrector.
 */

import {
  BOGOTA_CANONICAL,
  BOGOTA_VARIANTS,
  CITY_CANONICAL,
  CITY_DEPARTMENT_HOMONYMS,
  DEPARTMENTS,
} from '../data/cities';
import { FIELD_SPECS } from '../data/fields';
import { ACCENT_NAMES, ACCENT_PLACES, ACCENT_TEXT } from '../data/accents';
import {
  ACCENT_DICTIONARY,
  AMBIGUOUS_ACCENTS,
  AMBIGUOUS_ENYE,
  MILITARY_RANKS,
  NAME_CONNECTORS,
} from '../data/names';
import { XERTIFY_DOC_FORMATS, XERTIFY_GENDERS } from '../data/xertifyParameters';
import {
  MAX_FOLIO,
  MAX_REGISTRO,
  type CanonicalField,
  type StudentRow,
  type ValidationIssue,
} from '../types';
import {
  formatSpanish,
  formatSpanishRange,
  isCanonicalSpanish,
  isCanonicalSpanishRange,
  parseAnyDate,
  parseDateRange,
  type ParsedDate,
} from './dateService';
import {
  cleanNationalId,
  cleanPassportNumber,
  formatNationalId,
  NATIONAL_ID_DIGITS,
  dbAbbreviationFor,
  docFormatFor,
  expectedValueFor,
  isKindAllowedFor,
  normalizeNumericCell,
  parseDocumentType,
  passportEntryFor,
  PASSPORT_PATTERN,
} from './documentService';
import {
  cleanNameChars,
  collapseSpaces,
  findForbiddenNameChars,
  findSkippedWords,
  hasAccent,
  normalizeKey,
  restoreAccents,
  stripAccents,
  toTitleCase,
} from './textUtils';

/* ------------------------------------------------------------------ */
/* Fábrica de hallazgos                                                 */
/* ------------------------------------------------------------------ */

/**
 * Marca los espacios que sobran para poder señalarlos en pantalla.
 *
 * Se marca el que va delante, el que va detrás y, en una seguidilla, todos
 * menos el primero: los que estorban, no los que separan palabras.
 */
export function markExtraSpaces(raw: string): string {
  const MARCA = '\u0001';
  return String(raw)
    .replace(/^\s+/, (bloque) => MARCA.repeat(bloque.length))
    .replace(/\s+$/, (bloque) => MARCA.repeat(bloque.length))
    .replace(/(\S)(\s{2,})(?=\S)/g, (_todo, antes, bloque: string) =>
      `${antes} ${MARCA.repeat(bloque.length - 1)}`,
    );
}

/**
 * Nombra la corrección por lo que de verdad cambia.
 *
 * No es lo mismo «luisa» → «Luisa», que es una mayúscula, que «Luis» →
 * «Luís», que es una tilde. Decirle «necesita tildes» a la primera confunde a
 * quien corrige y le hace dudar de una regla que sí entiende.
 */
export function describeFix(
  label: string,
  actual: string,
  canonical: string,
): { code: string; message: string } {
  const mismasLetras =
    stripAccents(actual).toLocaleLowerCase('es-CO') ===
    stripAccents(canonical).toLocaleLowerCase('es-CO');

  if (!mismasLetras) {
    return {
      code: 'NOMBRE.ESCRITURA',
      message: `${label}: corrección de escritura: «${canonical}».`,
    };
  }

  const cambianTildes =
    actual.toLocaleLowerCase('es-CO') !== canonical.toLocaleLowerCase('es-CO');
  const cambiaMayuscula = stripAccents(actual) !== stripAccents(canonical);

  if (cambianTildes && cambiaMayuscula) {
    return {
      code: 'NOMBRE.TILDES_Y_MAYUSCULAS',
      message: `${label} necesita tildes y capitalizar: «${canonical}».`,
    };
  }
  if (cambianTildes) {
    return { code: 'NOMBRE.TILDES', message: `${label} necesita tildes: «${canonical}».` };
  }
  return {
    code: 'NOMBRE.MAYUSCULAS',
    message: `${label} necesita capitalizar: «${canonical}».`,
  };
}

function makeIssue(
  code: string,
  field: CanonicalField,
  message: string,
  options: {
    severity?: 'error' | 'warning';
    suggestion?: string;
    /**
     * Fuerza que la sugerencia NO se aplique en «Autocorregir todo».
     * Se usa cuando elegir entre dos valores es criterio humano: la
     * sugerencia se muestra para aplicarla a mano, pero la máquina no
     * decide por su cuenta cuál de los dos campos está bien.
     */
    manualOnly?: boolean;
    /** Texto con marcas para pintar los espacios que sobran. */
    preview?: string;
  } = {},
): ValidationIssue {
  return {
    code,
    field,
    severity: options.severity ?? 'error',
    message,
    suggestion: options.suggestion,
    preview: options.preview,
    autoFixable: options.suggestion !== undefined && !options.manualOnly,
  };
}

/** Severidad de un campo vacío según su obligatoriedad. */
function emptySeverity(field: CanonicalField): 'error' | 'warning' | null {
  const requirement = FIELD_SPECS[field].requirement;
  if (requirement === 'opcional') return null;
  return 'error';
}

function emptyIssue(field: CanonicalField): ValidationIssue[] {
  const severity = emptySeverity(field);
  if (!severity) return [];
  const spec = FIELD_SPECS[field];
  const reason =
    spec.requirement === 'xertify'
      ? 'Xertify rechaza el cargue sin este dato.'
      : 'Se requiere para asentar el registro en el libro.';
  return [makeIssue('CAMPO.VACIO', field, `${spec.label} está vacío. ${reason}`, { severity })];
}

/* ------------------------------------------------------------------ */
/* Nombres                                                              */
/* ------------------------------------------------------------------ */

/**
 * Ortografía canónica de un nombre o apellido.
 *
 * Restituye tildes con dos fuentes: el diccionario de nombres hispanos
 * frecuentes y las 186 palabras que el propio histórico de la institución
 * escribió alguna vez acentuadas.
 *
 * NO convierte `n` en `ñ`: «Nino» y «Niño», «Pina» y «Piña», «Montana» y
 * «Montaña» son apellidos distintos y reales, y el nombre de una persona en
 * un certificado no se cambia por criterio de máquina. Ese caso se sugiere
 * aparte, para que el responsable decida (ver `enyeSuggestion`).
 */
export function canonicalName(raw: string): string {
  const cleaned = cleanNameChars(raw);

  // Las siglas se protegen ANTES del formato tipo título, que si no las
  // destruye: «CA Juan Pablo» quedaría «Ca Juan Pablo». Un grado militar son
  // dos letras y va siempre en mayúscula.
  const acronyms = new Map<string, string>();
  const guarded = cleaned
    .split(' ')
    .map((word, index) => {
      const upper = stripAccents(word).toLocaleUpperCase('es-CO');
      if (!/^\p{L}{2}$/u.test(word)) return word;

      // `de`, `la`, `el` también son de dos letras: en un nombre escrito todo
      // en mayúsculas no se pueden confundir con un grado.
      if (NAME_CONNECTORS.has(normalizeKey(word))) return word;

      // El grado abre el nombre. Se protege el que ya viene en mayúscula y se
      // levanta el que está en el catálogo aunque haya venido en minúscula.
      const isRank = MILITARY_RANKS.has(upper);
      const opensName = index === 0 && word === word.toLocaleUpperCase('es-CO');
      if (!isRank && !opensName) return word;

      const token = `\u0000${acronyms.size}\u0000`;
      acronyms.set(token, upper);
      return token;
    })
    .join(' ');

  const titled = toTitleCase(guarded);
  const withDictionary = titled
    .split(' ')
    .map((word) => {
      if (!word || hasAccent(word)) return word;
      const key = normalizeKey(word);
      if (AMBIGUOUS_ACCENTS.has(key)) return word;
      if (AMBIGUOUS_ENYE.has(stripAccents(word).toLocaleUpperCase('es-CO'))) return word;
      const dictionary = ACCENT_DICTIONARY[key];
      if (!dictionary) return word;
      const wasLowercase = word[0] === word[0].toLowerCase();
      return wasLowercase ? dictionary.toLocaleLowerCase('es-CO') : dictionary;
    })
    .join(' ');

  let restored = restoreAccents(withDictionary, ACCENT_NAMES, AMBIGUOUS_ENYE);
  for (const [token, acronym] of acronyms) {
    restored = restored.replace(token, acronym);
  }
  return restored;
}

/**
 * Grafía alternativa con `ñ` cuando el apellido está en la lista de los que
 * existen en las dos formas. Devuelve `null` si no aplica.
 */
export function enyeSuggestion(text: string): string | null {
  const pending = findSkippedWords(text, ACCENT_NAMES, AMBIGUOUS_ENYE);
  if (!pending.length) return null;
  return restoreAccents(text, ACCENT_NAMES);
}

function validateName(value: string, field: CanonicalField): ValidationIssue[] {
  const spec = FIELD_SPECS[field];
  const raw = String(value ?? '');
  const text = raw.trim();

  if (!text) return emptyIssue(field);

  const forbidden = findForbiddenNameChars(text);
  if (forbidden.length) {
    return [
      makeIssue(
        'NOMBRE.CARACTERES',
        field,
        `${spec.label} contiene caracteres no permitidos: ${forbidden.join(' ')}`,
        { suggestion: canonicalName(text) },
      ),
    ];
  }

  if (raw !== text || /\s{2,}/.test(raw)) {
    return [
      makeIssue('NOMBRE.ESPACIOS', field, `${spec.label} tiene espacios sobrantes:`, {
        suggestion: canonicalName(raw),
        preview: markExtraSpaces(raw),
      }),
    ];
  }

  const canonical = canonicalName(text);
  if (canonical !== text) {
    const { code, message } = describeFix(spec.label, text, canonical);
    return [makeIssue(code, field, message, { suggestion: canonical })];
  }

  // La `ñ` se propone, no se impone: es parte del nombre legal de la persona.
  const enye = enyeSuggestion(canonical);
  if (enye && enye !== canonical) {
    return [
      makeIssue(
        'NOMBRE.ENYE',
        field,
        `¿Debería ser «${enye}»? En el histórico ese apellido aparece con ñ. ` +
          'Confirme con el documento del estudiante antes de cambiarlo.',
        { severity: 'warning', suggestion: enye, manualOnly: true },
      ),
    ];
  }

  return [];
}

/* ------------------------------------------------------------------ */
/* Documento                                                            */
/* ------------------------------------------------------------------ */

function validateDocumentType(value: string): ValidationIssue[] {
  const field: CanonicalField = 'tipodocumento';
  const text = collapseSpaces(value);
  if (!text) return emptyIssue(field);

  const parsed = parseDocumentType(text);

  if (!parsed.country && !parsed.kind) {
    return [
      makeIssue(
        'DOC.NO_RECONOCIDO',
        field,
        `«${text}» no coincide con ningún valor de la lista Xertify. Use el formato ` +
          '«País - Tipo de documento», p. ej. «Colombia - Cédula de ciudadanía».',
      ),
    ];
  }

  if (!parsed.country) {
    return [
      makeIssue('DOC.PAIS_FALTANTE', field, 'Falta el país antes del tipo de documento.'),
    ];
  }

  // Regla institucional: los extranjeros van siempre con pasaporte.
  if (!parsed.isColombian && !parsed.isPassport) {
    const passport = passportEntryFor(parsed.country);
    if (!passport) {
      return [
        makeIssue(
          'DOC.PAIS_SIN_PASAPORTE',
          field,
          `La lista de Xertify no ofrece pasaporte para ${parsed.country}. ` +
            'Verifique con Registro y Control qué valor usar.',
        ),
      ];
    }
    return [
      makeIssue(
        'DOC.EXTRANJERO_SIN_PASAPORTE',
        field,
        `Para ${parsed.country} el documento debe ser pasaporte, no «${parsed.kind ?? text}».`,
        { suggestion: passport.value },
      ),
    ];
  }

  // Un colombiano no puede quedar con cédula de extranjería ni con otro tipo.
  if (parsed.isColombian && parsed.kind && !isKindAllowedFor('Colombia', parsed.kind)) {
    if (parsed.isPassport) {
      return [
        makeIssue(
          'DOC.COLOMBIA_PASAPORTE',
          field,
          'Se registró pasaporte colombiano. Si el estudiante es colombiano use la cédula; ' +
            'si es extranjero, corrija el país.',
          { severity: 'warning' },
        ),
      ];
    }
    return [
      makeIssue(
        'DOC.COLOMBIA_TIPO_INVALIDO',
        field,
        `«${parsed.kind}» no es válido con país «Colombia». Debe ser cédula de ciudadanía, ` +
          'tarjeta de identidad, registro civil o cédula de extranjería.',
      ),
    ];
  }

  // Debe coincidir carácter por carácter con la lista Xertify.
  if (!parsed.exactValue) {
    const expected = expectedValueFor(parsed.country, parsed.kind);
    return [
      makeIssue(
        'DOC.NO_EN_LISTA',
        field,
        `«${text}» no está en la lista desplegable de la plantilla.`,
        expected ? { suggestion: expected } : {},
      ),
    ];
  }

  if (parsed.exactValue !== text) {
    return [
      makeIssue('DOC.FORMATO', field, `Debe escribirse exactamente «${parsed.exactValue}».`, {
        suggestion: parsed.exactValue,
      }),
    ];
  }

  return [];
}

function validateDocumentNumber(value: string, docType: string): ValidationIssue[] {
  const field: CanonicalField = 'numerodocumento';
  const text = normalizeNumericCell(value).trim();
  if (!text) return emptyIssue(field);

  const issues: ValidationIssue[] = [];
  const parsed = parseDocumentType(docType);

  if (parsed.isPassport) {
    const cleaned = cleanPassportNumber(text);
    if (cleaned !== text) {
      issues.push(
        makeIssue(
          'NUM.PASAPORTE_CARACTERES',
          field,
          'El pasaporte no admite puntos, espacios ni guiones.',
          { suggestion: cleaned },
        ),
      );
    }
    if (!PASSPORT_PATTERN.test(cleaned)) {
      issues.push(
        makeIssue(
          'NUM.PASAPORTE_INVALIDO',
          field,
          'El pasaporte debe tener entre 5 y 20 caracteres alfanuméricos, sin símbolos.',
        ),
      );
    }
    return issues;
  }

  // Cédula, tarjeta de identidad o registro civil: dígitos con separador de
  // miles y en formato texto — «1.026.286.605».
  const digits = cleanNationalId(text);

  if (digits.length < NATIONAL_ID_DIGITS.min || digits.length > NATIONAL_ID_DIGITS.max) {
    issues.push(
      makeIssue(
        'NUM.CEDULA_INVALIDA',
        field,
        `La cédula debe tener entre ${NATIONAL_ID_DIGITS.min} y ${NATIONAL_ID_DIGITS.max} dígitos.`,
      ),
    );
    return issues;
  }

  if (/[^\d.]/.test(text)) {
    issues.push(
      makeIssue(
        'NUM.CEDULA_CARACTERES',
        field,
        'La cédula solo admite dígitos y el punto como separador de miles.',
        { suggestion: formatNationalId(text) },
      ),
    );
    return issues;
  }

  const formatted = formatNationalId(text);
  if (formatted !== text) {
    issues.push(
      makeIssue(
        'NUM.CEDULA_SEPARADORES',
        field,
        `Debe llevar separador de miles: «${formatted}».`,
        { suggestion: formatted },
      ),
    );
  }

  return issues;
}

function validateDocFormat(value: string, docType: string): ValidationIssue[] {
  const field: CanonicalField = 'docformato';
  const text = collapseSpaces(value);
  const parsed = parseDocumentType(docType);
  const expected = docFormatFor(parsed);

  if (!text) {
    return expected
      ? [
          makeIssue(
            'DOCFMT.VACIO',
            field,
            `Se puede completar automáticamente como «${expected}».`,
            { severity: 'warning', suggestion: expected },
          ),
        ]
      : [];
  }

  if (!XERTIFY_DOC_FORMATS.includes(text)) {
    return [
      makeIssue(
        'DOCFMT.NO_EN_LISTA',
        field,
        `«${text}» no está en la lista admitida (${XERTIFY_DOC_FORMATS.join(', ')}).`,
        expected ? { suggestion: expected } : {},
      ),
    ];
  }

  if (expected && text !== expected) {
    return [
      makeIssue(
        'DOCFMT.DESALINEADO',
        field,
        `No coincide con el tipo de documento; debería ser «${expected}».`,
        { suggestion: expected },
      ),
    ];
  }

  return [];
}

/* ------------------------------------------------------------------ */
/* Ciudad                                                               */
/* ------------------------------------------------------------------ */

/** Grafía oficial de una ciudad, si está en el catálogo. */
export function canonicalCity(raw: string): string | null {
  const key = normalizeKey(raw);
  if (!key) return null;
  if (BOGOTA_VARIANTS.has(key)) return BOGOTA_CANONICAL;
  return CITY_CANONICAL[key] ?? null;
}

function validateCity(value: string, field: CanonicalField): ValidationIssue[] {
  const text = collapseSpaces(value);
  if (!text) return emptyIssue(field);

  // 1. Bogotá tiene una grafía obligatoria y prevalece sobre todo lo demás.
  const key = normalizeKey(text);
  if (BOGOTA_VARIANTS.has(key) || /^bogota\b/.test(key)) {
    return text === BOGOTA_CANONICAL
      ? []
      : [
          makeIssue('LUGAR.BOGOTA', field, `Debe escribirse exactamente «${BOGOTA_CANONICAL}».`, {
            suggestion: BOGOTA_CANONICAL,
          }),
        ];
  }

  // 2. Departamento o país adosado: «Floridablanca, Santander».
  const segments = text
    .split(/\s*[,/|]\s*|\s+-\s+/)
    .map((part) => collapseSpaces(part))
    .filter(Boolean);

  if (segments.length > 1) {
    const cityPart = segments[0];
    const suggestion = canonicalCity(cityPart) ?? toTitleCase(cleanNameChars(cityPart));
    return [
      makeIssue(
        'LUGAR.CONTIENE_DEPARTAMENTO',
        field,
        'Debe registrarse solo la ciudad o municipio, sin departamento ni país.',
        { suggestion },
      ),
    ];
  }

  // 3. Se escribió un departamento en lugar del municipio.
  if (DEPARTMENTS.has(key) && !CITY_DEPARTMENT_HOMONYMS.has(key)) {
    return [
      makeIssue(
        'LUGAR.ES_DEPARTAMENTO',
        field,
        `«${text}» es un departamento o país, no un municipio.`,
      ),
    ];
  }

  // 4. Grafía oficial del catálogo.
  const canonical = canonicalCity(text);
  if (canonical) {
    return canonical === text
      ? []
      : [
          makeIssue('LUGAR.GRAFIA', field, `La grafía oficial es «${canonical}».`, {
            suggestion: canonical,
          }),
        ];
  }

  // 5. Municipio fuera del catálogo: tildes del histórico y formato tipo título.
  const titled = restoreAccents(toTitleCase(cleanNameChars(text)), ACCENT_PLACES);
  if (titled !== text) {
    if (normalizeKey(titled) === normalizeKey(text) && stripAccents(text) === text) {
      return [
        makeIssue('LUGAR.TILDES', field, `Debe llevar tilde: «${titled}».`, {
          suggestion: titled,
        }),
      ];
    }
    return [
      makeIssue('LUGAR.FORMATO', field, 'Escriba la ciudad en formato tipo título.', {
        suggestion: titled,
      }),
    ];
  }

  return [
    makeIssue(
      'LUGAR.NO_CATALOGADO',
      field,
      `«${text}» no está en el catálogo de municipios; verifique la grafía.`,
      { severity: 'warning' },
    ),
  ];
}

/* ------------------------------------------------------------------ */
/* Fechas                                                               */
/* ------------------------------------------------------------------ */

function validateSpanishDate(
  value: string,
  field: CanonicalField,
  bounds: { minYear?: number; maxYear?: number; allowRange?: boolean } = {},
): { issues: ValidationIssue[]; parsed: ParsedDate | null } {
  const spec = FIELD_SPECS[field];
  const text = collapseSpaces(value);
  if (!text) return { issues: emptyIssue(field), parsed: null };

  // Un curso se dicta entre dos fechas y el certificado lo imprime así:
  // «12 de junio al 4 de julio de 2026». Se admite y se normaliza el rango.
  if (bounds.allowRange) {
    const range = parseDateRange(text);
    if (range) {
      const issues: ValidationIssue[] = [];
      if (!isCanonicalSpanishRange(text)) {
        const canonical = formatSpanishRange(range);
        issues.push(
          makeIssue('FECHA.FORMATO_RANGO', field, `El rango debe escribirse «${canonical}».`, {
            suggestion: canonical,
          }),
        );
      }
      return { issues, parsed: range.start };
    }
  }

  const parsed = parseAnyDate(text);
  if (!parsed) {
    const ejemplo = bounds.allowRange
      ? '«15 de mayo de 2026» o «12 de junio al 4 de julio de 2026»'
      : '«15 de mayo de 2026»';
    return {
      issues: [
        makeIssue(
          'FECHA.ILEGIBLE',
          field,
          `${spec.label}: «${text}» no es una fecha reconocible. Use ${ejemplo}.`,
        ),
      ],
      parsed: null,
    };
  }

  const issues: ValidationIssue[] = [];

  if (parsed.ambiguous) {
    issues.push(
      makeIssue(
        'FECHA.AMBIGUA',
        field,
        `${spec.label}: «${text}» se interpretó como día/mes; confirme el orden.`,
        { severity: 'warning', suggestion: formatSpanish(parsed), manualOnly: true },
      ),
    );
  }
  if (bounds.minYear && parsed.year < bounds.minYear) {
    issues.push(
      makeIssue('FECHA.FUERA_RANGO', field, `${spec.label} anterior a ${bounds.minYear}.`, {
        severity: 'warning',
      }),
    );
  }
  if (bounds.maxYear && parsed.year > bounds.maxYear) {
    issues.push(
      makeIssue('FECHA.FUERA_RANGO', field, `${spec.label} posterior a ${bounds.maxYear}.`, {
        severity: 'warning',
      }),
    );
  }

  if (!isCanonicalSpanish(text)) {
    const canonical = formatSpanish(parsed);
    const leadingZero = /^0\d/.test(text);
    issues.push(
      makeIssue(
        leadingZero ? 'FECHA.CERO_INICIAL' : 'FECHA.FORMATO',
        field,
        leadingZero
          ? `El día no lleva cero inicial: «${canonical}».`
          : `${spec.label} debe escribirse «${canonical}».`,
        { suggestion: canonical },
      ),
    );
  }

  return { issues, parsed };
}

/* ------------------------------------------------------------------ */
/* Otros campos                                                         */
/* ------------------------------------------------------------------ */

const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

function validateEmail(value: string, field: CanonicalField): ValidationIssue[] {
  const raw = String(value ?? '');
  const text = raw.trim();
  if (!text) return emptyIssue(field);

  const cleaned = text.toLowerCase().replace(/\s+/g, '');
  if (!EMAIL_PATTERN.test(cleaned)) {
    return [makeIssue('CORREO.INVALIDO', field, `«${text}» no es un correo válido.`)];
  }
  if (cleaned !== raw) {
    return [
      makeIssue('CORREO.FORMATO', field, 'El correo debe ir en minúscula y sin espacios.', {
        suggestion: cleaned,
      }),
    ];
  }
  return [];
}

/**
 * Teléfono. Se admite el indicativo separado del número, que es como se
 * escribe normalmente: «+57 3052812384». Solo se reclama cuando hay
 * caracteres que no pintan nada o la cantidad de dígitos no cuadra.
 */
function validatePhone(value: string, field: CanonicalField): ValidationIssue[] {
  const text = collapseSpaces(value);
  if (!text) return [];

  const digits = text.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) {
    return [
      makeIssue(
        'TEL.INVALIDO',
        field,
        `«${text}» no parece un teléfono válido: debe tener entre 7 y 15 dígitos.`,
        { severity: 'warning' },
      ),
    ];
  }

  // `+`, dígitos y un espacio tras el indicativo. Nada más.
  if (!/^\+?\d+(?: \d+)*$/.test(text)) {
    const cleaned = text.replace(/[^\d+]/g, '');
    return [
      makeIssue(
        'TEL.FORMATO',
        field,
        'El teléfono solo admite dígitos, el prefijo «+» y un espacio tras el indicativo.',
        { severity: 'warning', suggestion: cleaned },
      ),
    ];
  }

  return [];
}

function validateGender(value: string): ValidationIssue[] {
  const field: CanonicalField = 'genero';
  const text = collapseSpaces(value);
  if (!text) return [];

  if (XERTIFY_GENDERS.includes(text)) return [];

  const key = normalizeKey(text);
  const suggestion =
    key.startsWith('m') || key === 'hombre' || key === 'masculino'
      ? 'M'
      : key.startsWith('f') || key === 'mujer' || key === 'femenino'
        ? 'F'
        : undefined;

  return [
    makeIssue('GENERO.INVALIDO', field, `El género solo admite «M» o «F».`, { suggestion }),
  ];
}

function validateNumber(value: string, field: CanonicalField): ValidationIssue[] {
  const spec = FIELD_SPECS[field];
  const text = collapseSpaces(value);
  if (!text) return emptyIssue(field);

  const normalized = text.replace(',', '.');
  const numeric = Number(normalized);

  if (!Number.isFinite(numeric)) {
    return [makeIssue('NUMERO.INVALIDO', field, `${spec.label} debe ser un número.`)];
  }
  if (numeric <= 0) {
    return [makeIssue('NUMERO.NO_POSITIVO', field, `${spec.label} debe ser mayor que cero.`)];
  }
  if (normalized !== text) {
    return [
      makeIssue('NUMERO.FORMATO', field, `${spec.label} debe usar punto decimal.`, {
        suggestion: normalized,
      }),
    ];
  }
  return [];
}

/** `li`, `fo`, `numre`: enteros de 1 a 99; la app los reasigna al registrar. */
function validateLedger(value: string, field: CanonicalField): ValidationIssue[] {
  const spec = FIELD_SPECS[field];
  const text = collapseSpaces(value);
  if (!text) return [];

  const numeric = Number(text);
  if (!Number.isInteger(numeric) || numeric <= 0) {
    return [
      makeIssue('LEDGER.INVALIDO', field, `${spec.label} debe ser un número entero positivo.`),
    ];
  }

  const max = field === 'numre' ? MAX_REGISTRO : MAX_FOLIO;
  if (field !== 'li' && numeric > max) {
    return [
      makeIssue(
        'LEDGER.FUERA_RANGO',
        field,
        `${spec.label} no puede pasar de ${max}. La app reasigna la numeración al registrar.`,
      ),
    ];
  }
  return [];
}

function validateFreeText(value: string, field: CanonicalField): ValidationIssue[] {
  const spec = FIELD_SPECS[field];
  const raw = String(value ?? '');
  const text = raw.trim();
  if (!text) return emptyIssue(field);

  if (raw !== text || /\s{2,}/.test(raw)) {
    return [
      makeIssue('TEXTO.ESPACIOS', field, `${spec.label} tiene espacios sobrantes:`, {
        severity: 'warning',
        suggestion: collapseSpaces(raw),
        preview: markExtraSpaces(raw),
      }),
    ];
  }

  // El nombre del curso va en mayúscula en la base, y en mayúscula también
  // lleva tilde: MARÍTIMA, INGENIERÍA, NAVEGACIÓN.
  const accented = restoreAccents(text, ACCENT_TEXT);
  if (accented !== text) {
    return [
      makeIssue('TEXTO.TILDES', field, `${spec.label} necesita tildes: «${accented}».`, {
        suggestion: accented,
      }),
    ];
  }

  return [];
}

/* ------------------------------------------------------------------ */
/* Validación de una fila                                               */
/* ------------------------------------------------------------------ */

export type RowValues = Record<CanonicalField, string>;

export function validateRow(
  values: RowValues,
  activeFields: Set<CanonicalField>,
): Partial<Record<CanonicalField, ValidationIssue[]>> {
  const out: Partial<Record<CanonicalField, ValidationIssue[]>> = {};
  const push = (field: CanonicalField, issues: ValidationIssue[]) => {
    if (issues.length) out[field] = [...(out[field] ?? []), ...issues];
  };
  const has = (field: CanonicalField) => activeFields.has(field);
  const currentYear = new Date().getFullYear();

  if (has('nombres')) push('nombres', validateName(values.nombres, 'nombres'));
  if (has('apellidos')) push('apellidos', validateName(values.apellidos, 'apellidos'));
  if (has('nomfirma1')) push('nomfirma1', validateName(values.nomfirma1, 'nomfirma1'));
  if (has('nomfirma2')) push('nomfirma2', validateName(values.nomfirma2, 'nomfirma2'));
  if (has('nomfirma3')) push('nomfirma3', validateName(values.nomfirma3, 'nomfirma3'));

  if (has('tipodocumento')) push('tipodocumento', validateDocumentType(values.tipodocumento));
  if (has('numerodocumento')) {
    push('numerodocumento', validateDocumentNumber(values.numerodocumento, values.tipodocumento));
  }
  if (has('docformato')) push('docformato', validateDocFormat(values.docformato, values.tipodocumento));

  // `LUGAREXPEDICION` dejó de ser obligatorio: si viene se revisa, si no, no
  // se reclama. `lugarexpi` no alimenta nada, así que no se valida: solo se
  // conserva tal cual al reexportar el archivo.
  if (has('lugarexpedicion') && collapseSpaces(values.lugarexpedicion)) {
    push('lugarexpedicion', validateCity(values.lugarexpedicion, 'lugarexpedicion'));
  }

  if (has('email')) push('email', validateEmail(values.email, 'email'));
  if (has('email2') && collapseSpaces(values.email2)) {
    push('email2', validateEmail(values.email2, 'email2'));
  }
  if (has('telefono')) push('telefono', validatePhone(values.telefono, 'telefono'));
  if (has('telefono2')) push('telefono2', validatePhone(values.telefono2, 'telefono2'));
  if (has('genero')) push('genero', validateGender(values.genero));

  let inicio: ParsedDate | null = null;
  let emite: ParsedDate | null = null;

  if (has('fechanacimiento2')) {
    push(
      'fechanacimiento2',
      validateSpanishDate(values.fechanacimiento2, 'fechanacimiento2', {
        minYear: 1900,
        maxYear: currentYear - 10,
      }).issues,
    );
  }
  if (has('fechaexpedicion')) {
    push(
      'fechaexpedicion',
      validateSpanishDate(values.fechaexpedicion, 'fechaexpedicion', {
        minYear: 1930,
        maxYear: currentYear,
      }).issues,
    );
  }
  if (has('fechainicio')) {
    const result = validateSpanishDate(values.fechainicio, 'fechainicio', {
      minYear: 1990,
      maxYear: currentYear + 2,
      allowRange: true,
    });
    push('fechainicio', result.issues);
    inicio = result.parsed;
  }
  if (has('fechaemite')) {
    const result = validateSpanishDate(values.fechaemite, 'fechaemite', {
      minYear: 1990,
      maxYear: currentYear + 2,
    });
    push('fechaemite', result.issues);
    emite = result.parsed;

    if (inicio && emite) {
      const inicioNum = inicio.year * 10000 + inicio.month * 100 + inicio.day;
      const emiteNum = emite.year * 10000 + emite.month * 100 + emite.day;
      if (emiteNum < inicioNum) {
        push('fechaemite', [
          makeIssue(
            'FECHA.EMISION_ANTERIOR',
            'fechaemite',
            `La emisión (${formatSpanish(emite)}) es anterior al inicio del curso ` +
              `(${formatSpanish(inicio)}).`,
          ),
        ]);
      }
    }
  }

  if (has('titulo')) push('titulo', validateFreeText(values.titulo, 'titulo'));
  if (has('intensidad')) push('intensidad', validateNumber(values.intensidad, 'intensidad'));
  if (has('direccion') && collapseSpaces(values.direccion)) {
    push('direccion', validateFreeText(values.direccion, 'direccion'));
  }

  if (has('li')) push('li', validateLedger(values.li, 'li'));
  if (has('fo')) push('fo', validateLedger(values.fo, 'fo'));
  if (has('numre')) push('numre', validateLedger(values.numre, 'numre'));

  return out;
}

/* ------------------------------------------------------------------ */
/* Validación a nivel de lote                                           */
/* ------------------------------------------------------------------ */

/** Números de documento repetidos dentro del mismo lote. */
export function findDuplicateDocuments(rows: StudentRow[]): Map<string, number[]> {
  const seen = new Map<string, number[]>();
  rows.forEach((row, index) => {
    const key = normalizeKey(row.cells.numerodocumento?.value ?? '').replace(/\s/g, '');
    if (!key) return;
    seen.set(key, [...(seen.get(key) ?? []), index]);
  });

  const duplicates = new Map<string, number[]>();
  for (const [key, indexes] of seen) {
    if (indexes.length > 1) duplicates.set(key, indexes);
  }
  return duplicates;
}

export function duplicateIssue(otherExcelRows: number[]): ValidationIssue {
  return makeIssue(
    'NUM.DUPLICADO',
    'numerodocumento',
    `Documento repetido en las filas ${otherExcelRows.join(', ')} del archivo.`,
  );
}

/** Resumen de nacionalidad del lote, para el comprobante. */
export function countNationalities(rows: StudentRow[]): {
  colombianos: number;
  extranjeros: number;
} {
  let colombianos = 0;
  let extranjeros = 0;
  for (const row of rows) {
    const parsed = parseDocumentType(row.cells.tipodocumento?.value ?? '');
    if (parsed.isColombian) colombianos += 1;
    else if (parsed.country) extranjeros += 1;
  }
  return { colombianos, extranjeros };
}

export { dbAbbreviationFor };
