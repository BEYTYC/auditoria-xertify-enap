/**
 * duplicateService.ts
 * Impide asentar dos veces el mismo lote.
 *
 * Pasa: alguien vuelve a cargar la plantilla que ya registró —porque no vio el
 * comprobante, porque se le cerró el navegador, porque quiere «volver a
 * generarlo»— y el libro terminaría con el mismo graduado dos veces, en dos
 * folios distintos. Eso no se puede deshacer desde aquí.
 *
 * El lote se identifica por curso + documento de cada graduado. Se compara
 * contra dos fuentes:
 *   1. la bitácora de este navegador, que guarda todo lo registrado desde él;
 *   2. las últimas filas de `Tabla3`, que se leen al entrar al paso de
 *      registro, y que sí ven lo que registró otra persona en otro equipo.
 */

import type { DatabaseRow, LogEntry, StudentRow } from '../types';
import { normalizeKey } from './textUtils';

/** Clave de un graduado dentro de un curso: `curso∷documento`. */
export function studentKey(curso: string, documento: string): string {
  return `${normalizeKey(curso)}∷${normalizeKey(documento).replace(/\D/g, '')}`;
}

/** Claves del lote que se está por registrar. */
export function batchKeys(rows: StudentRow[], cursoDelLote: string): string[] {
  const out: string[] = [];
  for (const row of rows) {
    const documento = row.cells.numerodocumento?.value ?? '';
    const curso = row.cells.titulo?.value?.trim() || cursoDelLote;
    if (!normalizeKey(documento)) continue;
    out.push(studentKey(curso, documento));
  }
  return out;
}

/** Claves de las filas ya escritas en la base. */
export function keysFromDatabaseRows(rows: DatabaseRow[]): string[] {
  return rows
    .map((row) =>
      studentKey(
        String(row['NOMBRE DEL CURSO'] ?? ''),
        String(row['DOCUMENTO DE IDENTIDAD'] ?? ''),
      ),
    )
    .filter((key) => !key.endsWith('∷'));
}

export interface DuplicateFinding {
  /** Cuántos graduados del lote ya están asentados. */
  repetidos: number;
  /** Total de graduados del lote. */
  total: number;
  /** Registro anterior, si la bitácora de este equipo lo tiene. */
  anterior: LogEntry | null;
  /** `true` si el choque se detectó contra la Base de Datos, no la bitácora. */
  enLaBase: boolean;
}

/**
 * Busca el lote en la bitácora y en las últimas filas de la base.
 *
 * @param rows          Filas auditadas del lote.
 * @param curso         Curso del lote, para las filas sin título propio.
 * @param log           Bitácora de registros de este navegador.
 * @param clavesEnBase  Claves leídas de `Tabla3` (últimas filas).
 */
export function findDuplicateBatch(
  rows: StudentRow[],
  curso: string,
  log: LogEntry[],
  clavesEnBase: string[] = [],
): DuplicateFinding | null {
  const claves = batchKeys(rows, curso);
  if (!claves.length) return null;
  const delLote = new Set(claves);

  // 1. Bitácora: solo cuentan los registros que sí quedaron asentados.
  for (const entry of [...log].reverse()) {
    if (entry.outcome !== 'success') continue;
    const previas = keysFromDatabaseRows(entry.rows ?? []);
    const repetidos = previas.filter((key) => delLote.has(key)).length;
    if (repetidos > 0) {
      return { repetidos, total: delLote.size, anterior: entry, enLaBase: false };
    }
  }

  // 2. Base de Datos: alcanza para ver lo que registró otra persona.
  const enBase = new Set(clavesEnBase);
  const repetidos = [...delLote].filter((key) => enBase.has(key)).length;
  if (repetidos > 0) {
    return { repetidos, total: delLote.size, anterior: null, enLaBase: true };
  }

  return null;
}

/**
 * Texto único del bloqueo, para que diga lo mismo en pantalla y en el error.
 *
 * Cuando el choque viene de la bitácora de este equipo (`anterior` presente),
 * sí tiene sentido mandar a buscarlo ahí y descargarlo. Pero cuando el choque
 * salió solo de la Base de Datos —otro equipo lo registró, o esta bitácora se
 * vació—, decirle que lo busque en una bitácora vacía es lo que confunde:
 * ahí no va a encontrar nada.
 */
export function duplicateMessage(finding: DuplicateFinding): string {
  const cuantos =
    finding.repetidos === finding.total
      ? 'Este lote ya fue registrado'
      : `${finding.repetidos} de los ${finding.total} graduados de este lote ya están registrados`;

  if (finding.anterior) {
    return (
      `${cuantos} el ${finding.anterior.fechaHoraLegible}, con el número ${finding.anterior.idRegistro}. ` +
      'No se puede volver a generar. Búsquelo en la bitácora de registros y descárguelo desde allí. ' +
      'Si necesita corregir o eliminar algún registro, comuníquese con la Oficina de Estadística.'
    );
  }

  return (
    `${cuantos} en la Base de Datos, pero no en la bitácora de este equipo: puede que se haya ` +
    'registrado desde otro computador, o que esta bitácora se haya vaciado después. No se puede ' +
    'volver a generar. Verifique en la Base de Datos o comuníquese con la Oficina de Estadística ' +
    'si necesita corregir o eliminar el registro.'
  );
}
