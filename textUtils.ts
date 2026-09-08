/**
 * textUtils.ts
 * Primitivas de normalización de texto compartidas por el validador,
 * el autocorrector y el mapeador de encabezados.
 */

import {
  ACCENT_DICTIONARY,
  CAPITALIZED_WHEN_LEADING,
  NAME_CONNECTORS,
} from '../data/names';

/** Elimina diacríticos conservando la `ñ` como `n` (útil solo para comparar). */
export function stripAccents(input: string): string {
  return input.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Colapsa espacios internos y recorta extremos. */
export function collapseSpaces(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

/**
 * Clave de comparación: minúsculas, sin tildes, sin puntuación,
 * espacios colapsados. Se usa para buscar en los diccionarios.
 */
export function normalizeKey(input: string): string {
  return collapseSpaces(
    stripAccents(String(input ?? ''))
      .toLowerCase()
      .replace(/[^a-z0-9ñ\s]/g, ' '),
  );
}

/** Convierte a texto plano seguro, tolerando `null`, `undefined` y números. */
export function toText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/** Detecta caracteres prohibidos en nombres y apellidos. */
const FORBIDDEN_NAME_CHARS = /[0-9@$#_%^&*()[\]{}<>+=|\\/~`"?!;:,]/;

export function findForbiddenNameChars(input: string): string[] {
  const found = new Set<string>();
  for (const ch of input) {
    if (FORBIDDEN_NAME_CHARS.test(ch)) found.add(ch);
  }
  return [...found];
}

/** Quita todo lo que no sea letra hispana, espacio, apóstrofo o guion. */
export function cleanNameChars(input: string): string {
  return collapseSpaces(input.replace(/[^\p{L}\s'’-]/gu, ' '));
}

/**
 * Title Case respetando conectores en minúscula.
 * - La primera palabra siempre va capitalizada.
 * - `San` / `Santa` se capitalizan también al abrir un apellido compuesto.
 * - Preserva guiones internos (`Ana-María`) y apóstrofos (`D'Angelo`).
 */
export function toTitleCase(input: string): string {
  const words = collapseSpaces(input).split(' ');

  return words
    .map((word, index) => {
      if (!word) return word;
      const key = normalizeKey(word);

      if (index > 0 && NAME_CONNECTORS.has(key) && !CAPITALIZED_WHEN_LEADING.has(key)) {
        return key === 'e' || key === 'y' ? key : word.toLowerCase();
      }

      return capitalizeCompound(word);
    })
    .join(' ');
}

/** Capitaliza una palabra respetando separadores internos `-` y `'`. */
function capitalizeCompound(word: string): string {
  return word
    .split(/([-'’])/)
    .map((part) => {
      if (part === '-' || part === "'" || part === '’') return part;
      if (!part) return part;
      return part.charAt(0).toLocaleUpperCase('es-CO') + part.slice(1).toLocaleLowerCase('es-CO');
    })
    .join('');
}

/* ------------------------------------------------------------------ */
/* Títulos para mostrar en pantalla                                     */
/* ------------------------------------------------------------------ */

/**
 * Palabras que van en minúscula dentro de un título, salvo si lo abren:
 * artículos, preposiciones y conjunciones.
 */
const TITLE_LOWERCASE = new Set([
  'a',
  'al',
  'ante',
  'con',
  'contra',
  'de',
  'del',
  'e',
  'el',
  'en',
  'entre',
  'la',
  'las',
  'lo',
  'los',
  'o',
  'para',
  'por',
  'sobre',
  'u',
  'un',
  'una',
  'y',
]);

/** Siglas que conservan la mayúscula aunque tengan vocales. */
const TITLE_ACRONYMS = new Set([
  'ARC',
  'BASC',
  'CIOH',
  'DIMAR',
  'ENAP',
  'HSEQ',
  'IALA',
  'IMO',
  'ISO',
  'ISPS',
  'OMI',
  'ONU',
  'OTAN',
  'PBIP',
  'SAR',
  'SGSST',
  'TIC',
  'TICS',
]);

/**
 * Capitaliza un título para mostrarlo: «DIVISIÓN CIENCIAS SOCIALES» queda
 * «División Ciencias Sociales», con los artículos en minúscula.
 *
 * Respeta lo que evidentemente es una sigla o un código —sin vocales
 * (`STCW`), con dígitos (`B1`) o del catálogo (`ENAP`)—, para no convertir
 * «ENAP» en «Enap».
 */
export function toDisplayTitle(input: string): string {
  const words = collapseSpaces(input).split(' ');

  return words
    .map((word, index) => {
      if (!word) return word;

      const key = normalizeKey(word);
      if (index > 0 && TITLE_LOWERCASE.has(key)) return word.toLocaleLowerCase('es-CO');

      const bare = word.replace(/[^\p{L}\p{N}]/gu, '');
      const isUpper = bare.length > 0 && bare === bare.toLocaleUpperCase('es-CO');
      const hasDigit = /\p{N}/u.test(bare);
      const hasVowel = /[AEIOU]/.test(stripAccents(bare).toLocaleUpperCase('es-CO'));

      // Siglas y códigos: se dejan tal cual.
      if (isUpper && (hasDigit || !hasVowel || TITLE_ACRONYMS.has(bare.toLocaleUpperCase('es-CO')))) {
        return word;
      }

      return capitalizeCompound(word);
    })
    .join(' ');
}

/** `true` si el texto contiene al menos un carácter acentuado. */
export function hasAccent(input: string): boolean {
  return stripAccents(input) !== input;
}

/**
 * Restaura tildes usando el diccionario, palabra por palabra.
 * Solo actúa sobre palabras escritas sin ningún diacrítico, para no
 * sobrescribir una grafía que el usuario ya acentuó deliberadamente.
 */
export function applyAccentDictionary(input: string): string {
  return collapseSpaces(input)
    .split(' ')
    .map((word) => {
      if (!word || hasAccent(word)) return word;
      const canonical = ACCENT_DICTIONARY[normalizeKey(word)];
      if (!canonical) return word;
      // Conserva el papel de conector si la palabra lo era.
      return canonical;
    })
    .join(' ');
}

/** Compara dos textos ignorando tildes, mayúsculas y puntuación. */
export function looseEquals(a: string, b: string): boolean {
  return normalizeKey(a) === normalizeKey(b);
}

/** Distancia de Levenshtein acotada, usada para sugerencias de encabezados. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
    }
    previous = current;
  }

  return previous[b.length];
}

/** Similitud 0..1 derivada de la distancia de Levenshtein. */
export function similarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  if (max === 0) return 1;
  return 1 - levenshtein(a, b) / max;
}

/* ------------------------------------------------------------------ */
/* Restitución de tildes                                               */
/* ------------------------------------------------------------------ */

/**
 * Copia el patrón de mayúsculas de `word` sobre `canonical`.
 * Ambas tienen la misma longitud porque solo difieren en diacríticos:
 * `IBAGUE` + `IBAGUÉ` → `IBAGUÉ`; `Ibague` + `IBAGUÉ` → `Ibagué`.
 */
export function applyCasePattern(word: string, canonical: string): string {
  if (word.length !== canonical.length) return canonical;
  let out = '';
  for (let i = 0; i < word.length; i += 1) {
    const isLower = word[i] === word[i].toLocaleLowerCase('es-CO');
    out += isLower
      ? canonical[i].toLocaleLowerCase('es-CO')
      : canonical[i].toLocaleUpperCase('es-CO');
  }
  return out;
}

/**
 * Restituye tildes palabra por palabra usando el diccionario indicado,
 * conservando mayúsculas y minúsculas. Una palabra que el usuario ya escribió
 * con algún diacrítico se deja intacta.
 *
 * `skip` recibe las claves que no deben tocarse (ver `AMBIGUOUS_ENYE`).
 */
export function restoreAccents(
  text: string,
  dictionary: Record<string, string>,
  skip?: ReadonlySet<string>,
): string {
  return text.replace(/\p{L}+/gu, (word) => {
    if (hasAccent(word)) return word;
    const key = stripAccents(word).toLocaleUpperCase('es-CO');
    if (skip?.has(key)) return word;
    const canonical = dictionary[key];
    if (!canonical) return word;
    return applyCasePattern(word, canonical);
  });
}

/**
 * `true` si la única diferencia entre las dos grafías es una `n` que pasa a `ñ`.
 *
 * Importa porque no es lo mismo ponerle la tilde a «Gomez» que convertir
 * «Nino» en «Niño»: ambos son apellidos reales y distintos, así que ese
 * cambio se sugiere pero nunca se aplica solo.
 */
export function isEnyeChange(word: string, canonical: string): boolean {
  if (word.length !== canonical.length) return false;
  let enye = false;
  for (let i = 0; i < word.length; i += 1) {
    const a = stripAccents(word[i]).toLocaleUpperCase('es-CO');
    const b = stripAccents(canonical[i]).toLocaleUpperCase('es-CO');
    if (a !== b) return false;
    const isEnyeHere =
      canonical[i].toLocaleUpperCase('es-CO') === 'Ñ' &&
      word[i].toLocaleUpperCase('es-CO') === 'N';
    if (isEnyeHere) enye = true;
  }
  return enye;
}

/** Palabras del texto cuya clave está en `skip` y cuya grafía cambiaría. */
export function findSkippedWords(
  text: string,
  dictionary: Record<string, string>,
  skip: ReadonlySet<string>,
): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(/\p{L}+/gu)) {
    const word = match[0];
    if (hasAccent(word)) continue;
    const key = stripAccents(word).toLocaleUpperCase('es-CO');
    if (skip.has(key) && dictionary[key]) found.push(word);
  }
  return found;
}
