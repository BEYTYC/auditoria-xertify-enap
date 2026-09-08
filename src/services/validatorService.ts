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
  CIVILIAN_TITLES,
  MILITARY_RANKS,
  NAME_CONNECTORS,
  NEVER_ACCENTED,
  RANK_SENIORITY,
} from '../data/names';
import { XERTIFY_DOC_FORMATS, XERTIFY_GENDERS } from '../data/xertifyParameters';
import { type CanonicalField, type StudentRow, type ValidationIssue } from '../types';
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
 *
 * En campos donde ningún espacio es válido —el correo, por ejemplo— se pide
 * `anySpace`, que marca todos, incluido uno solo entre palabras: ahí un
 * espacio de por sí ya es el error, así que también hay que señalarlo.
 */
export function markExtraSpaces(raw: string, options: { anySpace?: boolean } = {}): string {
  const MARCA = '\u0001';
  if (options.anySpace) {
    return String(raw).replace(/\s/g, MARCA);
  }
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
  actual: string,
  canonical: string,
): { code: string; message: string } {
  const mismasLetras =
    stripAccents(actual).toLocaleLowerCase('es-CO') ===
    stripAccents(canonical).toLocaleLowerCase('es-CO');

  if (!mismasLetras) {
    return {
      code: 'NOMBRE.ESCRITURA',
      message: `Corrección de escritura: «${canonical}».`,
    };
  }

  const cambianTildes =
    actual.toLocaleLowerCase('es-CO') !== canonical.toLocaleLowerCase('es-CO');
  const cambiaMayuscula = stripAccents(actual) !== stripAccents(canonical);
  // «Ruíz» → «Ruiz»: la corrección quita una tilde, no la pone. Se distingue
  // para no decirle a quien corrige que «necesita tildes» cuando es al revés.
  const sobraTilde = cambianTildes && hasAccent(actual) && !hasAccent(canonical);

  if (sobraTilde) {
    return {
      code: 'NOMBRE.TILDE_INDEBIDA',
      message: `Tiene una tilde que no lleva: se escribe «${canonical}», sin tilde.`,
    };
  }
  if (cambianTildes && cambiaMayuscula) {
    return {
      code: 'NOMBRE.TILDES_Y_MAYUSCULAS',
      message: `Necesita tildes y capitalizar: «${canonical}».`,
    };
  }
  if (cambianTildes) {
    return { code: 'NOMBRE.TILDES', message: `Necesita tildes: «${canonical}».` };
  }
  return {
    code: 'NOMBRE.MAYUSCULAS',
    message: `Necesita capitalizar: «${canonical}».`,
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
  return [makeIssue('CAMPO.VACIO', field, `Está vacío. ${reason}`, { severity })];
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
  // destruye: «CA Juan Pablo» quedaría «Ca Juan Pablo». Casi siempre un grado
  // militar son dos letras, pero la Infantería de Marina usa equivalencias
  // más largas («ALMCIM», «VALMCIM»…), así que esas se protegen sin importar
  // cuántas letras tengan.
  const acronyms = new Map<string, string>();
  const guarded = cleaned
    .split(' ')
    .map((word, index) => {
      const upper = stripAccents(word).toLocaleUpperCase('es-CO');

      // Un grado militar o una sigla civil (p. ej. «DO») se protegen con la
      // misma prioridad, antes del chequeo de conectores: si no, «DO»
      // colisiona con «do» (conector de apellido portugués) y pierde la
      // mayúscula.
      if (MILITARY_RANKS.has(upper) || CIVILIAN_TITLES.has(upper)) {
        const token = `\u0000${acronyms.size}\u0000`;
        acronyms.set(token, upper);
        return token;
      }

      if (!/^\p{L}{2}$/u.test(word)) return word;

      // `de`, `la`, `el` también son de dos letras: en un nombre escrito todo
      // en mayúsculas no se pueden confundir con un grado.
      if (NAME_CONNECTORS.has(normalizeKey(word))) return word;

      // El grado abre el nombre. Se protege el que ya viene en mayúscula
      // aunque no esté en el catálogo, pero solo si abre el nombre.
      const opensName = index === 0 && word === word.toLocaleUpperCase('es-CO');
      if (!opensName) return word;

      const token = `\u0000${acronyms.size}\u0000`;
      acronyms.set(token, upper);
      return token;
    })
    .join(' ');

  const titled = toTitleCase(guarded);
  const withDictionary = titled
    .split(' ')
    .map((word) => {
      if (!word) return word;
      if (hasAccent(word)) {
        // El diccionario solo restituye tildes que faltan; nunca retira una
        // que sobra. «Ruiz», «Luis» y «Cruz» son la única excepción: son
        // monosílabos que jamás llevan tilde, así que si llegan como «Ruíz»,
        // «Luís» o «Crúz» es un error de digitación, no una grafía válida.
        return NEVER_ACCENTED.has(normalizeKey(word)) ? stripAccents(word) : word;
      }
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
 * Grado militar (Oficial Naval o su equivalente en Infantería de Marina) con
 * que abre el nombre de un firmante, si lo trae. `null` si no se reconoce.
 */
function extractRank(raw: string): string | null {
  const first = collapseSpaces(raw).split(' ')[0] ?? '';
  const upper = stripAccents(first).toLocaleUpperCase('es-CO');
  return MILITARY_RANKS.has(upper) ? upper : null;
}

/**
 * `true` si la primera palabra es una sigla válida de grado: al menos dos
 * letras, en cualquier combinación de mayúsculas o minúsculas —no hace falta
 * que esté en el catálogo de grados militares, porque la Infantería de
 * Marina y el personal civil usan siglas que no siempre coinciden con esa
 * lista («DO», «OD», «PD»…)—.
 *
 * No se descarta por coincidir con un conector de apellido («do», «de»…):
 * en este campo la primera palabra siempre es el grado, nunca un conector,
 * así que aplicar esa lista aquí solo reintroduciría el problema original
 * («DO» leído como el conector portugués en vez de como grado).
 *
 * La usa el campo «Responsable que valida»: ese responsable siempre firma
 * con su grado, así que el campo no se da por completo si falta.
 */
export function startsWithGrado(raw: string): boolean {
  const first = collapseSpaces(raw).split(' ')[0] ?? '';
  if (!first) return false;
  const bare = first.replace(/[’'-]/g, '');
  return /^\p{L}{2,}$/u.test(bare);
}

/**
 * Ortografía canónica del campo «Responsable que valida»: la primera palabra
 * siempre es el grado en siglas y en mayúscula —sin importar cómo se haya
 * escrito—, y el resto sigue las mismas reglas de un nombre (`canonicalName`).
 */
export function canonicalResponsable(raw: string): string {
  const cleaned = cleanNameChars(raw);
  const words = cleaned.split(' ');
  const first = words[0] ?? '';

  if (!startsWithGrado(first)) return canonicalName(raw);

  const grado = stripAccents(first).toLocaleUpperCase('es-CO');
  const resto = words.slice(1).join(' ');
  const restoCanonico = resto ? canonicalName(resto) : '';
  return restoCanonico ? `${grado} ${restoCanonico}` : grado;
}

/**
 * El firmante 1 debe ser de menor jerarquía (menos antiguo) que el firmante
 * 2: por ejemplo, un Capitán de Fragata (firmante 1) firma junto a un
 * Contralmirante (firmante 2), nunca al revés. Solo se compara cuando ambos
 * grados se reconocen; si alguno no está en la tabla, no hay con qué comparar
 * y no se reclama nada.
 */
function validateSignerOrder(
  firma1: string,
  firma2: string,
): { firma1: ValidationIssue[]; firma2: ValidationIssue[] } {
  const rango1 = extractRank(firma1);
  const rango2 = extractRank(firma2);
  const nivel1 = rango1 ? RANK_SENIORITY[rango1] : undefined;
  const nivel2 = rango2 ? RANK_SENIORITY[rango2] : undefined;

  if (nivel1 === undefined || nivel2 === undefined || nivel1 >= nivel2) {
    return { firma1: [], firma2: [] };
  }

  // El firmante 1 quedó con un grado más alto que el firmante 2: van al revés.
  const mensaje =
    `El firmante 1 (${rango1}) debe ser de menor jerarquía que el firmante 2 (${rango2}); ` +
    'van en el orden contrario.';
  const issue = (field: CanonicalField, suggestion: string) =>
    makeIssue('FIRMA.ORDEN_JERARQUICO', field, mensaje, {
      severity: 'warning',
      suggestion,
      manualOnly: true,
    });

  return {
    firma1: [issue('nomfirma1', firma2)],
    firma2: [issue('nomfirma2', firma1)],
  };
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

/**
 * `ll` y `rr` son dígrafos legítimos del español; ninguna otra consonante se
 * dobla en una grafía estándar («Juann», «Carllos», «Anndrés» son siempre un
 * descuido de digitación). Las vocales dobles sí existen en nombres reales
 * («Aarón», «Isaac»), así que esas nunca se señalan.
 */
function findSuspiciousDoubleLetter(text: string): { original: string; suggestion: string } | null {
  const words = text.split(' ');
  for (const word of words) {
    const lower = stripAccents(word).toLocaleLowerCase('es-CO');
    for (let i = 0; i < lower.length - 1; i += 1) {
      const letter = lower[i];
      if (lower[i + 1] !== letter) continue;
      if (letter === 'l' || letter === 'r') continue;
      if (!/[bcdfghjkmnpqstvwxyz]/.test(letter)) continue;

      const fixedWord = word.slice(0, i + 1) + word.slice(i + 2);
      const suggestion = words.map((w) => (w === word ? fixedWord : w)).join(' ');
      return { original: word, suggestion };
    }
  }
  return null;
}

function validateName(value: string, field: CanonicalField): ValidationIssue[] {
  const raw = String(value ?? '');
  const text = raw.trim();

  if (!text) return emptyIssue(field);

  const forbidden = findForbiddenNameChars(text);
  if (forbidden.length) {
    return [
      makeIssue(
        'NOMBRE.CARACTERES',
        field,
        `Contiene caracteres no permitidos: ${forbidden.join(' ')}`,
        { suggestion: canonicalName(text) },
      ),
    ];
  }

  if (raw !== text || /\s{2,}/.test(raw)) {
    return [
      makeIssue('NOMBRE.ESPACIOS', field, 'Tiene espacios sobrantes:', {
        suggestion: canonicalName(raw),
        preview: markExtraSpaces(raw),
      }),
    ];
  }

  const canonical = canonicalName(text);
  if (canonical !== text) {
    const { code, message } = describeFix(text, canonical);
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

  // Posible error de digitación: una consonante doblada que no es «ll»/«rr».
  const doubled = findSuspiciousDoubleLetter(canonical);
  if (doubled) {
    return [
      makeIssue(
        'NOMBRE.LETRA_DOBLE',
        field,
        `«${doubled.original}» tiene una letra doblada poco común en español. ¿Fue un error de ` +
          `digitación? Verifique si es «${doubled.suggestion}».`,
        { severity: 'warning', suggestion: doubled.suggestion, manualOnly: true },
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

  // Regla institucional: a un extranjero no se le pide cédula de extranjería
  // colombiana; se identifica con el pasaporte o con el documento de
  // identidad de su propio país.
  if (parsed.isColombian && parsed.kind === 'Cédula de extranjería') {
    return [
      makeIssue(
        'DOC.CEDULA_EXTRANJERIA',
        field,
        'No se acepta «cédula de extranjería». Si el estudiante es extranjero, corrija el país y ' +
          'use su pasaporte o el documento de identidad de su propio país, p. ej. «México - CURP» ' +
          'o «Perú - DNI».',
      ),
    ];
  }

  // Un extranjero se identifica con pasaporte o con el documento propio de su
  // país: cualquier tipo que la lista Xertify ofrezca para ese país sirve.
  if (!parsed.isColombian && (!parsed.kind || !isKindAllowedFor(parsed.country, parsed.kind))) {
    const expected = expectedValueFor(parsed.country, parsed.kind);
    if (!expected) {
      return [
        makeIssue(
          'DOC.PAIS_SIN_PASAPORTE',
          field,
          `La lista de Xertify no ofrece un documento válido para ${parsed.country}. ` +
            'Verifique con Registro y Control qué valor usar.',
        ),
      ];
    }
    return [
      makeIssue(
        'DOC.EXTRANJERO_SIN_PASAPORTE',
        field,
        `Para ${parsed.country} el documento debe ser el pasaporte o el documento de identidad ` +
          `de su propio país, no «${parsed.kind ?? text}».`,
        { suggestion: expected },
      ),
    ];
  }

  // Un colombiano no puede quedar con un tipo que no sea colombiano.
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
          'tarjeta de identidad o registro civil.',
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

  // Pasaporte, o cualquier documento de un país distinto de Colombia (DNI,
  // CURP, RUT, id…): formato alfanumérico libre, sin separador de miles.
  if (parsed.isPassport || (!parsed.isColombian && parsed.country)) {
    const cleaned = cleanPassportNumber(text);
    if (cleaned !== text) {
      issues.push(
        makeIssue(
          'NUM.PASAPORTE_CARACTERES',
          field,
          'El documento no admite puntos, espacios ni guiones.',
          { suggestion: cleaned },
        ),
      );
    }
    if (!PASSPORT_PATTERN.test(cleaned)) {
      issues.push(
        makeIssue(
          'NUM.PASAPORTE_INVALIDO',
          field,
          'El número debe tener entre 5 y 20 caracteres alfanuméricos, sin símbolos.',
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
    // Si ya traía puntos pero mal puestos —un grupo sin sus tres dígitos,
    // como «7.9955.190»—, el número está mal escrito, no solo sin formato.
    const malAgrupada = text.includes('.');
    issues.push(
      malAgrupada
        ? makeIssue(
            'NUM.CEDULA_MAL_AGRUPADA',
            field,
            `El número está mal escrito: cada grupo entre puntos debe tener 3 dígitos. Debe ser ` +
              `«${formatted}».`,
            { suggestion: formatted },
          )
        : makeIssue(
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

/**
 * «NA», «No aplica» y equivalentes: el lugar de expedición del documento es
 * obligatorio cuando el campo viene diligenciado, así que estos valores nunca
 * se aceptan, aunque el campo en sí sea opcional cuando viene vacío.
 */
const LUGAR_NO_APLICA = new Set<string>([
  'na',
  'n a',
  'n/a',
  'no aplica',
  'no aplican',
  'no aplicaa',
  'ninguna',
  'ninguno',
  'no tiene',
]);

function validateCity(value: string, field: CanonicalField): ValidationIssue[] {
  const text = collapseSpaces(value);
  if (!text) return emptyIssue(field);

  const key = normalizeKey(text);

  // 0. «NA» / «No aplica»: no describe ningún lugar real, así que no se
  // trata como una grafía por corregir sino como un dato faltante.
  if (LUGAR_NO_APLICA.has(key)) {
    return [
      makeIssue(
        'LUGAR.NO_APLICA',
        field,
        `Es obligatorio si se diligencia: «${text}» no es un lugar válido.`,
      ),
    ];
  }

  // 1. Bogotá tiene una grafía obligatoria y prevalece sobre todo lo demás.
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

  // 4. Grafía oficial del catálogo: misma distinción que en nombres, para no
  // decir «necesita tildes» cuando en realidad es una corrección de escritura.
  const canonical = canonicalCity(text);
  if (canonical) {
    if (canonical === text) return [];
    const { code, message } = describeFix(text, canonical);
    return [makeIssue(code, field, message, { suggestion: canonical })];
  }

  // 5. Municipio fuera del catálogo: tildes del histórico y formato tipo título.
  const titled = restoreAccents(toTitleCase(cleanNameChars(text)), ACCENT_PLACES);
  if (titled !== text) {
    const { code, message } = describeFix(text, titled);
    return [makeIssue(code, field, message, { suggestion: titled })];
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
          `«${text}» no es una fecha reconocible. Use ${ejemplo}.`,
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
        `«${text}» se interpretó como día/mes; confirme el orden.`,
        { severity: 'warning', suggestion: formatSpanish(parsed), manualOnly: true },
      ),
    );
  }
  if (bounds.minYear && parsed.year < bounds.minYear) {
    issues.push(
      makeIssue('FECHA.FUERA_RANGO', field, `Anterior a ${bounds.minYear}.`, {
        severity: 'warning',
      }),
    );
  }
  if (bounds.maxYear && parsed.year > bounds.maxYear) {
    issues.push(
      makeIssue('FECHA.FUERA_RANGO', field, `Posterior a ${bounds.maxYear}.`, {
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
          : `Debe escribirse «${canonical}».`,
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
        preview: markExtraSpaces(raw, { anySpace: true }),
      }),
    ];
  }
  return [];
}

/**
 * Teléfono. Cuando lleva indicativo el formato es estricto: «+(código)
 * (espacio) (número)», con un único espacio y nada más — «+57 3052812384».
 * Sin indicativo, solo dígitos. Solo se reclama cuando hay caracteres que no
 * pintan nada, la cantidad de dígitos no cuadra, o el indicativo no queda
 * separado por un solo espacio.
 */
function validatePhone(value: string, field: CanonicalField): ValidationIssue[] {
  // Aquí no se usa `collapseSpaces`: un espacio doble entre el indicativo y
  // el número también hay que señalarlo, no solo el que falta.
  const text = String(value ?? '').trim();
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

  if (text.startsWith('+')) {
    if (/^\+\d{1,4} \d+$/.test(text)) return [];

    // Se armó mal: pegado, con varios espacios, o con guiones/paréntesis.
    // Se separa el indicativo probando los largos usuales (1 a 3 dígitos) y
    // dejando que el número final quede entre 7 y 10 dígitos.
    const groups = text.match(/\d+/g) ?? [];
    let code: string;
    let numberDigits: string;
    if (groups.length >= 2) {
      code = groups[0] ?? '';
      numberDigits = groups.slice(1).join('');
    } else {
      code = '';
      numberDigits = digits;
      for (const len of [1, 2, 3]) {
        const restante = digits.length - len;
        if (restante >= 7 && restante <= 10) {
          code = digits.slice(0, len);
          numberDigits = digits.slice(len);
          break;
        }
      }
      if (!code) {
        code = digits.slice(0, 2);
        numberDigits = digits.slice(2);
      }
    }
    return [
      makeIssue(
        'TEL.FORMATO',
        field,
        'Con indicativo, el teléfono debe escribirse «+(código) (número)», con un solo espacio ' +
          'entre los dos y nada más.',
        { severity: 'warning', suggestion: `+${code} ${numberDigits}` },
      ),
    ];
  }

  // Sin indicativo: solo dígitos, sin espacios ni otros caracteres.
  if (!/^\d+$/.test(text)) {
    return [
      makeIssue(
        'TEL.FORMATO',
        field,
        'El teléfono solo admite dígitos, o el prefijo «+» seguido del indicativo, un espacio y ' +
          'el número.',
        { severity: 'warning', suggestion: digits },
      ),
    ];
  }

  // Solo dígitos, bien escritos, pero sin el «+» del indicativo: siempre hay
  // que señalarlo, no solo cuando el indicativo está mal puesto. Un celular
  // colombiano tiene 10 dígitos y empieza por 3: ahí se propone «+57»; para
  // cualquier otro largo —puede ser de otro país— se avisa sin arriesgar
  // un código que no se puede adivinar.
  const suggestion = /^3\d{9}$/.test(text) ? `+57 ${text}` : undefined;
  return [
    makeIssue(
      'TEL.SIN_INDICATIVO',
      field,
      'Falta el indicativo del país: debe escribirse «+(código) (número)», por ejemplo ' +
        '«+57 3002850331».',
      { severity: 'warning', suggestion },
    ),
  ];
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
  const text = collapseSpaces(value);
  if (!text) return emptyIssue(field);

  const normalized = text.replace(',', '.');
  const numeric = Number(normalized);

  if (!Number.isFinite(numeric)) {
    return [makeIssue('NUMERO.INVALIDO', field, 'Debe ser un número.')];
  }
  if (numeric <= 0) {
    return [makeIssue('NUMERO.NO_POSITIVO', field, 'Debe ser mayor que cero.')];
  }
  if (normalized !== text) {
    return [
      makeIssue('NUMERO.FORMATO', field, 'Debe usar punto decimal.', {
        suggestion: normalized,
      }),
    ];
  }
  return [];
}

/**
 * `li`, `fo`, `numre`: la numeración del libro. La asigna la Oficina de
 * Estadística en el momento de registrar, nunca la facultad, así que estas
 * columnas tienen que llegar vacías; cualquier valor —válido o no— es una
 * novedad, casi siempre restos de un lote anterior copiado sobre la plantilla.
 */
function validateLedger(value: string, field: CanonicalField): ValidationIssue[] {
  const text = collapseSpaces(value);
  if (!text) return [];

  return [
    makeIssue(
      'LEDGER.DEBE_VENIR_VACIO',
      field,
      'Debe venir vacío: la numeración la asigna la Oficina de Estadística al registrar.',
    ),
  ];
}

function validateFreeText(value: string, field: CanonicalField): ValidationIssue[] {
  const raw = String(value ?? '');
  const text = raw.trim();
  if (!text) return emptyIssue(field);

  if (raw !== text || /\s{2,}/.test(raw)) {
    return [
      makeIssue('TEXTO.ESPACIOS', field, 'Tiene espacios sobrantes:', {
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
      makeIssue('TEXTO.TILDES', field, `Necesita tildes: «${accented}».`, {
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

  if (has('nomfirma1') && has('nomfirma2')) {
    const orden = validateSignerOrder(values.nomfirma1, values.nomfirma2);
    push('nomfirma1', orden.firma1);
    push('nomfirma2', orden.firma2);
  }

  if (has('tipodocumento')) push('tipodocumento', validateDocumentType(values.tipodocumento));
  if (has('numerodocumento')) {
    push('numerodocumento', validateDocumentNumber(values.numerodocumento, values.tipodocumento));
  }
  if (has('docformato')) push('docformato', validateDocFormat(values.docformato, values.tipodocumento));

  // Ninguna de las dos es obligatoria: si viene se revisa, si no, no se
  // reclama. `lugarexpi` es la que alimenta LUGAR EXPEDICION en la Base de
  // Datos (lugarexpedicion queda como respaldo si esa viene vacía).
  if (has('lugarexpedicion') && collapseSpaces(values.lugarexpedicion)) {
    push('lugarexpedicion', validateCity(values.lugarexpedicion, 'lugarexpedicion'));
  }
  if (has('lugarexpi') && collapseSpaces(values.lugarexpi)) {
    push('lugarexpi', validateCity(values.lugarexpi, 'lugarexpi'));
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
