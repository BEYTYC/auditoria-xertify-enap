/**
 * dateService.ts
 * Análisis y formateo de fechas en español e inglés para la plantilla.
 *
 * Formato español exigido : `15 de mayo de 1990`  (día sin cero inicial,
 *                            mes en minúscula, conector `de` antes del año)
 * Formato inglés exigido  : `May 15, 2026`
 */

import { collapseSpaces, normalizeKey } from './textUtils';

export const MONTHS_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

export const MONTHS_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** Alias normalizados de meses → índice 0..11. */
const MONTH_LOOKUP: Record<string, number> = {};

MONTHS_ES.forEach((name, index) => {
  MONTH_LOOKUP[normalizeKey(name)] = index;
});
MONTHS_EN.forEach((name, index) => {
  MONTH_LOOKUP[normalizeKey(name)] = index;
});

// Abreviaturas y variantes frecuentes.
Object.assign(MONTH_LOOKUP, {
  ene: 0,
  jan: 0,
  feb: 1,
  mar: 2,
  abr: 3,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  ago: 7,
  aug: 7,
  sep: 8,
  sept: 8,
  set: 8,
  setiembre: 8,
  oct: 9,
  nov: 10,
  dic: 11,
  dec: 11,
});

export interface ParsedDate {
  /** Año, mes (1..12) y día tal como se interpretaron. */
  year: number;
  month: number;
  day: number;
  /** `true` si la interpretación día/mes fue ambigua (ambos ≤ 12). */
  ambiguous: boolean;
  /** Formato del que provino, para diagnóstico. */
  source: 'serial' | 'iso' | 'numeric' | 'spanish' | 'english' | 'date-object';
}

/* ------------------------------------------------------------------ */
/* Utilidades de calendario                                             */
/* ------------------------------------------------------------------ */

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1900 || year > 2200) return false;
  if (month < 1 || month > 12) return false;
  return day >= 1 && day <= daysInMonth(year, month);
}

/** Convierte un número de serie de Excel (base 1899-12-30) a fecha. */
export function excelSerialToParts(serial: number): ParsedDate | null {
  if (!Number.isFinite(serial) || serial <= 0 || serial > 100000) return null;
  const millis = Math.round(serial) * 86400000;
  const base = Date.UTC(1899, 11, 30);
  const date = new Date(base + millis);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    ambiguous: false,
    source: 'serial',
  };
}

/* ------------------------------------------------------------------ */
/* Parsing                                                              */
/* ------------------------------------------------------------------ */

/**
 * Interpreta prácticamente cualquier forma de fecha encontrada en plantillas
 * reales. Devuelve `null` si el texto no representa una fecha reconocible.
 */
export function parseAnyDate(raw: unknown): ParsedDate | null {
  if (raw === null || raw === undefined) return null;

  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return {
      year: raw.getUTCFullYear(),
      month: raw.getUTCMonth() + 1,
      day: raw.getUTCDate(),
      ambiguous: false,
      source: 'date-object',
    };
  }

  if (typeof raw === 'number') {
    return excelSerialToParts(raw);
  }

  const text = collapseSpaces(String(raw));
  if (!text) return null;

  // Número de serie de Excel exportado como texto.
  if (/^\d{5}(\.\d+)?$/.test(text)) {
    return excelSerialToParts(Number(text));
  }

  // ISO: 1990-05-15 (o con hora)
  const iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T ].*)?$/);
  if (iso) {
    const [, y, m, d] = iso;
    const parts = { year: +y, month: +m, day: +d, ambiguous: false, source: 'iso' as const };
    return isValidCalendarDate(parts.year, parts.month, parts.day) ? parts : null;
  }

  // Español: "15 de mayo de 1990" / "15 mayo 1990" / "15-mayo-1990"
  const spanish = text.match(
    /^(\d{1,2})\s*(?:de\s+|[-/.\s])\s*([a-zA-ZáéíóúÁÉÍÓÚñÑ]+)\.?\s*(?:de\s+|[-/.\s])\s*(\d{4})$/i,
  );
  if (spanish) {
    const [, d, monthWord, y] = spanish;
    const monthIndex = MONTH_LOOKUP[normalizeKey(monthWord)];
    if (monthIndex !== undefined) {
      const parts = {
        year: +y,
        month: monthIndex + 1,
        day: +d,
        ambiguous: false,
        source: 'spanish' as const,
      };
      return isValidCalendarDate(parts.year, parts.month, parts.day) ? parts : null;
    }
  }

  // Inglés: "May 15, 2026" / "May 15 2026" / "Sept. 3, 2026"
  const english = text.match(/^([a-zA-Z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/);
  if (english) {
    const [, monthWord, d, y] = english;
    const monthIndex = MONTH_LOOKUP[normalizeKey(monthWord)];
    if (monthIndex !== undefined) {
      const parts = {
        year: +y,
        month: monthIndex + 1,
        day: +d,
        ambiguous: false,
        source: 'english' as const,
      };
      return isValidCalendarDate(parts.year, parts.month, parts.day) ? parts : null;
    }
  }

  // Inglés invertido: "15 May 2026"
  const englishAlt = text.match(/^(\d{1,2})\s+([a-zA-Z]+)\.?,?\s+(\d{4})$/);
  if (englishAlt) {
    const [, d, monthWord, y] = englishAlt;
    const monthIndex = MONTH_LOOKUP[normalizeKey(monthWord)];
    if (monthIndex !== undefined) {
      const parts = {
        year: +y,
        month: monthIndex + 1,
        day: +d,
        ambiguous: false,
        source: 'english' as const,
      };
      return isValidCalendarDate(parts.year, parts.month, parts.day) ? parts : null;
    }
  }

  // Numérico: 15/05/1990, 15-05-1990, 15.05.1990 — se asume DD/MM/AAAA.
  const numeric = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (numeric) {
    let [, first, second, y] = numeric;
    let year = +y;
    if (year < 100) year += year < 50 ? 2000 : 1900;

    let day = +first;
    let month = +second;
    let ambiguous = day <= 12 && month <= 12 && day !== month;

    // Si el segundo campo no puede ser un mes, el orden era MM/DD/AAAA.
    if (month > 12 && day <= 12) {
      [day, month] = [month, day];
      ambiguous = false;
    }

    if (isValidCalendarDate(year, month, day)) {
      return { year, month, day, ambiguous, source: 'numeric' };
    }
    return null;
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* Formateo                                                             */
/* ------------------------------------------------------------------ */

/** `15 de mayo de 1990` */
export function formatSpanish(date: ParsedDate): string {
  return `${date.day} de ${MONTHS_ES[date.month - 1]} de ${date.year}`;
}

/** Sufijo ordinal inglés: 1st, 2nd, 3rd, 4th… */
export function ordinalSuffix(day: number): string {
  if (day % 100 >= 11 && day % 100 <= 13) return 'th';
  if (day % 10 === 1) return 'st';
  if (day % 10 === 2) return 'nd';
  if (day % 10 === 3) return 'rd';
  return 'th';
}

/**
 * `January 1st, 2025` — formato usado por la lista `Parameters!M` de la
 * plantilla Xertify.
 */
export function formatEnglish(date: ParsedDate): string {
  return `${MONTHS_EN[date.month - 1]} ${date.day}${ordinalSuffix(date.day)}, ${date.year}`;
}

/** `true` si el texto ya cumple exactamente el formato español exigido. */
export function isCanonicalSpanish(text: string): boolean {
  const parsed = parseAnyDate(text);
  if (!parsed) return false;
  return text.trim() === formatSpanish(parsed);
}

/** `true` si el texto ya cumple exactamente el formato inglés exigido. */
export function isCanonicalEnglish(text: string): boolean {
  const parsed = parseAnyDate(text);
  if (!parsed) return false;
  return text.trim() === formatEnglish(parsed);
}

/* ------------------------------------------------------------------ */
/* Reglas de vigencia                                                   */
/* ------------------------------------------------------------------ */

/**
 * Suma años calendario conservando día y mes.
 * El 29 de febrero se ajusta al 28 cuando el año destino no es bisiesto.
 */
export function addYears(date: ParsedDate, years: number): ParsedDate {
  const year = date.year + years;
  const day = Math.min(date.day, daysInMonth(year, date.month));
  return { ...date, year, day, ambiguous: false };
}

export function sameDay(a: ParsedDate, b: ParsedDate): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

/** Años de vigencia de un certificado, según la regla institucional. */
export const VALIDITY_YEARS = 5;

/* ------------------------------------------------------------------ */
/* Rangos de fechas                                                     */
/* ------------------------------------------------------------------ */

/**
 * Un curso suele dictarse entre dos fechas y el certificado lo imprime así:
 * «12 de junio al 4 de julio de 2026». La columna `fechainicio` admite ese
 * rango además de una fecha suelta.
 */
export interface ParsedRange {
  start: ParsedDate;
  end: ParsedDate;
}

/** Separadores admitidos entre las dos fechas de un rango. */
const RANGE_SEPARATOR = /\s+(?:al|a|hasta)\s+|\s+[-–—]\s+/i;

/**
 * Interpreta un rango. Acepta que el mes o el año aparezcan una sola vez:
 *   «12 al 15 de junio de 2026»
 *   «12 de junio al 4 de julio de 2026»
 *   «12 de diciembre de 2025 al 4 de enero de 2026»
 * Devuelve `null` si el texto no es un rango reconocible.
 */
export function parseDateRange(raw: unknown): ParsedRange | null {
  const text = collapseSpaces(String(raw ?? ''));
  if (!text) return null;

  const parts = text.split(RANGE_SEPARATOR);
  if (parts.length !== 2) return null;

  const [left, right] = parts.map((part) => collapseSpaces(part));
  if (!left || !right) return null;

  // El extremo derecho siempre está completo: de ahí salen el mes y el año
  // que le falten al izquierdo.
  const end = parseAnyDate(right);
  if (!end) return null;

  const start =
    parseAnyDate(left) ??
    // «12 de junio» → le falta el año
    parseAnyDate(`${left} de ${end.year}`) ??
    // «12» → le faltan mes y año
    parseAnyDate(`${left} de ${MONTHS_ES[end.month - 1]} de ${end.year}`);

  if (!start) return null;

  const startNumber = start.year * 10000 + start.month * 100 + start.day;
  const endNumber = end.year * 10000 + end.month * 100 + end.day;
  if (startNumber > endNumber) return null;

  return { start, end };
}

/**
 * Escribe el rango en la forma más corta que siga siendo inequívoca:
 *   mismo mes y año  → «12 al 15 de junio de 2026»
 *   mismo año        → «12 de junio al 4 de julio de 2026»
 *   distinto año     → «12 de diciembre de 2025 al 4 de enero de 2026»
 */
export function formatSpanishRange(range: ParsedRange): string {
  const { start, end } = range;

  // El separador es «a», no «al»: «2 de septiembre a 5 de octubre de 2025».
  if (start.year === end.year && start.month === end.month) {
    return `${start.day} a ${end.day} de ${MONTHS_ES[start.month - 1]} de ${start.year}`;
  }
  if (start.year === end.year) {
    return `${start.day} de ${MONTHS_ES[start.month - 1]} a ${formatSpanish(end)}`;
  }
  return `${formatSpanish(start)} a ${formatSpanish(end)}`;
}

/**
 * `true` si el texto ya está escrito como el rango canónico.
 *
 * El `de` antes del año final es opcional: «19 de febrero al 9 de mayo 2026»
 * y «19 de febrero al 9 de mayo de 2026» se consideran igual de correctos, y
 * no tiene sentido marcar como error una diferencia que nadie percibe.
 */
export function isCanonicalSpanishRange(text: string): boolean {
  const range = parseDateRange(text);
  if (!range) return false;

  const canonical = formatSpanishRange(range);
  const sinDeFinal = canonical.replace(/ de (\d{4})$/, ' $1');
  const actual = text.trim();
  return actual === canonical || actual === sinDeFinal;
}
