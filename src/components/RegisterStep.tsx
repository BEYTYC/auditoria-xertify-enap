/**
 * RegisterStep.tsx
 * Paso 3: confirmación de la numeración, envío a SharePoint y comprobante.
 */

import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  CloudOff,
  ExternalLink,
  FileSpreadsheet,
  Loader2,
  Mail,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import {
  duplicateMessage,
  type DuplicateFinding,
} from '../services/duplicateService';
import { describeAllocation } from '../services/numberingService';
import { officeLabel } from '../services/officeService';
import { canonicalName } from '../services/validatorService';
import { toDisplayTitle } from '../services/textUtils';
import type { RegistrationPreview } from '../services/registryService';
import type { TableInfo } from '../services/sharepointService';
import type { BatchMetadata, RegistrationResult, SharePointConfig } from '../types';
import { SelloDeAgua } from './Escudo';

/** La demo publicada corre dentro de un visor que no permite descargar archivos. */
const IS_DEMO = import.meta.env.VITE_DEMO === '1';

/** Generador de certificados de Xertify, donde se carga el archivo corregido. */
const XERTIFY_GENERATOR_URL = 'https://generador.xertify.co/';

const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

interface RegisterStepProps {
  preview: RegistrationPreview | null;
  metadata: BatchMetadata;
  config: SharePointConfig;
  tableInfo: TableInfo | null;
  loading: string | null;
  error: string | null;
  result: RegistrationResult | null;
  clean: boolean;
  onInspect: () => void;
  onRegister: () => void;
  /** Lote ya asentado: si viene, no se deja volver a registrar. */
  duplicado: DuplicateFinding | null;
  onVerBitacora: () => void;
  onDownloadCorrected: (idRegistro: string) => void;
  onReset: () => void;
}

export function RegisterStep(props: RegisterStepProps) {
  const { preview, result } = props;

  if (result) return <Receipt {...props} result={result} />;
  if (!preview) {
    return <p className="text-sm text-slate-500">Cargue una plantilla para continuar.</p>;
  }

  return <Confirmation {...props} preview={preview} />;
}

/* ------------------------------------------------------------------ */
/* Confirmación previa                                                 */
/* ------------------------------------------------------------------ */

function Confirmation({
  preview,
  metadata,
  tableInfo,
  loading,
  error,
  clean,
  onInspect,
  onRegister,
  duplicado,
  onVerBitacora,
}: RegisterStepProps & { preview: RegistrationPreview }) {
  const listo =
    clean &&
    Boolean(metadata.oficina) &&
    Boolean(metadata.responsable.trim()) &&
    EMAIL_PATTERN.test(metadata.correoResponsable.trim()) &&
    !duplicado;
  const { receipt } = preview;
  const missingOptional =
    tableInfo && !tableInfo.availableOptionalColumns.includes('DIRECTOR FIRMANTE');

  // Al entrar al paso se relee la última posición asentada, para que la
  // numeración salga del libro y no de lo que quedó guardado de otra sesión.
  const yaConsultado = useRef(false);
  useEffect(() => {
    if (yaConsultado.current) return;
    yaConsultado.current = true;
    onInspect();
  }, [onInspect]);

  return (
    <div className="mx-auto w-full max-w-[1120px] space-y-5">
      <header>
        <h2 className="text-xl font-semibold text-navy-900">Confirmación del registro</h2>
      </header>

      <section className="card p-5">
        <h3 className="mb-3 text-sm font-semibold text-navy-900">Resumen del lote</h3>
        <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
          <Detail label="Archivo" value={metadata.archivoOriginal} />
          <Detail label="Curso" value={metadata.curso ? toDisplayTitle(metadata.curso) : '—'} />
          <Detail
            label="Facultad u oficina responsable"
            value={metadata.oficina ? officeLabel(metadata.oficina) : '— sin confirmar —'}
          />
          <Detail
            label="Responsable"
            value={metadata.responsable ? canonicalName(metadata.responsable) : '— sin indicar —'}
          />
          <Detail label="Total registros" value={String(receipt.stats.totalGraduados)} />
          <Detail
            label="Nacionalidad"
            value={`${receipt.stats.totalColombianos} colombianos · ${receipt.stats.totalExtranjeros} extranjeros`}
          />
          <Detail
            label="Total registros corregidos"
            value={String(receipt.stats.erroresAuto + receipt.stats.erroresManuales)}
          />
        </dl>
      </section>

      {missingOptional && (
        <Notice tone="warning">
          La tabla de destino no tiene la columna <strong>DIRECTOR FIRMANTE</strong>, así que{' '}
          <code>nomfirma3</code> no se escribirá. Créela en la Base de Datos y vuelva a consultar
          para activarla.
        </Notice>
      )}

      {duplicado && (
        <section className="rounded-xl border-2 border-rose-300 bg-rose-50 px-5 py-4">
          <div className="flex items-start gap-3">
            <ShieldAlert size={22} className="mt-0.5 shrink-0 text-rose-600" />
            <div>
              <h3 className="text-sm font-semibold text-rose-900">
                Este lote ya tiene registro oficial
              </h3>
              <p className="mt-1 text-[13px] leading-relaxed text-rose-900">
                {duplicateMessage(duplicado)}
              </p>
              <button
                type="button"
                onClick={onVerBitacora}
                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-[13px] font-medium text-rose-800 transition hover:bg-rose-100"
              >
                <BookOpen size={15} />
                Abrir la bitácora de registros
              </button>
            </div>
          </div>
        </section>
      )}

      {error && !duplicado && <Notice tone="error">{error}</Notice>}

      {/* Si el lote ya está duplicado, no tiene caso ofrecer el botón de
          registrar —ni siquiera deshabilitado—: la única acción que queda es
          ir a la bitácora, y esa ya está en el aviso de arriba. */}
      {!duplicado && (
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={onRegister}
            disabled={!listo || !!loading}
            title={
              listo
                ? 'Anexa una fila por graduado al final de Tabla3, sin sobrescribir nada.'
                : 'Complete la facultad y el responsable antes de asentar el registro.'
            }
            className={[
              'group inline-flex items-center gap-3 rounded-full px-9 py-4 text-base font-semibold shadow-lg ring-1 ring-inset transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
              loading
                ? 'cursor-wait bg-gradient-to-r from-navy-700 to-navy-500 text-white shadow-navy-900/25 ring-white/20 focus-visible:ring-navy-400'
                : 'bg-gradient-to-r from-emerald-700 to-emerald-500 text-white shadow-emerald-900/25 ring-white/20 hover:from-emerald-600 hover:to-emerald-400 hover:shadow-xl focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-300 disabled:text-slate-500 disabled:shadow-none disabled:ring-0',
            ].join(' ')}
          >
            {loading ? <Loader2 size={20} className="animate-spin" /> : <ShieldCheck size={20} />}
            {loading ?? 'Generar registro oficial'}
          </button>
          {loading && (
            <p className="flex items-center gap-1.5 text-[12px] text-slate-500">
              Esto puede tardar unos segundos: no cierre ni recargue la ventana.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Comprobante                                                         */
/* ------------------------------------------------------------------ */

function Receipt({
  result,
  metadata,
  onDownloadCorrected,
  onReset,
}: RegisterStepProps & { result: RegistrationResult }) {
  const ok = result.outcome === 'success';
  const { receipt } = result;
  const correo = metadata.correoResponsable.trim();

  // El destello verde y el chulo grande son la confirmación visual de que el
  // registro quedó en pie; se apagan solos para no dejar la pantalla verde.
  const [flash, setFlash] = useState(ok);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto w-full max-w-[1120px]"
    >
      {/* Un solo documento: membrete, encabezado del registro, datos y entrega
          del archivo, todo sobre el sello de la Escuela. */}
      <div className="card overflow-hidden">
        <motion.div
          initial={ok ? { backgroundColor: 'rgb(209,250,229)' } : undefined}
          animate={{ backgroundColor: 'rgb(255,255,255)' }}
          transition={{ duration: 1.6, ease: 'easeOut' }}
          onAnimationComplete={() => setFlash(false)}
          className={['relative overflow-hidden', ok ? '' : 'bg-amber-50'].join(' ')}
        >
          <SelloDeAgua opacity={0.05} height={640} />

          <div className="relative">
            {/* Encabezado del cuadro: el resultado y su número, en una línea. */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b-2 border-gold-500 px-6 py-3">
              <AnimatePresence>
                <motion.span
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: ok ? [0.4, 1.3, 1] : 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 220, damping: 16, duration: 0.6 }}
                  className="inline-flex"
                >
                  {ok ? (
                    <CheckCircle2
                      size={ok && flash ? 36 : 26}
                      className="text-emerald-600 transition-[width,height] duration-500"
                    />
                  ) : (
                    <CloudOff size={26} className="text-amber-600" />
                  )}
                </motion.span>
              </AnimatePresence>
              <h2 className="text-base font-semibold text-navy-900">
                {ok ? 'Registro oficial generado' : 'El lote quedó respaldado, pero no llegó a SharePoint'}
              </h2>
              <span className="font-mono text-base font-semibold tracking-tight text-navy-900">
                {receipt.idRegistro}
              </span>
            </div>

            <div className="px-6 py-4">
              <h3 className="mb-2 text-sm font-semibold text-navy-900">
                Datos registrados en Oficina de Estadística
              </h3>
              <dl className="grid gap-x-10 gap-y-3 text-sm sm:grid-cols-3">
                <Detail label="Fecha y hora" value={receipt.fechaHoraLegible} />
                <Detail label="Curso" value={toDisplayTitle(receipt.curso)} />
                <Detail label="Facultad u oficina" value={officeLabel(receipt.oficina)} />
                <Detail label="Responsable" value={canonicalName(receipt.responsable)} />
                <Detail label="Filas enviadas" value={String(result.rowsSent)} />
                <Detail label="Ubicación en el libro" value={describeAllocation(receipt.allocation)} />
                <Detail label="Estado" value={toDisplayTitle(receipt.estado)} />
                <Detail label="Archivo original" value={receipt.archivoOriginal} />
                <Detail label="Referencia de auditoría" value={receipt.referenciaAuditoria} />
              </dl>

              {!ok && <p className="mt-2 text-[13px] text-slate-700">{result.message}</p>}

              {result.errorDetail && (
                <details className="mt-2 rounded-lg bg-white/70 px-3 py-2 text-xs text-slate-600">
                  <summary className="cursor-pointer font-medium">
                    Detalle técnico del error
                  </summary>
                  <p className="mt-2 break-words font-mono">{result.errorDetail}</p>
                </details>
              )}

              {correo && (
                <p className="mt-3 flex items-center gap-1.5 text-[12px] text-slate-600">
                  <Mail size={13} className="shrink-0 text-sky-700" />
                  Se envió el registro a <strong className="text-navy-900">{correo}</strong>.
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-slate-200 pt-3">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => onDownloadCorrected(receipt.idRegistro)}
                >
                  <FileSpreadsheet size={15} />
                  Descargar archivo corregido
                </button>
                <a
                  href={XERTIFY_GENERATOR_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary"
                >
                  <ExternalLink size={15} />
                  Cargar en Xertify
                </a>
                <button type="button" className="btn-ghost ml-auto" onClick={onReset}>
                  Auditar otro lote
                </button>
              </div>

              {IS_DEMO && (
                <p className="mt-1 text-[11px] leading-snug text-slate-500">
                  En esta demo publicada el visor bloquea las descargas. En la aplicación
                  instalada el archivo corregido se descarga al hacer clic en el botón.
                </p>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Piezas                                                              */
/* ------------------------------------------------------------------ */

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-navy-900">{value}</dd>
    </div>
  );
}

function Notice({
  tone,
  children,
}: {
  tone: 'info' | 'warning' | 'error';
  children: React.ReactNode;
}) {
  const styles = {
    info: 'border-sky-200 bg-sky-50 text-sky-900',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    error: 'border-rose-200 bg-rose-50 text-rose-900',
  }[tone];

  return (
    <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${styles}`}>
      <AlertCircle size={17} className="mt-0.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

