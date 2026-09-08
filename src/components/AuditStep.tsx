/**
 * AuditStep.tsx
 * Paso 2: mapeo de columnas y, según el estado del lote, la descarga con las
 * novedades marcadas o los datos para continuar al registro.
 *
 * La plantilla no se corrige aquí dentro: cuando hay novedades, la única
 * acción es descargar la plantilla con cada celda pendiente resaltada en
 * amarillo y con un comentario de Excel. El responsable corrige ahí y vuelve
 * a cargar el archivo.
 */

import {
  ArrowRight,
  CircleCheck,
  Columns3,
  Download,
  Mail,
  TriangleAlert,
  UploadCloud,
} from 'lucide-react';
import { useMemo } from 'react';

import { FIELD_LIST, FIELD_SPECS } from '../data/fields';
import { OFICINAS_RESPONSABLES, officeLabel, suggestOffice } from '../services/officeService';
import { canonicalResponsable, startsWithGrado } from '../services/validatorService';
import type { BatchMetrics } from '../services/correctorService';
import type { BatchMetadata, CanonicalField, ColumnMapping } from '../types';

/**
 * Encabezados de una plantilla vieja o mal armada: no existen en el formato
 * oficial vigente, así que si aparecen hay que bajar la plantilla actual del
 * Portal Estadístico en vez de intentar mapearlos a mano.
 */
const OLD_TEMPLATE_HEADERS = new Set(['fechafin']);

/** Validación liviana del correo del responsable, solo para habilitar el paso. */
const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

interface AuditStepProps {
  activeFields: Set<CanonicalField>;
  metrics: BatchMetrics;
  clean: boolean;
  metadata: BatchMetadata;
  onMetadata: (metadata: BatchMetadata) => void;
  onContinue: () => void;
  /** Descarga la plantilla con las novedades resaltadas en amarillo y comentadas. */
  onDownloadAnnotated: () => void;
  /** Descarta el lote actual y vuelve a la pantalla de carga. */
  onReload: () => void;
  /** Cómo quedó leída cada columna del archivo. */
  mappings: ColumnMapping[];
  /** Campos obligatorios que ningún encabezado alcanzó a cubrir. */
  missingRequired: CanonicalField[];
  onRemap: (columnIndex: number, field: CanonicalField | null) => void;
  /** El detalle de qué columna quedó leída como qué campo es cosa de la Oficina. */
  isAdmin: boolean;
}

export function AuditStep({
  activeFields,
  metrics,
  clean,
  metadata,
  onMetadata,
  onContinue,
  onDownloadAnnotated,
  onReload,
  mappings,
  missingRequired,
  onRemap,
  isAdmin,
}: AuditStepProps) {
  // El paso al registro exige, además de cero errores, saber quién responde
  // y con qué grado firma: el responsable siempre valida con su grado.
  const listo =
    clean &&
    Boolean(metadata.oficina) &&
    Boolean(metadata.responsable.trim()) &&
    startsWithGrado(metadata.responsable) &&
    EMAIL_PATTERN.test(metadata.correoResponsable.trim());

  const suggestion = useMemo(
    () => (metadata.curso ? suggestOffice(metadata.curso) : null),
    [metadata.curso],
  );

  // Encabezados que solo existían en una plantilla vieja o mal armada: si
  // aparece alguno, el problema no es del diligenciamiento sino del archivo
  // en sí, y no vale la pena seguir auditando hasta que bajen la vigente.
  const plantillaVieja = mappings.some((mapping) =>
    OLD_TEMPLATE_HEADERS.has(mapping.header.trim().toLowerCase()),
  );

  return (
    <div className="mx-auto max-w-[720px] space-y-4 text-center">
      {plantillaVieja && (
        <div className="card flex flex-col items-center gap-2 border-rose-300 bg-rose-50 px-6 py-6">
          <TriangleAlert className="text-rose-600" size={26} />
          <p className="text-sm font-semibold text-rose-900">
            Esta plantilla no es la vigente: trae un encabezado que ya no existe en el formato
            oficial.
          </p>
          <p className="max-w-md text-sm text-rose-800">
            Descargue la plantilla actual desde el Portal Estadístico (
            <a
              href="https://enap.vercel.app"
              target="_blank"
              rel="noreferrer"
              className="font-medium underline"
            >
              enap.vercel.app
            </a>
            ), diligéncienla ahí y vuelva a cargarla.
          </p>
        </div>
      )}

      {isAdmin && (
        <ColumnMap mappings={mappings} missingRequired={missingRequired} onRemap={onRemap} />
      )}

      {!clean ? (
        <div className="card flex flex-col items-center gap-4 px-6 py-10">
          <span className="inline-flex rounded-full bg-amber-100 p-3 text-amber-700">
            <TriangleAlert size={28} />
          </span>
          <div>
            <p className="text-lg font-semibold text-navy-900">
              {metrics.errores} {metrics.errores === 1 ? 'novedad pendiente' : 'novedades pendientes'}
            </p>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">
              Descargue la plantilla: cada celda con una novedad queda en amarillo y con un
              comentario de Excel explicando qué corregir. Corríjala ahí y vuelva a cargarla.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={onDownloadAnnotated}
              className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-900 shadow-sm transition hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
            >
              <Download size={16} />
              Descargar plantilla con las novedades marcadas
            </button>
            <button
              type="button"
              onClick={onReload}
              className="inline-flex items-center gap-2 rounded-lg border border-navy-300 bg-white px-4 py-2.5 text-sm font-medium text-navy-800 transition hover:bg-navy-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-navy-400"
            >
              <UploadCloud size={16} />
              Volver a cargar la plantilla
            </button>
          </div>
        </div>
      ) : (
        <>
          <OfficePanel metadata={metadata} suggestion={suggestion} onMetadata={onMetadata} />

          <div className="card flex flex-col items-center gap-2 px-6 py-8">
            <CircleCheck className="text-emerald-600" size={30} />
            <p className="text-base font-semibold text-navy-900">
              La plantilla está perfectamente diligenciada.
            </p>
            <p className="text-sm text-slate-600">No queda ninguna novedad pendiente.</p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            <button
              type="button"
              onClick={onContinue}
              disabled={!listo}
              title={
                listo
                  ? 'El lote quedó en cero errores: continúe al registro oficial.'
                  : 'Complete la facultad y el responsable para continuar.'
              }
              className="group inline-flex items-center gap-3 rounded-full bg-gradient-to-r from-navy-800 to-navy-600 px-9 py-4 text-base font-semibold text-white shadow-lg shadow-navy-900/25 ring-1 ring-inset ring-white/15 transition hover:from-navy-700 hover:to-navy-500 hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-300 disabled:text-slate-500 disabled:shadow-none disabled:ring-0"
            >
              <CircleCheck size={20} className="text-gold-400 group-disabled:text-slate-400" />
              Continuar al registro
              <ArrowRight
                size={18}
                className="transition-transform group-hover:translate-x-1 group-disabled:translate-x-0"
              />
            </button>
          </div>
        </>
      )}

      {!activeFields.size && (
        <p className="text-sm text-slate-500">
          No se reconoció ninguna columna de la plantilla. Verifique que el archivo tenga la hoja{' '}
          <code>People</code> con los encabezados en la fila 2.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Lectura de columnas                                                 */
/* ------------------------------------------------------------------ */

/**
 * Qué columna del archivo se leyó como qué campo.
 *
 * No todas las facultades usan la misma plantilla: el mismo dato aparece en
 * columnas distintas, o con otro encabezado. La app lo resuelve por el nombre
 * del encabezado —no por la posición—, pero cuando no acierta, aquí se corrige
 * a mano y el lote se vuelve a validar al instante.
 */
function ColumnMap({
  mappings,
  missingRequired,
  onRemap,
}: {
  mappings: ColumnMapping[];
  missingRequired: CanonicalField[];
  onRemap: (columnIndex: number, field: CanonicalField | null) => void;
}) {
  const conEncabezado = mappings.filter((mapping) => mapping.header.trim());
  const reconocidas = conEncabezado.filter((mapping) => mapping.field).length;
  const faltan = missingRequired.length > 0;

  if (!conEncabezado.length) return null;

  return (
    <details
      open={faltan}
      className={[
        'card overflow-hidden text-left',
        faltan ? 'border-amber-300 bg-amber-50/60' : '',
      ].join(' ')}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-sm">
        {faltan ? (
          <TriangleAlert size={15} className="shrink-0 text-amber-600" />
        ) : (
          <Columns3 size={15} className="shrink-0 text-navy-600" />
        )}
        <span className="font-semibold text-navy-900">
          {faltan
            ? missingRequired.length === 1
              ? 'Falta una columna obligatoria'
              : `Faltan ${missingRequired.length} columnas obligatorias`
            : `Columnas leídas: ${reconocidas} de ${conEncabezado.length}`}
        </span>
        <span className="text-[12px] text-slate-500">
          {faltan
            ? `— ${missingRequired.map((field) => FIELD_SPECS[field].label).join(', ')}. ` +
              `${missingRequired.length === 1 ? 'Asígnela' : 'Asígnelas'} abajo.`
            : '— ábralo si alguna columna quedó mal asignada.'}
        </span>
      </summary>

      <div className="grid gap-3 border-t border-slate-200 px-4 py-3 sm:grid-cols-2 lg:grid-cols-3">
        {conEncabezado.map((mapping) => (
          <label key={mapping.index} className="block">
            <span className="label block truncate" title={mapping.header}>
              {mapping.header}
            </span>
            <select
              className="field py-1.5 text-xs"
              value={mapping.field ?? ''}
              onChange={(event) =>
                onRemap(mapping.index, (event.target.value || null) as CanonicalField | null)
              }
            >
              <option value="">— sin usar —</option>
              {FIELD_LIST.map((spec) => (
                <option key={spec.field} value={spec.field}>
                  {spec.label}
                  {spec.requirement === 'opcional' ? '' : ' *'}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </details>
  );
}

/* ------------------------------------------------------------------ */
/* Datos de la facultad y del responsable                              */
/* ------------------------------------------------------------------ */

/** Marca de campo obligatorio, con su lectura para quien usa lector de pantalla. */
function Obligatorio() {
  return (
    <span className="font-semibold text-rose-600">
      *<span className="sr-only"> obligatorio</span>
    </span>
  );
}

function OfficePanel({
  metadata,
  suggestion,
  onMetadata,
}: {
  metadata: BatchMetadata;
  suggestion: ReturnType<typeof suggestOffice> | null;
  onMetadata: (metadata: BatchMetadata) => void;
}) {
  const responsableEscrito = metadata.responsable.trim().length > 0;
  const responsableTieneGrado = startsWithGrado(metadata.responsable);
  const responsableValido = responsableEscrito && responsableTieneGrado;

  const correoEscrito = metadata.correoResponsable.trim().length > 0;
  const correoValido = EMAIL_PATTERN.test(metadata.correoResponsable.trim());

  return (
    <section className="card p-4 text-left">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="oficina">
            Facultad u oficina responsable <Obligatorio />
          </label>
          <select
            id="oficina"
            className={`field ${metadata.oficina ? '' : 'border-rose-300'}`}
            required
            aria-required
            value={metadata.oficina}
            onChange={(event) => onMetadata({ ...metadata, oficina: event.target.value })}
          >
            <option value="">— seleccione —</option>
            {OFICINAS_RESPONSABLES.map((office) => (
              <option key={office} value={office}>
                {officeLabel(office)}
              </option>
            ))}
          </select>
          {suggestion?.oficina && metadata.oficina !== suggestion.oficina && (
            <button
              type="button"
              className="mt-1.5 text-[11px] font-medium text-navy-700 underline"
              onClick={() => onMetadata({ ...metadata, oficina: suggestion.oficina! })}
            >
              Usar la propuesta: {officeLabel(suggestion.oficina)}
            </button>
          )}
        </div>

        <div>
          <label className="label" htmlFor="responsable">
            Responsable que valida <Obligatorio />
          </label>
          <input
            id="responsable"
            className={`field ${responsableValido ? '' : 'border-rose-300'}`}
            required
            aria-required
            placeholder="Grado, apellidos y nombres completos"
            value={metadata.responsable}
            // Mientras se escribe se deja el texto tal cual: transformarlo en cada
            // tecla —como antes— borra el espacio que la persona acaba de poner
            // (canonicalResponsable recorta espacios finales) y pega las palabras
            // entre sí. El formato correcto —grado en siglas y mayúscula, apellidos
            // y nombres capitalizados— se aplica una sola vez, al salir del campo.
            onChange={(event) => onMetadata({ ...metadata, responsable: event.target.value })}
            onBlur={() =>
              onMetadata({ ...metadata, responsable: canonicalResponsable(metadata.responsable) })
            }
          />
          {responsableEscrito && !responsableTieneGrado && (
            <p className="mt-1.5 text-[11px] text-rose-600">
              Falta el grado en siglas al comienzo, p. ej. «DO», «OD» o «PD».
            </p>
          )}
        </div>

        <div className="sm:col-span-2">
          <label className="label" htmlFor="correoResponsable">
            Correo electrónico del responsable <Obligatorio />
          </label>
          <div
            className={`field flex items-center gap-2 ${correoValido ? '' : 'border-rose-300'}`}
          >
            <Mail size={15} className="shrink-0 text-slate-400" />
            <input
              id="correoResponsable"
              type="email"
              required
              aria-required
              placeholder="responsable@enap.edu.co"
              value={metadata.correoResponsable}
              onChange={(event) =>
                onMetadata({ ...metadata, correoResponsable: event.target.value })
              }
              className="w-full bg-transparent outline-none"
            />
          </div>
          <p className="mt-1.5 text-[11px] text-slate-500">
            Ahí se envía el comprobante del registro con el archivo corregido.
          </p>
          {correoEscrito && !correoValido && (
            <p className="mt-1 text-[11px] text-rose-600">No es un correo válido.</p>
          )}
        </div>
      </div>
    </section>
  );
}
