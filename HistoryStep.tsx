/**
 * HistoryStep.tsx
 * Paso 4: bitácora de lotes registrados desde este equipo.
 *
 * Para quien registra es una lista de consulta. Para la Oficina de Estadística
 * —que entra con su cuenta— es además donde se deshace lo que salió mal:
 * anular un registro del libro, retirar un renglón, o comprobar contra la Base
 * de Datos que el último registro quedó donde debía.
 */

import { BadgeCheck, Ban, Download, History, ShieldCheck, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { base64ToBlob, downloadBlob } from '../services/excelService';
import { officeLabel } from '../services/officeService';
import { toDisplayTitle } from '../services/textUtils';
import { canonicalName } from '../services/validatorService';
import type { LogEntry } from '../types';

/** Tipo MIME de un libro de Excel. */
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

interface HistoryStepProps {
  log: LogEntry[];
  /** Cuenta con la que está abierta la administración, o `null`. */
  admin: string | null;
  adminMensaje: string | null;
  loading: string | null;
  onCerrarAdmin: () => void;
  onBorrarEntrada: (idRegistro: string) => void;
  onVaciar: () => void;
  onAnular: (entry: LogEntry) => void;
  onValidarUltimo: () => void;
}

export function HistoryStep({
  log,
  admin,
  adminMensaje,
  loading,
  onCerrarAdmin,
  onBorrarEntrada,
  onVaciar,
  onAnular,
  onValidarUltimo,
}: HistoryStepProps) {
  return (
    <div className="mx-auto w-full max-w-[1120px] space-y-4">
      <AdminBar
        admin={admin}
        mensaje={adminMensaje}
        loading={loading}
        onCerrar={onCerrarAdmin}
        onVaciar={onVaciar}
        onValidarUltimo={onValidarUltimo}
      />

      {!log.length ? (
        <div className="card w-full px-6 py-14 text-center">
          <History className="mx-auto mb-3 text-slate-400" size={30} />
          <p className="text-sm font-medium text-navy-900">Todavía no hay lotes registrados.</p>
          <p className="mt-1 text-sm text-slate-500">
            La bitácora guarda cada registro generado desde este navegador.
          </p>
        </div>
      ) : (
        <div className="card w-full overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-slate-50 text-left">
                <tr className="border-b border-slate-200">
                  {['Fecha y hora', 'Curso', 'Oficina', 'Responsable', 'Registros', ''].map(
                    (heading) => (
                      <th
                        key={heading}
                        scope="col"
                        className={[
                          'whitespace-nowrap px-3 py-2 text-xs font-semibold text-slate-600',
                          heading === 'Registros' ? 'text-center' : '',
                        ].join(' ')}
                      >
                        {heading}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {log.map((entry) => (
                  <tr
                    key={entry.idRegistro + entry.timestampIso}
                    className={[
                      'border-b border-slate-100',
                      entry.anulado ? 'bg-slate-50 text-slate-400' : '',
                    ].join(' ')}
                  >
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-600">
                      {new Date(entry.timestampIso).toLocaleString('es-CO', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                      {entry.anulado && (
                        <span className="ml-2 rounded bg-slate-200 px-1.5 text-[10px] font-semibold uppercase text-slate-600">
                          anulado
                        </span>
                      )}
                    </td>
                    <td className="max-w-[18rem] px-3 py-2 text-xs text-navy-900">
                      {toDisplayTitle(entry.curso)}
                    </td>
                    <td className="max-w-[14rem] px-3 py-2 text-xs text-slate-600">
                      {officeLabel(entry.oficina)}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">
                      {canonicalName(entry.responsable)}
                    </td>
                    <td className="px-3 py-2 text-center text-xs tabular-nums text-navy-900">
                      {entry.totalGraduados}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2">
                      <div className="flex items-center justify-end gap-1">
                        {/* Lo que se vuelve a descargar es la plantilla corregida,
                            que es la que sigue su camino a Xertify. */}
                        {entry.plantillaBase64 ? (
                          <button
                            type="button"
                            title="Descargar la plantilla corregida de este lote"
                            className="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-navy-800"
                            onClick={() =>
                              downloadBlob(
                                base64ToBlob(entry.plantillaBase64!, XLSX_MIME),
                                entry.plantillaNombre ??
                                  `Plantilla corregida — ${entry.idRegistro}.xlsx`,
                              )
                            }
                          >
                            <Download size={14} />
                            <span className="sr-only">
                              Descargar la plantilla de {entry.idRegistro}
                            </span>
                          </button>
                        ) : (
                          <span
                            title="La copia de este lote ya no se conserva; solo se guardan los más recientes."
                            className="block p-1 text-slate-200"
                          >
                            <Download size={14} />
                          </span>
                        )}

                        {admin && !entry.anulado && entry.outcome === 'success' && (
                          <button
                            type="button"
                            title="Anular este registro: quita sus filas del libro"
                            disabled={!!loading}
                            className="rounded p-1 text-slate-400 transition hover:bg-amber-50 hover:text-amber-700 disabled:opacity-40"
                            onClick={() => onAnular(entry)}
                          >
                            <Ban size={14} />
                            <span className="sr-only">Anular {entry.idRegistro}</span>
                          </button>
                        )}

                        {admin && (
                          <button
                            type="button"
                            title="Retirar este renglón de la bitácora (no toca el libro)"
                            className="rounded p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-700"
                            onClick={() => onBorrarEntrada(entry.idRegistro)}
                          >
                            <Trash2 size={14} />
                            <span className="sr-only">Borrar {entry.idRegistro}</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Barra de administración                                             */
/* ------------------------------------------------------------------ */

function AdminBar({
  admin,
  mensaje,
  loading,
  onCerrar,
  onVaciar,
  onValidarUltimo,
}: {
  admin: string | null;
  mensaje: string | null;
  loading: string | null;
  onCerrar: () => void;
  onVaciar: () => void;
  onValidarUltimo: () => void;
}) {
  const [confirmarVaciado, setConfirmarVaciado] = useState(false);

  // El ingreso de administración ahora se hace desde el engranaje de ajustes:
  // aquí solo se refleja si ya está abierta, sin volver a pedir cuenta y clave.
  if (!admin) {
    return (
      <section className="card w-full px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <History size={16} className="text-navy-600" />
          <p className="text-sm font-semibold text-navy-900">Bitácora de registros</p>
        </div>
      </section>
    );
  }

  return (
    <section className="w-full rounded-xl border border-navy-200 bg-navy-50 px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <ShieldCheck size={16} className="text-navy-700" />
        <p className="text-sm font-semibold text-navy-900">
          Administración abierta como {admin}
        </p>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-secondary"
            disabled={!!loading}
            onClick={onValidarUltimo}
          >
            <BadgeCheck size={15} />
            Validar el último registro
          </button>
          <button
            type="button"
            className="btn-secondary"
            disabled={!!loading}
            onClick={() => setConfirmarVaciado(true)}
          >
            <Trash2 size={15} />
            Vaciar bitácora
          </button>
          <button type="button" className="btn-ghost" onClick={onCerrar}>
            Salir
          </button>
        </div>
      </div>

      {confirmarVaciado && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-rose-300 bg-white px-3 py-2">
          <p className="text-[13px] text-rose-900">
            Se borran todos los renglones de este equipo, con sus copias de las plantillas. Los
            registros ya hechos en el libro <strong>no</strong> se tocan.
          </p>
          <button
            type="button"
            className="ml-auto btn-secondary"
            onClick={() => setConfirmarVaciado(false)}
          >
            Conservar
          </button>
          <button
            type="button"
            className="rounded-lg bg-rose-600 px-3 py-1.5 text-[13px] font-semibold text-white transition hover:bg-rose-700"
            onClick={() => {
              onVaciar();
              setConfirmarVaciado(false);
            }}
          >
            Vaciar
          </button>
        </div>
      )}

      {mensaje && (
        <p className="mt-2 text-[13px] leading-relaxed text-navy-900">{mensaje}</p>
      )}

      <p className="mt-2 text-[11px] leading-snug text-navy-700">
        Anular quita del libro las filas de ese lote; la numeración de los registros posteriores no
        cambia. Para corregir un lote, anúlelo y regístrelo otra vez ya corregido: en un libro
        oficial se anula y se vuelve a asentar, no se sobrescribe.
      </p>
    </section>
  );
}
