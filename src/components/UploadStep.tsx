/**
 * UploadStep.tsx
 * Paso 1: zona de arrastre para la plantilla de Xertify.
 */

import { motion } from 'framer-motion';
import { AlertCircle, FileSpreadsheet, Loader2, UploadCloud } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

import { INSTITUCION } from '../data/brand';

interface UploadStepProps {
  onFile: (file: File) => void;
  loading: string | null;
  error: string | null;
}

const ACCEPTED = ['.xlsx', '.xlsm', '.xls'];

export function UploadStep({ onFile, loading, error }: UploadStepProps) {
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

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-4 text-center sm:mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-600">
          {INSTITUCION.dependencia}
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-navy-900 sm:text-2xl">
          Auditoría de plantillas y registro de cursos de extensión
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

      {message && (
        <div
          role="alert"
          className="mt-4 flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <span>{message}</span>
        </div>
      )}

    </div>
  );
}
