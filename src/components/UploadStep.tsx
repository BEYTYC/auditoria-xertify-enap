/**
 * UploadStep.tsx
 * Paso 1: zona de arrastre para la plantilla de Xertify.
 */

import { motion } from 'framer-motion';
import { AlertCircle, AlertTriangle, BookText, FileSpreadsheet, Loader2, UploadCloud } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { INSTITUCION } from '../data/brand';

/** Este error en particular (plantilla no oficial) se muestra como cuadro de
 *  notificación modal — no como la franja roja normal — porque es la causa
 *  más común de confusión al subir un archivo y merece detener a quien lo
 *  ve hasta que lo confirme, en vez de perderse como un texto más en pantalla. */
function esErrorPlantillaNoOficial(mensaje: string): boolean {
  return mensaje.includes('no es la plantilla oficial');
}

interface UploadStepProps {
  onFile: (file: File) => void;
  loading: string | null;
  error: string | null;
  /** Incrustada en el Portal, «Reiniciar» y «Volver al Inicio» ya viven en
   *  la franja flotante de arriba (siempre visibles, en todos los pasos),
   *  así que este paso no repite Reiniciar — solo el acceso a la bitácora,
   *  que es propio de «Cargar plantilla». */
  embedded?: boolean;
  /** Acceso directo a la bitácora de registros sin pasar por todo el
   *  asistente. Pide inicio de sesión igual que "Registrar". */
  onVerBitacora?: () => void;
}

const ACCEPTED = ['.xlsx', '.xlsm', '.xls'];

export function UploadStep({ onFile, loading, error, embedded, onVerBitacora }: UploadStepProps) {
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File | undefined) => {
      if (!file) return;
      const valid = ACCEPTED.some((extension) => file.name.toLowerCase().endsWith(extension));
      if (!valid) {
        setLocalError(`«${file.name}» no es un libro de Excel. Suba un archivo .xlsx o .xls.`);
        return;
      }
      setLocalError(null);
      onFile(file);
    },
    [onFile],
  );

  const message = localError ?? error;
  const esAvisoPlantilla = Boolean(message && esErrorPlantillaNoOficial(message));
  const [avisoAbierto, setAvisoAbierto] = useState(false);

  // Cada vez que llega un mensaje nuevo de "plantilla no oficial" (por
  // ejemplo, si sube otro archivo igualmente inválido), se vuelve a abrir el
  // cuadro — no solo la primera vez.
  useEffect(() => {
    if (esAvisoPlantilla) setAvisoAbierto(true);
  }, [message, esAvisoPlantilla]);

  return (
    <div className="mx-auto max-w-3xl">
      {/* Incrustada, los controles flotantes (arriba a la derecha) quedan
          fuera del flujo normal: este espacio evita que se encimen con el
          título cuando la ventana es angosta y ya no caben a su lado. */}
      {/* Reserva el espacio de la franja flotante de arriba — en pantallas
          angostas esa franja puede partirse en dos líneas (flex-wrap), así
          que aquí se reserva más alto que ancho, para que nunca se encime
          con el título de abajo. */}
      {embedded && <div className="h-20 sm:h-9" aria-hidden />}
      <header className="mb-4 text-center sm:mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-600">
          {INSTITUCION.dependencia}
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-navy-900 sm:text-2xl">
          Auditoría de Plantillas Xertify y
          <br />
          Registro de Cursos de Extensión
        </h1>
        <div className="mx-auto mt-2 h-px w-20 bg-gold-500" />
        <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-slate-600">
          Suba la plantilla que diligenció la facultad. Se revisa cada fila contra las reglas de
          Xertify y de la institución, y el registro se habilita solo cuando el lote queda en cero
          errores.
        </p>
      </header>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            handleFile(event.dataTransfer.files?.[0]);
          }}
          className={[
            'card flex flex-col items-center justify-center gap-3 px-6 py-6 text-center transition sm:py-8',
            dragging ? 'border-navy-500 bg-navy-50' : 'border-dashed border-slate-300',
          ].join(' ')}
        >
          {loading ? (
            <>
              <Loader2 className="animate-spin text-navy-600" size={34} />
              <p className="text-sm font-medium text-navy-800">{loading}</p>
            </>
          ) : (
            <>
              <span className="rounded-full bg-navy-50 p-3 text-navy-700">
                <UploadCloud size={26} strokeWidth={1.6} />
              </span>
              <p className="text-base font-medium text-navy-900">Arrastre aquí su plantilla.</p>
              <button
                type="button"
                className="btn-primary"
                onClick={() => inputRef.current?.click()}
              >
                <FileSpreadsheet size={16} />
                Seleccionar archivo
              </button>
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPTED.join(',')}
                className="sr-only"
                onChange={(event) => handleFile(event.target.files?.[0])}
              />
            </>
          )}
        </div>
      </motion.div>

      {embedded && onVerBitacora && (
        <div className="mt-4 flex flex-col items-center gap-2">
          {onVerBitacora && (
            <button
              type="button"
              onClick={onVerBitacora}
              title="Ver bitácora de registros (pide inicio de sesión)"
              className="inline-flex items-center gap-1.5 rounded-full border border-navy-200 bg-white px-3 py-1.5 text-xs font-semibold text-navy-700 shadow-sm transition hover:border-navy-300 hover:bg-navy-50 hover:text-navy-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-navy-400"
            >
              <BookText size={13} />
              Ver bitácora de registros
            </button>
          )}
        </div>
      )}

      {message && !esAvisoPlantilla && (
        <div
          role="alert"
          className="mt-4 flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {esAvisoPlantilla && avisoAbierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/40 px-4" role="alertdialog" aria-modal="true">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 rounded-full bg-rose-50 p-2 text-rose-600">
                <AlertTriangle size={20} />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-navy-900">Plantilla no válida</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{message}</p>
              </div>
            </div>
            <div className="mt-5 flex justify-end">
              <button type="button" className="btn-primary" onClick={() => setAvisoAbierto(false)}>
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
