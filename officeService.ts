/**
 * officeService.ts
 * Deduce la OFICINA RESPONSABLE a partir del nombre del curso.
 *
 * La plantilla de Xertify no trae ese dato, pero las 11.335 filas históricas
 * de Tabla3 sí: se indexó cada curso con su oficina mayoritaria. La app
 * propone y el responsable confirma; nunca escribe sin confirmación.
 */

import { CURSO_OFICINA, OFICINAS_LEGADO, OFICINAS_RESPONSABLES } from '../data/courseOffice';
import { normalizeKey, similarity, toDisplayTitle } from './textUtils';

export interface OfficeSuggestion {
  /** Oficina propuesta, o `null` si el curso no se pudo reconocer. */
  oficina: string | null;
  /** Confianza 0..1 combinada: parecido del título × consistencia histórica. */
  confidence: number;
  /** Curso histórico con el que se emparejó. */
  matchedCourse: string | null;
  /** Filas históricas que respaldan la propuesta. */
  support: number;
  /** Cómo se resolvió, para explicarlo en la interfaz. */
  reason: 'exacto' | 'aproximado' | 'sin-coincidencia';
}

const EMPTY: OfficeSuggestion = {
  oficina: null,
  confidence: 0,
  matchedCourse: null,
  support: 0,
  reason: 'sin-coincidencia',
};

/** Umbral mínimo de parecido para aceptar un emparejamiento aproximado. */
const FUZZY_THRESHOLD = 0.82;

/** Sugiere la oficina responsable para un nombre de curso. */
export function suggestOffice(courseTitle: string): OfficeSuggestion {
  const key = normalizeKey(courseTitle);
  if (!key) return EMPTY;

  const exact = CURSO_OFICINA[key];
  if (exact) {
    const [officeIndex, ratio, support] = exact;
    return {
      oficina: OFICINAS_RESPONSABLES[officeIndex] ?? null,
      confidence: ratio,
      matchedCourse: key,
      support,
      reason: 'exacto',
    };
  }

  let best: { course: string; score: number } | null = null;
  for (const course of Object.keys(CURSO_OFICINA)) {
    const score = similarity(key, course);
    if (!best || score > best.score) best = { course, score };
  }

  if (!best || best.score < FUZZY_THRESHOLD) return EMPTY;

  const [officeIndex, ratio, support] = CURSO_OFICINA[best.course];
  return {
    oficina: OFICINAS_RESPONSABLES[officeIndex] ?? null,
    confidence: Number((best.score * ratio).toFixed(3)),
    matchedCourse: best.course,
    support,
    reason: 'aproximado',
  };
}

/**
 * Sugerencia para un lote completo: agrupa por curso y devuelve una propuesta
 * por curso distinto, para que la UI resuelva lotes mixtos.
 */
export function suggestOfficesForBatch(courseTitles: string[]): Map<string, OfficeSuggestion> {
  const out = new Map<string, OfficeSuggestion>();
  for (const title of courseTitles) {
    const clean = title.trim();
    if (!clean || out.has(clean)) continue;
    out.set(clean, suggestOffice(clean));
  }
  return out;
}

/**
 * Nombre de la oficina como se muestra en pantalla: sin la sigla que va antes
 * del guion y en capitalizada. A la Base de Datos sigue viajando el valor
 * completo, tal como lo exige el histórico de `Tabla3`.
 */
export function officeLabel(office: string): string {
  const separator = office.indexOf(' - ');
  const name = separator === -1 ? office : office.slice(separator + 3);
  return toDisplayTitle(name);
}

/** Normaliza una oficina histórica a su nombre vigente. */
export function normalizeOffice(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  const legacy = OFICINAS_LEGADO[text];
  if (legacy) return legacy;
  if (OFICINAS_RESPONSABLES.includes(text)) return text;

  const key = normalizeKey(text);
  const exact = OFICINAS_RESPONSABLES.find((o) => normalizeKey(o) === key);
  if (exact) return exact;

  // El código de tres o cinco letras basta para identificarla (BAENA, DIDEN…).
  const code = key.split(' ')[0];
  const byCode = OFICINAS_RESPONSABLES.find((o) => normalizeKey(o).startsWith(`${code} `));
  return byCode ?? null;
}

export { OFICINAS_RESPONSABLES };
