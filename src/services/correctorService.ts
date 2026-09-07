/**
 * correctorService.ts
 * Aplica las sugerencias del validador y mantiene el estado de las filas.
 *
 * Distingue dos orígenes de corrección, porque el comprobante del lote los
 * reporta por separado:
 *   - `auto`   : resueltas por «Autocorregir todo».
 *   - `manual` : editadas a mano por el responsable en la tabla.
 */

import { CANONICAL_FIELDS, type CanonicalField, type StudentRow } from '../types';
import {
  countNationalities,
  duplicateIssue,
  findDuplicateDocuments,
  validateRow,
  type RowValues,
} from './validatorService';

/** Número máximo de pasadas de autocorrección (una corrección puede destapar otra). */
const MAX_PASSES = 6;

/**
 * Campos cuya corrección depende de otro campo.
 *
 * Sin esto, en una misma pasada se corregiría `numerodocumento` con la
 * sugerencia calculada a partir del `tipodocumento` viejo. Un caso real:
 * `Spain - id` + `A.123.456` se limpiaría como si fuera cédula («123456»,
 * perdiendo la letra) justo cuando el tipo pasa a `Spain - Passport`.
 *
 * Regla: un campo no se autocorrige mientras alguna de sus dependencias
 * todavía tenga una corrección pendiente. En la siguiente pasada ya se
 * revalidó contra el valor bueno.
 */
export const FIELD_DEPENDENCIES: Partial<Record<CanonicalField, CanonicalField[]>> = {
  numerodocumento: ['tipodocumento'],
  docformato: ['tipodocumento'],
  lugarexpi: ['lugarexpedicion'],
  fechaemite: ['fechainicio'],
};

/**
 * `true` si alguna dependencia del campo todavía tiene un error sin resolver.
 *
 * La sugerencia de un campo derivado se calcula a partir de su dependencia, así
 * que mientras esa siga mal la propuesta no es de fiar: con «Spain - id» aún
 * puesto, el pasaporte «A.123.456» se «corregiría» a «123.456».
 */
export function hasBlockingDependency(row: StudentRow, field: CanonicalField): boolean {
  const dependencies = FIELD_DEPENDENCIES[field];
  if (!dependencies) return false;
  return dependencies.some((dependency) =>
    (row.cells[dependency]?.issues ?? []).some((issue) => issue.severity === 'error'),
  );
}

/** `true` si alguna dependencia del campo todavía tiene arreglo pendiente. */
function hasPendingDependency(row: StudentRow, field: CanonicalField): boolean {
  const dependencies = FIELD_DEPENDENCIES[field];
  if (!dependencies) return false;

  return dependencies.some((dependency) => {
    const cell = row.cells[dependency];
    if (!cell) return false;
    return cell.issues.some(
      (issue) => issue.autoFixable && issue.suggestion !== undefined && issue.suggestion !== cell.value,
    );
  });
}

/** Extrae los valores actuales de una fila. */
export function rowValues(row: StudentRow): RowValues {
  const values = {} as RowValues;
  for (const field of CANONICAL_FIELDS) {
    values[field] = row.cells[field]?.value ?? '';
  }
  return values;
}

/* ------------------------------------------------------------------ */
/* Validación                                                           */
/* ------------------------------------------------------------------ */

/** Revalida todas las filas y devuelve copias con los hallazgos al día. */
export function revalidate(
  rows: StudentRow[],
  activeFields: Set<CanonicalField>,
): StudentRow[] {
  const validated = rows.map((row) => {
    const issuesByField = validateRow(rowValues(row), activeFields);
    const cells = { ...row.cells };
    for (const field of CANONICAL_FIELDS) {
      const cell = cells[field];
      if (!cell) continue;
      cells[field] = { ...cell, issues: issuesByField[field] ?? [] };
    }
    return { ...row, cells };
  });

  // Duplicados: se marcan después, porque dependen del lote completo.
  const duplicates = findDuplicateDocuments(validated);
  for (const indexes of duplicates.values()) {
    for (const index of indexes) {
      const others = indexes.filter((i) => i !== index).map((i) => validated[i].excelRow);
      const cell = validated[index].cells.numerodocumento;
      if (!cell) continue;
      validated[index] = {
        ...validated[index],
        cells: {
          ...validated[index].cells,
          numerodocumento: { ...cell, issues: [...cell.issues, duplicateIssue(others)] },
        },
      };
    }
  }

  return validated;
}

/* ------------------------------------------------------------------ */
/* Autocorrección                                                       */
/* ------------------------------------------------------------------ */

export interface AutoFixReport {
  rows: StudentRow[];
  /** Número de celdas efectivamente corregidas. */
  fixedCells: number;
  /** Conteo por código de regla, para el resumen de la UI. */
  byCode: Record<string, number>;
}

/**
 * Aplica todas las sugerencias autocorregibles, repitiendo hasta que no
 * queden cambios o se agoten las pasadas.
 */
export function autoFixAll(
  rows: StudentRow[],
  activeFields: Set<CanonicalField>,
  options: { onlyFields?: CanonicalField[] } = {},
): AutoFixReport {
  const allowed = options.onlyFields ? new Set(options.onlyFields) : null;
  const byCode: Record<string, number> = {};
  let fixedCells = 0;
  let current = revalidate(rows, activeFields);

  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    let changed = false;

    current = current.map((row) => {
      const cells = { ...row.cells };
      let rowChanged = false;

      for (const field of CANONICAL_FIELDS) {
        if (allowed && !allowed.has(field)) continue;
        const cell = cells[field];
        if (!cell) continue;
        // Espera a que se resuelva el campo del que depende (ver arriba).
        if (hasPendingDependency(row, field)) continue;

        const fixable = cell.issues.find((issue) => issue.autoFixable && issue.suggestion !== undefined);
        if (!fixable || fixable.suggestion === cell.value) continue;

        cells[field] = {
          ...cell,
          value: fixable.suggestion as string,
          fixedBy: cell.fixedBy === 'manual' ? 'manual' : 'auto',
        };
        byCode[fixable.code] = (byCode[fixable.code] ?? 0) + 1;
        rowChanged = true;
      }

      if (!rowChanged) return row;
      changed = true;
      return { ...row, cells };
    });

    if (!changed) break;
    current = revalidate(current, activeFields);
  }

  // Cuenta final de celdas que difieren del original por autocorrección.
  for (const row of current) {
    for (const field of CANONICAL_FIELDS) {
      const cell = row.cells[field];
      if (cell && cell.fixedBy === 'auto' && cell.value !== cell.original) fixedCells += 1;
    }
  }

  return { rows: current, fixedCells, byCode };
}

/** Aplica una edición manual del responsable sobre una celda. */
export function applyManualEdit(
  rows: StudentRow[],
  rowId: string,
  field: CanonicalField,
  value: string,
  activeFields: Set<CanonicalField>,
): StudentRow[] {
  const updated = rows.map((row) => {
    if (row.id !== rowId) return row;
    const cell = row.cells[field];
    if (!cell) return row;
    return {
      ...row,
      cells: {
        ...row.cells,
        [field]: {
          ...cell,
          value,
          fixedBy: value === cell.original ? 'none' : ('manual' as const),
        },
      },
    };
  });
  return revalidate(updated, activeFields);
}

/** Revierte una celda a su valor original del archivo. */
export function revertCell(
  rows: StudentRow[],
  rowId: string,
  field: CanonicalField,
  activeFields: Set<CanonicalField>,
): StudentRow[] {
  const updated = rows.map((row) => {
    if (row.id !== rowId) return row;
    const cell = row.cells[field];
    if (!cell) return row;
    return {
      ...row,
      cells: { ...row.cells, [field]: { ...cell, value: cell.original, fixedBy: 'none' as const } },
    };
  });
  return revalidate(updated, activeFields);
}

/** Elimina una fila del lote (p. ej. una fila en blanco al final del archivo). */
export function removeRow(
  rows: StudentRow[],
  rowId: string,
  activeFields: Set<CanonicalField>,
): StudentRow[] {
  return revalidate(
    rows.filter((row) => row.id !== rowId),
    activeFields,
  );
}

/* ------------------------------------------------------------------ */
/* Métricas del lote                                                    */
/* ------------------------------------------------------------------ */

export interface BatchMetrics {
  totalFilas: number;
  errores: number;
  advertencias: number;
  filasConError: number;
  celdasAuto: number;
  celdasManuales: number;
  colombianos: number;
  extranjeros: number;
  /** Errores que «Autocorregir todo» todavía puede resolver. */
  autocorregibles: number;
}

export function computeMetrics(rows: StudentRow[]): BatchMetrics {
  let errores = 0;
  let advertencias = 0;
  let filasConError = 0;
  let celdasAuto = 0;
  let celdasManuales = 0;
  let autocorregibles = 0;

  for (const row of rows) {
    let rowHasError = false;
    for (const field of CANONICAL_FIELDS) {
      const cell = row.cells[field];
      if (!cell) continue;
      for (const issue of cell.issues) {
        if (issue.severity === 'error') {
          errores += 1;
          rowHasError = true;
          if (issue.autoFixable) autocorregibles += 1;
        } else {
          advertencias += 1;
        }
      }
      if (cell.value !== cell.original) {
        if (cell.fixedBy === 'auto') celdasAuto += 1;
        else if (cell.fixedBy === 'manual') celdasManuales += 1;
      }
    }
    if (rowHasError) filasConError += 1;
  }

  const { colombianos, extranjeros } = countNationalities(rows);

  return {
    totalFilas: rows.length,
    errores,
    advertencias,
    filasConError,
    celdasAuto,
    celdasManuales,
    colombianos,
    extranjeros,
    autocorregibles,
  };
}

/** `true` cuando el lote está listo para registrarse. */
export function isBatchClean(metrics: BatchMetrics): boolean {
  return metrics.totalFilas > 0 && metrics.errores === 0;
}
