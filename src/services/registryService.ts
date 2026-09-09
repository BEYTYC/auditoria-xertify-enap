/**
 * registryService.ts
 * Orquesta la generación del Registro Oficial: numera el lote, arma las filas
 * de Tabla3, las envía por el adaptador configurado y deja constancia en la
 * bitácora local.
 *
 * Regla de oro: nada se envía si el lote tiene un solo error pendiente.
 */

import {
  type BatchMetadata,
  type BatchReceipt,
  type BatchStats,
  type DatabaseRow,
  type LedgerPosition,
  type LogEntry,
  type RegistrationResult,
  type SharePointConfig,
  type StudentRow,
} from '../types';
import { computeMetrics, isBatchClean } from './correctorService';
import { buildDatabaseRows } from './databaseService';
import { allocate, buildBatchId, describeAllocation } from './numberingService';
import {
  createAdapter,
  SharePointError,
  type SharePointAdapter,
  type TableInfo,
} from './sharepointService';

/* ------------------------------------------------------------------ */
/* Bitácora local                                                       */
/* ------------------------------------------------------------------ */

const LOG_KEY = 'auditor-certificados.bitacora.v1';

export function readLog(): LogEntry[] {
  try {
    const stored = window.localStorage.getItem(LOG_KEY);
    return stored ? (JSON.parse(stored) as LogEntry[]) : [];
  } catch {
    return [];
  }
}

function writeLog(entries: LogEntry[]): void {
  try {
    window.localStorage.setItem(LOG_KEY, JSON.stringify(entries));
  } catch {
    // Sin almacenamiento: la bitácora vive solo en memoria durante la sesión.
  }
}

export function appendLog(entry: LogEntry): LogEntry[] {
  const next = [entry, ...readLog()];
  writeLog(next);
  return next;
}

export function clearLog(): void {
  writeLog([]);
}

/**
 * Guarda en la bitácora el archivo corregido de un lote, para poder volver a
 * descargarlo tiempo después sin tener que auditarlo otra vez.
 *
 * El navegador tiene poco espacio, así que solo se conservan los archivos de
 * los últimos lotes; los más viejos pierden el archivo pero conservan su
 * renglón en la bitácora. Si aun así no cabe, se sigue soltando el más antiguo
 * hasta que quepa.
 */
const PLANTILLAS_GUARDADAS = 20;

export function attachTemplate(
  idRegistro: string,
  nombre: string,
  base64: string,
): LogEntry[] {
  const entries = readLog().map((entry) =>
    entry.idRegistro === idRegistro
      ? { ...entry, plantillaNombre: nombre, plantillaBase64: base64 }
      : entry,
  );

  // Solo los más recientes conservan el archivo.
  let vistos = 0;
  const podados = entries.map((entry) => {
    if (!entry.plantillaBase64) return entry;
    vistos += 1;
    if (vistos <= PLANTILLAS_GUARDADAS) return entry;
    const { plantillaBase64: _descartado, ...resto } = entry;
    void _descartado;
    return resto as LogEntry;
  });

  let intento = podados;
  for (let i = 0; i < podados.length; i += 1) {
    try {
      window.localStorage.setItem(LOG_KEY, JSON.stringify(intento));
      return intento;
    } catch {
      // No cupo: se suelta el archivo del lote más antiguo que aún lo tenga.
      const ultimo = [...intento].reverse().find((entry) => entry.plantillaBase64);
      if (!ultimo) break;
      intento = intento.map((entry) => {
        if (entry !== ultimo) return entry;
        const { plantillaBase64: _fuera, ...resto } = entry;
        void _fuera;
        return resto as LogEntry;
      });
    }
  }

  writeLog(intento);
  return intento;
}

/** Cuántos lotes se registraron hoy, para numerar el código del lote. */
function sequenceForToday(now: Date): number {
  const today = now.toISOString().slice(0, 10);
  const count = readLog().filter((entry) => entry.timestampIso.slice(0, 10) === today).length;
  return count + 1;
}

/* ------------------------------------------------------------------ */
/* Preparación del lote                                                 */
/* ------------------------------------------------------------------ */

export interface RegistrationRequest {
  rows: StudentRow[];
  metadata: BatchMetadata;
  config: SharePointConfig;
  /** Última posición ocupada en el libro. */
  lastPosition: LedgerPosition;
  /** Último consecutivo `N` de Tabla3. */
  lastConsecutivo: number;
}

export interface RegistrationPreview {
  receipt: BatchReceipt;
  databaseRows: DatabaseRow[];
  resumenNumeracion: string;
}

/** Estadísticas del lote listas para el comprobante. */
export function buildStats(rows: StudentRow[]): BatchStats {
  const metrics = computeMetrics(rows);
  return {
    totalGraduados: metrics.totalFilas,
    totalColombianos: metrics.colombianos,
    totalExtranjeros: metrics.extranjeros,
    erroresAuto: metrics.celdasAuto,
    erroresManuales: metrics.celdasManuales,
    erroresPendientes: metrics.errores,
    advertencias: metrics.advertencias,
  };
}

/**
 * Calcula el comprobante y las filas de la base SIN enviar nada.
 * Es lo que se muestra en la pantalla de confirmación.
 */
export function previewRegistration(
  request: RegistrationRequest,
  now = new Date(),
): RegistrationPreview {
  const { rows, metadata, lastPosition, lastConsecutivo } = request;

  const allocation = allocate(lastPosition, lastConsecutivo, rows.length);
  const stats = buildStats(rows);
  const idRegistro = buildBatchId(now, sequenceForToday(now));

  const receipt: BatchReceipt = {
    idRegistro,
    timestampIso: now.toISOString(),
    fechaHoraLegible: now.toLocaleString('es-CO', {
      dateStyle: 'full',
      timeStyle: 'short',
    }),
    archivoOriginal: metadata.archivoOriginal,
    curso: metadata.curso,
    oficina: metadata.oficina,
    responsable: metadata.responsable,
    stats,
    allocation,
    estado: stats.erroresPendientes === 0 ? 'AUDITADO Y APROBADO 100%' : 'PENDIENTE DE CORRECCIÓN',
    referenciaAuditoria: `${idRegistro} · ${describeAllocation(allocation)}`,
  };

  const databaseRows = buildDatabaseRows(rows, metadata, allocation);

  return { receipt, databaseRows, resumenNumeracion: describeAllocation(allocation) };
}

/* ------------------------------------------------------------------ */
/* Registro                                                             */
/* ------------------------------------------------------------------ */

/** Lee la estructura de la tabla destino y la última posición del libro. */
export async function inspectDestination(config: SharePointConfig): Promise<TableInfo> {
  const adapter = createAdapter(config);
  return adapter.inspect();
}

/**
 * Anula un registro: quita del libro las filas del lote y lo marca en la
 * bitácora. El renglón de la bitácora no se borra —la anulación también es
 * historia—; queda con el estado en «REGISTRO ANULADO».
 */
export async function annulEntry(
  config: SharePointConfig,
  entry: LogEntry,
): Promise<{ borradas: number; log: LogEntry[] }> {
  const consecutivos = (entry.rows ?? [])
    .map((row) => Number(row.N))
    .filter((n) => Number.isFinite(n));

  if (!consecutivos.length) {
    throw new Error('Este lote no guardó sus filas, así que no se puede anular desde aquí.');
  }

  const adapter = createAdapter(config);
  const borradas = await adapter.deleteByConsecutive(consecutivos);

  const log = readLog().map((item) =>
    item.idRegistro === entry.idRegistro
      ? { ...item, estado: 'REGISTRO ANULADO' as LogEntry['estado'], anulado: true }
      : item,
  );
  writeLog(log);
  return { borradas, log };
}

/** Borra un renglón de la bitácora de este equipo. No toca el libro. */
export function removeLogEntry(idRegistro: string): LogEntry[] {
  const log = readLog().filter((entry) => entry.idRegistro !== idRegistro);
  writeLog(log);
  return log;
}

/**
 * Genera el Registro Oficial. Si el envío a SharePoint falla, no se genera
 * nada: no se guarda respaldo local ni se deja renglón en la bitácora, para
 * no dar por asentado un lote que en realidad no llegó al libro. Se devuelve
 * `error` y el responsable reintenta cuando el servicio esté disponible.
 */
export async function registerBatch(
  request: RegistrationRequest,
  now = new Date(),
): Promise<RegistrationResult> {
  const metrics = computeMetrics(request.rows);

  if (!isBatchClean(metrics)) {
    throw new Error(
      `El lote todavía tiene ${metrics.errores} error(es). Corríjalos antes de registrar.`,
    );
  }

  const { receipt, databaseRows } = previewRegistration(request, now);
  const adapter: SharePointAdapter = createAdapter(request.config);

  const baseLog: Omit<LogEntry, 'outcome' | 'mode' | 'syncedToSharePoint'> = {
    idRegistro: receipt.idRegistro,
    timestampIso: receipt.timestampIso,
    fechaHoraLegible: receipt.fechaHoraLegible,
    archivoOriginal: receipt.archivoOriginal,
    curso: receipt.curso,
    oficina: receipt.oficina,
    responsable: receipt.responsable,
    totalGraduados: receipt.stats.totalGraduados,
    totalColombianos: receipt.stats.totalColombianos,
    totalExtranjeros: receipt.stats.totalExtranjeros,
    erroresAuto: receipt.stats.erroresAuto,
    erroresManuales: receipt.stats.erroresManuales,
    estado: receipt.estado,
    libro: receipt.allocation.start.libro,
    folioInicial: receipt.allocation.start.folio,
    registroInicial: receipt.allocation.start.registro,
    folioFinal: receipt.allocation.end.folio,
    registroFinal: receipt.allocation.end.registro,
    rows: databaseRows,
  };

  try {
    const outcome = await adapter.append(databaseRows);

    appendLog({
      ...baseLog,
      outcome: 'success',
      mode: adapter.mode,
      syncedToSharePoint: adapter.mode !== 'mock',
    });

    return {
      outcome: 'success',
      mode: adapter.mode,
      receipt,
      rowsSent: outcome.rowsSent,
      message: outcome.message,
      workbookUrl: outcome.workbookUrl,
      completedAt: new Date().toISOString(),
    };
  } catch (error) {
    const detail =
      error instanceof SharePointError
        ? [error.message, error.detail].filter(Boolean).join(' — ')
        : error instanceof Error
          ? error.message
          : String(error);

    // No se respalda nada ni se deja renglón en la bitácora: si no llegó a
    // SharePoint, el lote no quedó registrado en ningún lado.
    return {
      outcome: 'error',
      mode: adapter.mode,
      receipt: { ...receipt, estado: 'REGISTRO FALLIDO' },
      rowsSent: 0,
      message:
        'No se pudo escribir en SharePoint: el lote NO quedó registrado. Corrija la conexión y ' +
        'vuelva a intentarlo; no se guardó ningún respaldo local.',
      errorDetail: detail,
      completedAt: new Date().toISOString(),
    };
  }
}
