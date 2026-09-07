/**
 * SettingsDialog.tsx
 * Panel de conexión con SharePoint: elige el adaptador y guarda sus credenciales.
 */

import { Cloud, Server, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { effectiveMode } from '../config/appConfig';
import type { SharePointConfig, SharePointMode } from '../types';

interface SettingsDialogProps {
  open: boolean;
  config: SharePointConfig;
  onClose: () => void;
  onSave: (config: SharePointConfig) => void;
  onTest: () => void;
  testing: boolean;
  testResult: string | null;
}

const MODES: { key: SharePointMode; title: string; body: string }[] = [
  {
    key: 'graph',
    title: 'Microsoft Graph',
    body: 'La app escribe directamente en la tabla del Excel de SharePoint. Requiere App Registration con permisos Files.ReadWrite.All.',
  },
  {
    key: 'webhook',
    title: 'Power Automate',
    body: 'La app envía un JSON a un flujo HTTP que anexa las filas. No requiere App Registration.',
  },
  {
    key: 'mock',
    title: 'Registro local',
    body: 'Todo queda en este navegador y se exporta a CSV. Útil para probar sin tocar la base real.',
  },
];

export function SettingsDialog({
  open,
  config,
  onClose,
  onSave,
  onTest,
  testing,
  testResult,
}: SettingsDialogProps) {
  const [draft, setDraft] = useState<SharePointConfig>(config);

  useEffect(() => setDraft(config), [config, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const active = effectiveMode(draft);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Conexión con SharePoint"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy-950/40 p-4 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="card my-8 w-full max-w-2xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-navy-900">
            <Server size={16} className="text-navy-600" />
            Conexión con la Base de Datos
          </h2>
          <button type="button" onClick={onClose} className="btn-ghost px-2 py-1">
            <X size={16} />
            <span className="sr-only">Cerrar</span>
          </button>
        </header>

        <div className="space-y-5 px-5 py-5">
          <fieldset>
            <legend className="label">Método de escritura</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {MODES.map((mode) => (
                <label
                  key={mode.key}
                  className={[
                    'cursor-pointer rounded-lg border p-3 text-left transition',
                    draft.mode === mode.key
                      ? 'border-navy-600 bg-navy-50'
                      : 'border-slate-200 hover:border-slate-300',
                  ].join(' ')}
                >
                  <input
                    type="radio"
                    name="mode"
                    className="sr-only"
                    checked={draft.mode === mode.key}
                    onChange={() => setDraft({ ...draft, mode: mode.key })}
                  />
                  <span className="block text-sm font-medium text-navy-900">{mode.title}</span>
                  <span className="mt-1 block text-[11px] leading-snug text-slate-600">
                    {mode.body}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {draft.mode === 'graph' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <p className="text-[12px] leading-snug text-slate-600 sm:col-span-2">
                Basta con la cuenta dueña del archivo y su ruta —«Estadística/Bases de
                Datos/…/Base de Datos Cursos de Extensión.xlsx»—: la aplicación resuelve sola
                los identificadores. Los campos de Drive e Item solo hacen falta si prefiere
                fijarlos a mano.
              </p>
              <Text
                label="Client ID (aplicación)"
                value={draft.graph?.clientId ?? ''}
                onChange={(clientId) =>
                  setDraft({ ...draft, graph: { ...draft.graph!, clientId } })
                }
              />
              <Text
                label="Tenant ID (directorio)"
                value={draft.graph?.tenantId ?? ''}
                onChange={(tenantId) =>
                  setDraft({ ...draft, graph: { ...draft.graph!, tenantId } })
                }
              />
              <Text
                label="Cuenta dueña del archivo"
                value={draft.graph?.ownerUpn ?? ''}
                onChange={(ownerUpn) => setDraft({ ...draft, graph: { ...draft.graph!, ownerUpn } })}
              />
              <Text
                label="Ruta del archivo en su OneDrive"
                value={draft.graph?.filePath ?? ''}
                onChange={(filePath) => setDraft({ ...draft, graph: { ...draft.graph!, filePath } })}
              />
              <Text
                label="Drive ID (opcional, si ya lo tiene)"
                value={draft.graph?.driveId ?? ''}
                onChange={(driveId) => setDraft({ ...draft, graph: { ...draft.graph!, driveId } })}
              />
              <Text
                label="Item ID (opcional, si ya lo tiene)"
                value={draft.graph?.itemId ?? ''}
                onChange={(itemId) => setDraft({ ...draft, graph: { ...draft.graph!, itemId } })}
              />
              <Text
                label="Tabla"
                value={draft.graph?.tableId ?? ''}
                onChange={(tableId) => setDraft({ ...draft, graph: { ...draft.graph!, tableId } })}
              />
              <Text
                label="Hoja"
                value={draft.graph?.worksheetName ?? ''}
                onChange={(worksheetName) =>
                  setDraft({ ...draft, graph: { ...draft.graph!, worksheetName } })
                }
              />
            </div>
          )}

          {draft.mode === 'webhook' && (
            <div className="space-y-3">
              <Text
                label="URL del flujo (HTTP request)"
                value={draft.webhook?.url ?? ''}
                onChange={(url) => setDraft({ ...draft, webhook: { ...draft.webhook!, url } })}
              />
              <Text
                label="Clave compartida (cabecera x-api-key, opcional)"
                value={draft.webhook?.headers?.['x-api-key'] ?? ''}
                onChange={(key) =>
                  setDraft({
                    ...draft,
                    webhook: {
                      ...draft.webhook!,
                      headers: key ? { 'x-api-key': key } : undefined,
                    },
                  })
                }
              />
            </div>
          )}

          {draft.mode !== active && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Con los datos actuales la app usaría el <strong>registro local</strong>: falta
              completar la configuración de {draft.mode === 'graph' ? 'Graph' : 'Power Automate'}.
            </p>
          )}

          {testResult && (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">{testResult}</p>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button type="button" className="btn-secondary" onClick={onTest} disabled={testing}>
            <Cloud size={15} />
            {testing ? 'Probando…' : 'Probar conexión'}
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              onSave(draft);
              onClose();
            }}
          >
            Guardar
          </button>
        </footer>
      </div>
    </div>
  );
}

function Text({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        className="field font-mono text-xs"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
