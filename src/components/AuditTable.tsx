/**
 * AuditTable.tsx
 * Tabla de auditoría: una fila por estudiante, con resaltado de hallazgos.
 * Toda celda se corrige a mano —un clic sobre el valor o sobre el lápiz—, y
 * cuando la regla trae propuesta aparece además el botón «Corregir».
 */

import {
  AlertTriangle,
  Check,
  CircleCheck,
  Pencil,
  RotateCcw,
  Trash2,
  WandSparkles,
  XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { FIELD_SPECS } from '../data/fields';
import { FIELD_DEPENDENCIES, hasBlockingDependency } from '../services/correctorService';
import type { CanonicalField, RowFilter, StudentRow, ValidationIssue } from '../types';
import { XERTIFY_DOCUMENT_TYPES, XERTIFY_DOC_FORMATS, XERTIFY_GENDERS } from '../data/xertifyParameters';

interface AuditTableProps {
  rows: StudentRow[];
  /** Cuántas filas del lote se corrigieron, para el mensaje de cierre. */
  corregidas: number;
  /** `true` si la plantilla llegó sin una sola novedad. */
  llegoLimpia: boolean;
  fields: CanonicalField[];
  filter: RowFilter;
  onEdit: (rowId: string, field: CanonicalField, value: string) => void;
  onRevert: (rowId: string, field: CanonicalField) => void;
  onRemove: (rowId: string) => void;
}

/**
 * Pinta el valor señalando los espacios que sobran con un guion rojo: verlos
 * es la única manera de entender un error que, por definición, es invisible.
 */
function SpacePreview({ text }: { text: string }) {
  const trozos = text.split('\u0001');
  return (
    <span className="ml-1 font-mono text-[11px] text-navy-900">
      «
      {trozos.map((trozo, i) => (
        <span key={i}>
          {i > 0 && <span className="font-bold text-rose-600">-</span>}
          {trozo}
        </span>
      ))}
      »
    </span>
  );
}

/** Cuántas filas se pintan de una vez; el resto se carga al hacer scroll. */
const PAGE_SIZE = 60;

function rowState(row: StudentRow, fields: CanonicalField[]) {
  let errors = 0;
  let warnings = 0;
  let fixed = 0;
  for (const field of fields) {
    const cell = row.cells[field];
    if (!cell) continue;
    for (const issue of cell.issues) {
      if (issue.severity === 'error') errors += 1;
      else warnings += 1;
    }
    if (cell.value !== cell.original) fixed += 1;
  }
  return { errors, warnings, fixed };
}

export function AuditTable({
  rows,
  corregidas,
  llegoLimpia,
  fields,
  filter,
  onEdit,
  onRevert,
  onRemove,
}: AuditTableProps) {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [editing, setEditing] = useState<{ rowId: string; field: CanonicalField } | null>(null);

  const visibleRows = useMemo(() => {
    return rows.filter((row) => {
      const state = rowState(row, fields);
      if (filter === 'errors') return state.errors > 0;
      if (filter === 'fixed') return state.fixed > 0;
      if (filter === 'clean') return state.errors === 0 && state.warnings === 0;
      return true;
    });
  }, [rows, fields, filter]);

  useEffect(() => setLimit(PAGE_SIZE), [filter, rows.length]);

  if (!visibleRows.length) {
    return (
      <div className="card w-full px-6 py-10 text-center">
        <CircleCheck className="mx-auto mb-3 text-emerald-600" size={30} />
        <p className="text-base font-semibold text-navy-900">
          {llegoLimpia
            ? 'La plantilla está perfectamente diligenciada.'
            : `${corregidas} ${corregidas === 1 ? 'fila corregida' : 'filas corregidas'}.`}
        </p>
        <p className="mt-1 text-sm text-slate-600">
          {llegoLimpia
            ? 'No hubo nada que corregir: el lote puede registrarse tal como llegó.'
            : 'No queda ninguna novedad pendiente.'}
        </p>
      </div>
    );
  }

  return (
    <div className="card audit-table-wrapper w-full overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          {/* Sin `sticky`: la tabla vive dentro de un contenedor con
              desplazamiento horizontal, y ahí el anclaje vertical se calcula
              contra ese contenedor, no contra la página, y el encabezado
              terminaba flotando en mitad del listado. */}
          <thead className="bg-slate-50 text-left">
            <tr className="border-b border-slate-200">
              <th
                scope="col"
                className="whitespace-nowrap px-3 py-2 text-xs font-semibold text-slate-500"
              >
                Fila y estudiante
              </th>
              {fields.map((field) => (
                <th
                  key={field}
                  scope="col"
                  className="px-3 py-2 text-xs font-semibold text-slate-600"
                  style={{ minWidth: FIELD_SPECS[field].width }}
                >
                  {FIELD_SPECS[field].label}
                </th>
              ))}
              <th scope="col" className="w-12 px-3 py-2">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.slice(0, limit).map((row) => {
              const state = rowState(row, fields);
              return (
                <tr
                  key={row.id}
                  className={[
                    'border-b border-slate-100 align-top',
                    state.errors > 0 ? 'bg-rose-50/40' : 'hover:bg-slate-50',
                  ].join(' ')}
                >
                  {/* La tabla solo trae las columnas con novedad, así que el
                      nombre acompaña al número de fila: sin él no se sabría de
                      quién es. Va en una sola línea. */}
                  <td className="whitespace-nowrap px-3 py-2 align-top text-[12px] text-navy-900">
                    <span className="font-mono text-slate-400">{row.excelRow}</span>
                    <span className="ml-2">
                      {[row.cells.nombres?.value, row.cells.apellidos?.value]
                        .filter(Boolean)
                        .join(' ') || '—'}
                    </span>
                  </td>

                  {fields.map((field) => (
                    <AuditCell
                      key={field}
                      row={row}
                      field={field}
                      editing={editing?.rowId === row.id && editing.field === field}
                      onStartEdit={() => setEditing({ rowId: row.id, field })}
                      onStopEdit={() => setEditing(null)}
                      onEdit={onEdit}
                      onRevert={onRevert}
                    />
                  ))}

                  <td className="px-2 py-2">
                    <button
                      type="button"
                      title="Quitar esta fila del lote"
                      onClick={() => onRemove(row.id)}
                      className="rounded p-1 text-slate-300 transition hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 size={14} />
                      <span className="sr-only">Quitar fila {row.excelRow}</span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {visibleRows.length > limit && (
        <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-center">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setLimit((value) => value + PAGE_SIZE)}
          >
            Mostrar {Math.min(PAGE_SIZE, visibleRows.length - limit)} filas más
            <span className="text-slate-400">
              ({limit} de {visibleRows.length})
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Celda                                                               */
/* ------------------------------------------------------------------ */

interface AuditCellProps {
  row: StudentRow;
  field: CanonicalField;
  editing: boolean;
  onStartEdit: () => void;
  onStopEdit: () => void;
  onEdit: (rowId: string, field: CanonicalField, value: string) => void;
  onRevert: (rowId: string, field: CanonicalField) => void;
}

/** Listas cerradas que se editan con desplegable en vez de texto libre. */
const OPTIONS: Partial<Record<CanonicalField, string[]>> = {
  tipodocumento: XERTIFY_DOCUMENT_TYPES,
  docformato: XERTIFY_DOC_FORMATS,
  genero: XERTIFY_GENDERS,
};

function AuditCell({
  row,
  field,
  editing,
  onStartEdit,
  onStopEdit,
  onEdit,
  onRevert,
}: AuditCellProps) {
  const cell = row.cells[field];
  const [draft, setDraft] = useState(cell?.value ?? '');
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(cell?.value ?? '');
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [editing, cell?.value]);

  if (!cell) return <td className="px-3 py-2" />;

  const errors = cell.issues.filter((issue) => issue.severity === 'error');
  const warnings = cell.issues.filter((issue) => issue.severity === 'warning');
  const changed = cell.value !== cell.original;
  const options = OPTIONS[field];

  // Mientras el campo del que este depende siga con error, su propuesta se
  // calculó sobre un dato equivocado y no se ofrece.
  const blocked = hasBlockingDependency(row, field);
  const blockingLabel = (FIELD_DEPENDENCIES[field] ?? [])
    .map((dependency) => FIELD_SPECS[dependency].label)
    .join(' y ');

  // Primera propuesta aplicable: es la que ofrece el botón «Corregir».
  const propuesta = cell.issues.find(
    (issue) => issue.suggestion !== undefined && issue.suggestion !== cell.value,
  );

  const commit = () => {
    if (draft !== cell.value) onEdit(row.id, field, draft);
    onStopEdit();
  };

  return (
    <td
      className={[
        'px-3 py-2',
        errors.length
          ? 'bg-rose-50'
          : warnings.length
            ? 'bg-amber-50/60'
            : changed && !errors.length
              ? 'bg-emerald-50/60'
              : '',
      ].join(' ')}
      onDoubleClick={onStartEdit}
    >
      {editing ? (
        options ? (
          <select
            ref={inputRef as React.RefObject<HTMLSelectElement>}
            className="field py-1 text-xs"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
          >
            <option value="">— sin valor —</option>
            {options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        ) : (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            className="field py-1 text-xs"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commit();
              if (event.key === 'Escape') onStopEdit();
            }}
          />
        )
      ) : (
        <div className="group">
          {/* Primera línea: el valor y, al lado, el botón que lo corrige. */}
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            {/* El valor es el propio control de edición: un clic lo abre, para
                que la corrección a mano no dependa de adivinar el doble clic. */}
            <button
              type="button"
              onClick={onStartEdit}
              title="Clic para corregir a mano"
              className={[
                'block break-words rounded text-left text-[13px] leading-snug',
                'hover:bg-white/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-navy-400',
                errors.length ? 'font-medium text-rose-900' : 'text-navy-900',
                cell.value ? '' : 'italic text-slate-400',
              ].join(' ')}
            >
              {cell.value || '(vacío)'}
            </button>
            <button
              type="button"
              onClick={onStartEdit}
              title="Corregir a mano"
              className={[
                'mt-0.5 shrink-0 rounded p-0.5 text-slate-400 transition hover:bg-white hover:text-navy-700',
                errors.length || warnings.length ? '' : 'opacity-0 group-hover:opacity-100',
              ].join(' ')}
            >
              <Pencil size={12} />
              <span className="sr-only">Corregir a mano</span>
            </button>
            {changed && (
              <button
                type="button"
                title={`Valor original: «${cell.original || '(vacío)'}». Clic para revertir.`}
                onClick={() => onRevert(row.id, field)}
                className="mt-0.5 shrink-0 rounded p-0.5 text-slate-300 opacity-0 transition group-hover:opacity-100 hover:text-navy-700"
              >
                <RotateCcw size={12} />
                <span className="sr-only">Revertir</span>
              </button>
            )}

            {propuesta && !blocked && (
              <button
                type="button"
                onClick={() => onEdit(row.id, field, propuesta.suggestion as string)}
                title={`Dejar esta celda en «${propuesta.suggestion}»`}
                className={[
                  'inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5',
                  'text-[10px] font-medium transition focus:outline-none focus-visible:ring-2',
                  'focus-visible:ring-navy-400 focus-visible:ring-offset-1',
                  propuesta.severity === 'error'
                    ? 'border-rose-300 bg-white text-rose-800 hover:bg-rose-100'
                    : 'border-amber-300 bg-white text-amber-800 hover:bg-amber-100',
                ].join(' ')}
              >
                <WandSparkles size={10} />
                Corregir
              </button>
            )}
          </div>

          {cell.issues.map((issue) => (
            <IssueNote
              key={issue.code + issue.message}
              issue={issue}
              blockedBy={blocked && issue === propuesta ? blockingLabel : undefined}
            />
          ))}

          {/* Corregida la celda, el aviso desaparece: queda el valor bueno y el
              visto verde. La fila sigue en la tabla para poder repasarla. */}
          {changed && !cell.issues.length && (
            <span
              title="Corregido"
              className="mt-0.5 inline-flex text-emerald-600"
            >
              <Check size={14} strokeWidth={3} />
              <span className="sr-only">Corregido</span>
            </span>
          )}
        </div>
      )}
    </td>
  );
}

/**
 * Un hallazgo con su botón de corrección. Cuando la regla trae una propuesta,
 * se aplica en esa sola celda; si no la trae, la celda se edita a mano. No hay
 * corrección masiva: se revisa y arregla caso por caso.
 */
function IssueNote({
  issue,
  blockedBy,
}: {
  issue: ValidationIssue;
  /** Campo que hay que arreglar antes; si viene, no se ofrece corregir. */
  blockedBy?: string;
}) {
  const isError = issue.severity === 'error';
  return (
    <p
      className={[
        'mt-0.5 flex items-start gap-1 text-[11px] leading-snug',
        isError ? 'text-rose-700' : 'text-amber-700',
      ].join(' ')}
    >
      {isError ? (
        <XCircle size={11} className="mt-0.5 shrink-0" />
      ) : (
        <AlertTriangle size={11} className="mt-0.5 shrink-0" />
      )}
      <span>
        {issue.message}
        {issue.preview && <SpacePreview text={issue.preview} />}
        {blockedBy && (
          <span className="italic text-slate-500"> Corrija primero {blockedBy}.</span>
        )}
      </span>
    </p>
  );
}
