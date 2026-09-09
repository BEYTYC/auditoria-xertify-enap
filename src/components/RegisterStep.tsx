/**
 * RegisterStep.tsx
 * Paso 3: confirmación de la numeración, envío a SharePoint y comprobante.
 */

import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  FileSpreadsheet,
  Loader2,
  Mail,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useRef } from 'react';

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

  // Al entrar a este paso ya no hace falta un clic aparte: se dispara el
  // registro de una vez (que primero vuelve a consultar la Base de Datos y
  // luego asienta el lote). Si algo no está completo (o ya se detectó como
  // duplicado antes de llegar aquí), en cambio solo se consulta para mostrar
  // el resumen, y queda el botón para reintentar a mano.
  const yaDisparado = useRef(false);
  useEffect(() => {
    if (yaDisparado.current) return;
    yaDisparado.current = true;
    if (listo) {
      onRegister();
    } else {
      onInspect();
    }
  }, [listo, onInspect, onRegister]);

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
  onDownloadCorrected,
  onReset,
}: RegisterStepProps & { result: RegistrationResult }) {
  const ok = result.outcome === 'success';
  const { receipt } = result;

  // Apenas se ve el comprobante de un registro exitoso, se descarga la
  // plantilla corregida de una vez: no hace falta darle clic al botón aparte.
  const yaDescargado = useRef(false);
  useEffect(() => {
    if (!ok || yaDescargado.current) return;
    yaDescargado.current = true;
    onDownloadCorrected(receipt.idRegistro);
  }, [ok, receipt.idRegistro, onDownloadCorrected]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto w-full max-w-[1120px]"
    >
      {/* Un solo documento: membrete, encabezado del registro, datos y entrega
          del archivo, todo sobre el sello de la Escuela. */}
      <div className="card overflow-hidden">
        {/* El verde o el rojo claro quedan fijos: es la confirmación de que el
            registro quedó (o no quedó) en pie, y no debe desaparecer solo. */}
        <div className={['relative overflow-hidden', ok ? 'bg-[#f3fbf6]' : 'bg-rose-50'].join(' ')}>
          <SelloDeAgua opacity={0.05} height={640} />

          <div className="relative">
            {/* Encabezado del cuadro: el resultado y su número, en una línea. */}
            <div
              className={[
                'flex flex-wrap items-center gap-x-4 gap-y-1 border-b-2 px-6 py-3',
                ok ? 'border-emerald-500' : 'border-rose-500',
              ].join(' ')}
            >
              <AnimatePresence>
                <motion.span
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: [0.4, 1.3, 1], opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 220, damping: 16, duration: 0.6 }}
                  className="inline-flex"
                >
                  {ok ? (
                    <CheckCircle2 size={30} className="text-emerald-600" />
                  ) : (
                    <ShieldAlert size={30} className="text-rose-600" />
                  )}
                </motion.span>
              </AnimatePresence>
              <h2 className={['text-base font-semibold', ok ? 'text-navy-900' : 'text-rose-900'].join(' ')}>
                {ok ? 'Registro oficial generado' : 'No se pudo registrar en SharePoint: el lote NO quedó asentado'}
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

              {ok && (
                <p
                  className={[
                    'mt-3 flex items-center gap-1.5 text-[12px]',
                    result.emailSent ? 'text-slate-600' : 'text-amber-800',
                  ].join(' ')}
                >
                  <Mail
                    size={13}
                    className={['shrink-0', result.emailSent ? 'text-sky-700' : 'text-amber-600'].join(' ')}
                  />
                  {result.emailMessage}
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-slate-200 pt-3">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => onDownloadCorrected(receipt.idRegistro)}
                >
                  <FileSpreadsheet size={15} />
                  Descargar Plantilla Xertify con registro
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
        </div>
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

