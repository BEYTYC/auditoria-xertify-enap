/**
 * documentService.ts
 * Interpretación de la columna `TIPODOCUMENTO` contra la lista literal de
 * Xertify, y normalización del número de documento.
 *
 * Regla institucional: el estudiante con país extranjero se identifica con el
 * PASAPORTE de su país, o con el documento de identidad propio de ese país
 * (el que ofrezca la lista Xertify: DNI, CURP, RUT, id…). No se acepta la
 * «cédula de extranjería» colombiana: si el estudiante es extranjero, se
 * corrige el país y se usa su propio documento.
 */

import {
  COLOMBIAN_ALLOWED_KINDS,
  COUNTRY_ALIASES,
  DB_ABBREVIATION_ALIASES,
  DB_DOC_ABBREVIATIONS,
  DB_DOC_FALLBACK,
  PASSPORT_KINDS,
} from '../data/countries';
import { XERTIFY_DOCUMENT_TYPES, XERTIFY_DOC_FORMATS } from '../data/xertifyParameters';
import type { ParsedDocument } from '../types';
import { collapseSpaces, normalizeKey, similarity } from './textUtils';

/* ------------------------------------------------------------------ */
/* Índices derivados de la lista Xertify                                */
/* ------------------------------------------------------------------ */

export interface XertifyEntry {
  /** Valor exacto, p.ej. `Colombia - Cédula de ciudadanía`. */
  value: string;
  country: string;
  kind: string;
  isPassport: boolean;
}

export const XERTIFY_ENTRIES: XertifyEntry[] = XERTIFY_DOCUMENT_TYPES.map((value) => {
  const separator = value.indexOf(' - ');
  const country = separator === -1 ? value : value.slice(0, separator);
  const kind = separator === -1 ? '' : value.slice(separator + 3);
  return {
    value,
    country,
    kind,
    isPassport: PASSPORT_KINDS.some((p) => p.toLowerCase() === kind.toLowerCase()),
  };
});

/** Valor exacto → entrada. */
const BY_EXACT = new Map(XERTIFY_ENTRIES.map((e) => [e.value, e]));
/** Valor normalizado → entrada (tolera mayúsculas, tildes y puntuación). */
const BY_NORMALIZED = new Map(XERTIFY_ENTRIES.map((e) => [normalizeKey(e.value), e]));
/** País → entradas de ese país. */
const BY_COUNTRY = new Map<string, XertifyEntry[]>();
for (const entry of XERTIFY_ENTRIES) {
  BY_COUNTRY.set(entry.country, [...(BY_COUNTRY.get(entry.country) ?? []), entry]);
}
/** País normalizado → país oficial de la lista. */
const COUNTRY_BY_NORMALIZED = new Map(
  [...BY_COUNTRY.keys()].map((country) => [normalizeKey(country), country]),
);

export const XERTIFY_COUNTRIES = [...BY_COUNTRY.keys()].sort((a, b) => a.localeCompare(b, 'es'));

/* ------------------------------------------------------------------ */
/* Resolución de país y tipo                                            */
/* ------------------------------------------------------------------ */

/** Resuelve texto libre al nombre de país que usa Xertify. */
export function resolveCountry(raw: string): string | null {
  const key = normalizeKey(raw);
  if (!key) return null;

  const exact = COUNTRY_BY_NORMALIZED.get(key);
  if (exact) return exact;

  const alias = COUNTRY_ALIASES[key];
  if (alias) return alias;

  let best: { name: string; score: number } | null = null;
  for (const [normalized, name] of COUNTRY_BY_NORMALIZED) {
    const score = similarity(key, normalized);
    if (!best || score > best.score) best = { name, score };
  }
  return best && best.score >= 0.85 ? best.name : null;
}

/** Entrada de pasaporte del país indicado, si Xertify la ofrece. */
export function passportEntryFor(country: string): XertifyEntry | null {
  return (BY_COUNTRY.get(country) ?? []).find((e) => e.isPassport) ?? null;
}

/** Entradas disponibles para un país (para el selector de la UI). */
export function entriesFor(country: string): XertifyEntry[] {
  return BY_COUNTRY.get(country) ?? [];
}

/**
 * Interpreta el contenido de `TIPODOCUMENTO`.
 * Prioriza la coincidencia exacta con la lista; si falla, intenta deducir
 * país y tipo para poder sugerir el valor correcto.
 */
export function parseDocumentType(raw: string): ParsedDocument {
  const text = collapseSpaces(raw);
  const empty: ParsedDocument = {
    country: null,
    kind: null,
    exactValue: null,
    isColombian: false,
    isPassport: false,
  };
  if (!text) return empty;

  // 1. Coincidencia exacta con la lista Xertify.
  const exact = BY_EXACT.get(text);
  if (exact) {
    return {
      country: exact.country,
      kind: exact.kind,
      exactValue: exact.value,
      isColombian: exact.country === 'Colombia',
      isPassport: exact.isPassport,
    };
  }

  // 2. Coincidencia ignorando mayúsculas, tildes y puntuación.
  const normalized = BY_NORMALIZED.get(normalizeKey(text));
  if (normalized) {
    return {
      country: normalized.country,
      kind: normalized.kind,
      exactValue: normalized.value,
      isColombian: normalized.country === 'Colombia',
      isPassport: normalized.isPassport,
    };
  }

  // 3. Descomposición manual `algo - algo`.
  const parts = text
    .split(/\s*[-–—|/]\s*/)
    .map((p) => collapseSpaces(p))
    .filter(Boolean);

  if (parts.length >= 2) {
    const country = resolveCountry(parts[0]) ?? resolveCountry(parts[parts.length - 1]);
    const kindText = country && resolveCountry(parts[0]) ? parts.slice(1).join(' - ') : parts[0];

    if (country) {
      const candidates = BY_COUNTRY.get(country) ?? [];
      let best: { entry: XertifyEntry; score: number } | null = null;
      for (const candidate of candidates) {
        const score = similarity(normalizeKey(kindText), normalizeKey(candidate.kind));
        if (!best || score > best.score) best = { entry: candidate, score };
      }
      if (best && best.score >= 0.7) {
        return {
          country,
          kind: best.entry.kind,
          exactValue: best.entry.value,
          isColombian: country === 'Colombia',
          isPassport: best.entry.isPassport,
        };
      }
      const isPassport = /pasaporte|passport/i.test(kindText);
      return {
        country,
        kind: collapseSpaces(kindText) || null,
        exactValue: null,
        isColombian: country === 'Colombia',
        isPassport,
      };
    }
  }

  // 4. Solo el país, o solo el tipo.
  const countryOnly = resolveCountry(text);
  if (countryOnly) {
    return {
      country: countryOnly,
      kind: null,
      exactValue: null,
      isColombian: countryOnly === 'Colombia',
      isPassport: false,
    };
  }

  const abbreviation = DB_ABBREVIATION_ALIASES[normalizeKey(text)];
  if (abbreviation) {
    // Abreviaturas sueltas (CC, TI, PS) se asumen colombianas salvo pasaporte.
    const kind =
      abbreviation === 'CC'
        ? 'Cédula de ciudadanía'
        : abbreviation === 'TI'
          ? 'Tarjeta de identidad'
          : abbreviation === 'RC'
            ? 'Registro civil'
            : abbreviation === 'PS'
              ? 'Pasaporte'
              : 'Cédula de extranjería';
    return {
      country: 'Colombia',
      kind,
      exactValue: BY_EXACT.get(`Colombia - ${kind}`)?.value ?? null,
      isColombian: true,
      isPassport: abbreviation === 'PS',
    };
  }

  return empty;
}

/**
 * `true` si el tipo es admisible para el país, según la regla institucional.
 *
 * Para Colombia, solo los documentos colombianos propiamente dichos (ninguno
 * de extranjero). Para cualquier otro país, cualquier tipo que la lista
 * Xertify ofrezca para ese país sirve: pasaporte o el documento de identidad
 * propio del país (DNI, CURP, RUT, id…).
 */
export function isKindAllowedFor(country: string, kind: string): boolean {
  if (country === 'Colombia') return COLOMBIAN_ALLOWED_KINDS.includes(kind);
  return (BY_COUNTRY.get(country) ?? []).some((e) => e.kind === kind);
}

/** Valor Xertify que debería llevar la fila, dado el país detectado. */
export function expectedValueFor(country: string, currentKind: string | null): string | null {
  if (country === 'Colombia') {
    if (currentKind && isKindAllowedFor(country, currentKind)) {
      return BY_EXACT.get(`Colombia - ${currentKind}`)?.value ?? null;
    }
    return 'Colombia - Cédula de ciudadanía';
  }
  if (currentKind && isKindAllowedFor(country, currentKind)) {
    return BY_EXACT.get(`${country} - ${currentKind}`)?.value ?? null;
  }
  return passportEntryFor(country)?.value ?? null;
}

/* ------------------------------------------------------------------ */
/* docformato                                                           */
/* ------------------------------------------------------------------ */

/** Valor de la columna `docformato` que corresponde al tipo de documento. */
export function docFormatFor(parsed: ParsedDocument): string | null {
  if (!parsed.kind) return null;
  if (parsed.isPassport) return 'pasaporte';
  const key = normalizeKey(parsed.kind);
  const match = XERTIFY_DOC_FORMATS.find((f) => normalizeKey(f) === key);
  if (match) return match;
  if (key.includes('extranjeria')) return 'cédula de extranjería';
  if (key.includes('tarjeta')) return 'tarjeta de identidad';
  if (key.includes('ciudadania')) return 'cédula de ciudadanía';
  return null;
}

/* ------------------------------------------------------------------ */
/* Abreviatura para la Base de Datos                                    */
/* ------------------------------------------------------------------ */

/**
 * Abreviatura estandarizada para la columna `TIPO DE DOC` de Tabla3:
 * CC, TI, CE, RC, PS, NIT, PPT. Sin puntos, en mayúscula.
 */
export function dbAbbreviationFor(parsed: ParsedDocument): string {
  if (parsed.isPassport) return 'PS';
  if (!parsed.kind) return DB_DOC_FALLBACK;
  const direct = DB_DOC_ABBREVIATIONS[parsed.kind];
  if (direct) return direct;
  const alias = DB_ABBREVIATION_ALIASES[normalizeKey(parsed.kind)];
  return alias ?? DB_DOC_FALLBACK;
}

/* ------------------------------------------------------------------ */
/* Número de documento                                                  */
/* ------------------------------------------------------------------ */

/** Quita puntos, comas, espacios y guiones; deja mayúsculas. */
export function cleanPassportNumber(raw: string): string {
  return String(raw)
    .replace(/[.\s,\-–—_'’]/g, '')
    .toUpperCase();
}

/** Deja únicamente dígitos. */
export function cleanNationalId(raw: string): string {
  return String(raw).replace(/\D/g, '');
}

/**
 * Formatea una cédula con separador de miles: `1026286605` → `1.026.286.605`.
 *
 * Va como TEXTO en la plantilla, no como número: así Excel no se lo come, no
 * pierde ceros a la izquierda y Xertify lo imprime tal cual en el certificado.
 */
export function formatNationalId(raw: string): string {
  const digits = cleanNationalId(raw);
  if (!digits) return '';
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Normaliza lo que Excel pudo entregar como número o notación científica. */
export function normalizeNumericCell(raw: unknown): string {
  if (typeof raw === 'number') {
    return Number.isInteger(raw) ? String(raw) : raw.toFixed(0);
  }
  const text = String(raw ?? '').trim();
  if (/^\d+(\.\d+)?e\+?\d+$/i.test(text)) {
    const value = Number(text);
    if (Number.isFinite(value)) return value.toFixed(0);
  }
  return text;
}

export const PASSPORT_PATTERN = /^[A-Z0-9]{5,20}$/;
/** Cédula ya formateada: `1.026.286.605`, o `12.345` para las cortas. */
export const NATIONAL_ID_PATTERN = /^\d{1,3}(?:\.\d{3})*$/;

/** Cantidad de dígitos admitida en una cédula colombiana. */
export const NATIONAL_ID_DIGITS = { min: 5, max: 12 };
