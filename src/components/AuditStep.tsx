/**
 * AuditStep.tsx
 * Paso 2: filtros, datos del lote y tabla interactiva.
 *
 * Cada hallazgo se corrige uno por uno desde su propia celda: no hay
 * corrección masiva, para que quien valida vea lo que aprueba.
 */

import { ArrowRight, CircleCheck, Columns3, TriangleAlert, WandSparkles } from 'lucide-react';
import { useMemo } from 'react';

import { FIELD_LIST, FIELD_SPECS } from '../data/fields';
import { OFICINAS_RESPONSABLES, officeLabel, suggestOffice } from '../services/officeService';
import type { BatchMetrics } from '../services/correctorService';
import type {
  BatchMetadata,
  CanonicalField,
  ColumnMapping,
  RowFilter,
  StudentRow,
} from '../types';
import { AuditTable } from './AuditTable';

interface AuditStepProps {
  rows: StudentRow[];
  activeFields: Set<CanonicalField>;
  metrics: BatchMetrics;
  clean: boolean;
  filter: RowFilter;
  metadata: BatchMetadata;
  onFilter: (filter: RowFilter) => void;
  onEdit: (rowId: string, field: CanonicalField, value: string) => void;
  onRevert: (rowId: string, field: CanonicalField) => void;
  onRemove: (rowId: string) => void;
  onMetadata: (metadata: BatchMetadata) => void;
  onContinue: () => void;
  /** Aplica de una vez todas las propuestas del lote. */
  onAutoFix: () => void;
  /** Cómo quedó leída cada columna del archivo. */
  mappings: ColumnMapping[];
  /** Campos obligatorios que ningún encabezado alcanzó a cubrir. */
  missingRequired: CanonicalField[];
  onRemap: (columnIndex: number, field: CanonicalField | null) => void;
}

export function AuditStep({
  rows,
  activeFields,
  metrics,
  clean,
  filter,
  metadata,
  onFilter,
  onEdit,
  onRevert,
  onRemove,
  onMetadata,
  onContinue,
  onAutoFix,
  mappings,
  missingRequired,
  onRemap,
}: AuditStepProps) {
  // La tabla es el parte de lo que falta, no un volcado del archivo: solo se
  // muestran las columnas y las filas que todavía tienen algo que revisar. En
  // cuanto una fila queda resuelta, sale de la lista y el contador baja.
  const conNovedad = (cell: { issues: unknown[] }) => cell.issues.length > 0;

  const fields = useMemo(() => {
    const marcadas = new Set<CanonicalField>();
    for (const row of rows) {
      for (const [field, cell] of Object.entries(row.cells)) {
        if (conNovedad(cell)) marcadas.add(field as CanonicalField);
      }
    }
    return FIELD_LIST.map((spec) => spec.field).filter(
      (field) => marcadas.has(field) && activeFields.has(field),
    );
  }, [rows, activeFields]);

  const filasConNovedad = useMemo(
    () => rows.filter((row) => Object.values(row.cells).some(conNovedad)),
    [rows],
  );

  // El paso al registro exige, además de cero errores, saber quién responde.
  const listo = clean && Boolean(metadata.oficina) && Boolean(metadata.responsable.trim());

  const suggestion = useMemo(
    () => (metadata.curso ? suggestOffice(metadata.curso) : null),
    [metadata.curso],
  );

  // Cuántas filas se tocaron: es lo que se muestra al cerrar el lote.
  const filasCorregidas = rows.filter((row) =>
    Object.values(row.cells).some((cell) => cell.value !== cell.original),
  ).length;

  return (
    <div className="mx-auto w-full max-w-[1120px] space-y-4">
      <ColumnMap
        mappings={mappings}
        missingRequired={missingRequired}
        onRemap={onRemap}
      />

      <OfficePanel
        metadata={metadata}
        suggestion={suggestion}
        pendientes={metrics.errores}
        clean={clean}
        filter={filter}
        onMetadata={onMetadata}
        onFilter={onFilter}
      />

      {/* Cuando ya no queda nada por corregir, el paso siguiente se ofrece
          aquí mismo, centrado, sin tener que buscarlo. */}
      {clean && (
        <div className="flex justify-center pt-1">
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
      )}

      {/* Atajo para revisar el lote de un tirón. La auditoría seria se hace
          celda por celda; esto aplica de una vez todo lo que la máquina puede
          resolver sola, y deja a la vista lo que exige criterio humano. */}
      {metrics.autocorregibles > 0 && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onAutoFix}
            className="inline-flex items-center gap-2 rounded-lg border border-navy-300 bg-white px-4 py-2 text-sm font-medium text-navy-800 transition hover:bg-navy-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-navy-400"
          >
            <WandSparkles size={15} />
            Corregir todo
            <span className="rounded bg-navy-100 px-1.5 text-xs tabular-nums text-navy-800">
              {metrics.autocorregibles}
            </span>
          </button>
        </div>
      )}

      <AuditTable
        rows={filasConNovedad}
        corregidas={filasCorregidas}
        llegoLimpia={filasCorregidas === 0}
        fields={fields}
        filter={filter}
        onEdit={onEdit}
        onRevert={onRevert}
        onRemove={onRemove}
      />

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
        'card overflow-hidden',
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
/* Datos del lote y contador de novedades                              */
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
  pendientes,
  clean,
  filter,
  onMetadata,
  onFilter,
}: {
  metadata: BatchMetadata;
  suggestion: ReturnType<typeof suggestOffice> | null;
  pendientes: number;
  clean: boolean;
  filter: RowFilter;
  onMetadata: (metadata: BatchMetadata) => void;
  onFilter: (filter: RowFilter) => void;
}) {
  return (
    <section className="card p-4">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
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
            className={`field ${metadata.responsable.trim() ? '' : 'border-rose-300'}`}
            required
            aria-required
            placeholder="Nombre y grado"
            value={metadata.responsable}
            onChange={(event) => onMetadata({ ...metadata, responsable: event.target.value })}
          />
        </div>

        {/* Contador de novedades: al lado del responsable, solo el número.
            Al pulsarlo la tabla queda filtrada a las filas que faltan. */}
        <div className="sm:w-[104px]">
          <span className="label block">Novedades</span>
          <button
            type="button"
            onClick={() => onFilter(filter === 'errors' ? 'all' : 'errors')}
            aria-pressed={filter === 'errors'}
            title={
              clean
                ? 'Sin novedades: el lote está listo para registrar.'
                : filter === 'errors'
                  ? `${pendientes} novedades por corregir. Pulse para ver todas las filas.`
                  : `${pendientes} novedades por corregir. Pulse para ver solo esas filas.`
            }
            className={[
              'flex h-[42px] w-full items-center justify-center gap-1.5 rounded-lg border text-xl font-semibold tabular-nums transition',
              clean
                ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                : 'border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100',
            ].join(' ')}
          >
            {clean ? <CircleCheck size={20} /> : null}
            {clean ? 0 : pendientes}
            <span className="sr-only">
              {clean ? 'novedades: ninguna' : `novedades pendientes: ${pendientes}`}
            </span>
          </button>
        </div>
      </div>
    </section>
  );
}
