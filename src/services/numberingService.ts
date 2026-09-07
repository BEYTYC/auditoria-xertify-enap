/**
 * numberingService.ts
 * Asignación de la numeración del libro de registro (LIBRO / FOLIO / REG)
 * y del consecutivo global `N` de Tabla3.
 *
 * Regla institucional: ningún número puede pasar de 99.
 *   - Un folio admite 99 registros; al llegar a 99 se abre el folio siguiente.
 *   - Un libro admite 99 folios; al llegar a 99 se abre el libro siguiente.
 */

import {
  MAX_FOLIO,
  MAX_REGISTRO,
  type LedgerAllocation,
  type LedgerPosition,
} from '../types';

/**
 * Última posición conocida en la Base de Datos: libro 3, folio 99, registro 54
 * —OLARTE GARCÍA, CARLOS ANDRÉS—, al 05/09/2026.
 *
 * Es solo el punto de partida cuando la app no puede consultar SharePoint. Con
 * Microsoft Graph configurado, al entrar al paso de registro se relee la última
 * fila de `Tabla3` y este valor queda sin efecto.
 */
export const DEFAULT_LAST_POSITION: LedgerPosition = { libro: 3, folio: 99, registro: 54 };
/**
 * Último consecutivo `N` conocido: 11.476.
 *
 * Se obtiene de la propia serie: el folio 98 cerró en N 11.422 con su registro
 * 99, así que el registro 54 del folio 99 es 11.422 + 54.
 */
export const DEFAULT_LAST_CONSECUTIVO = 11476;

/** Devuelve la posición siguiente, respetando los topes de 99. */
export function nextPosition(position: LedgerPosition): LedgerPosition {
  if (position.registro < MAX_REGISTRO) {
    return { ...position, registro: position.registro + 1 };
  }
  if (position.folio < MAX_FOLIO) {
    return { libro: position.libro, folio: position.folio + 1, registro: 1 };
  }
  return { libro: position.libro + 1, folio: 1, registro: 1 };
}

/** `true` si la posición es válida según los topes del libro. */
export function isValidPosition(position: LedgerPosition): boolean {
  return (
    Number.isInteger(position.libro) &&
    Number.isInteger(position.folio) &&
    Number.isInteger(position.registro) &&
    position.libro >= 1 &&
    position.folio >= 1 &&
    position.folio <= MAX_FOLIO &&
    position.registro >= 1 &&
    position.registro <= MAX_REGISTRO
  );
}

/**
 * Asigna `count` posiciones consecutivas a partir de la última ocupada.
 *
 * @param last          Última posición ya usada en la Base de Datos.
 * @param lastConsecutivo Último valor de la columna `N`.
 * @param count         Número de graduados del lote.
 */
export function allocate(
  last: LedgerPosition,
  lastConsecutivo: number,
  count: number,
): LedgerAllocation {
  if (count <= 0) {
    return {
      start: last,
      end: last,
      positions: [],
      consecutivos: [],
      abreLibroNuevo: false,
      abreFolioNuevo: false,
    };
  }

  const positions: LedgerPosition[] = [];
  const consecutivos: number[] = [];
  let cursor = last;

  for (let i = 0; i < count; i += 1) {
    cursor = nextPosition(cursor);
    positions.push(cursor);
    consecutivos.push(lastConsecutivo + i + 1);
  }

  return {
    start: positions[0],
    end: positions[positions.length - 1],
    positions,
    consecutivos,
    abreLibroNuevo: positions.some((p) => p.libro !== last.libro),
    abreFolioNuevo: positions.some((p) => p.folio !== last.folio || p.libro !== last.libro),
  };
}

/** Descripción legible del rango asignado, para el comprobante. */
export function describeAllocation(allocation: LedgerAllocation): string {
  if (!allocation.positions.length) return 'Sin registros asignados.';
  const { start, end } = allocation;
  if (start.libro === end.libro && start.folio === end.folio) {
    return `Libro ${start.libro}, folio ${start.folio}, registros ${start.registro} a ${end.registro}`;
  }
  return (
    `Libro ${start.libro} folio ${start.folio} registro ${start.registro} → ` +
    `Libro ${end.libro} folio ${end.folio} registro ${end.registro}`
  );
}

/**
 * Lee la última posición desde las filas ya existentes en Tabla3.
 * Se usa cuando la app puede consultar la Base de Datos por Graph API.
 */
export function readLastPosition(
  rows: (string | number | null)[][],
): { position: LedgerPosition; consecutivo: number } | null {
  let best: { position: LedgerPosition; consecutivo: number } | null = null;

  for (const row of rows) {
    const consecutivo = Number(row[0]);
    const libro = Number(row[1]);
    const folio = Number(row[2]);
    const registro = Number(row[3]);
    if (![consecutivo, libro, folio, registro].every(Number.isFinite)) continue;

    const rank = libro * 1_000_000 + folio * 10_000 + registro;
    const bestRank = best
      ? best.position.libro * 1_000_000 + best.position.folio * 10_000 + best.position.registro
      : -1;

    if (rank > bestRank) {
      best = { position: { libro, folio, registro }, consecutivo };
    }
  }

  return best;
}

/** Código único de lote: `REG-AAAA-MMDD-NNN`. */
export function buildBatchId(date: Date, sequence: number): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `REG-${year}-${month}${day}-${String(sequence).padStart(3, '0')}`;
}
