/**
 * TemplatesMenu.tsx
 * Botón "Descarga de plantillas" que vive en la franja blanca del paso 1,
 * junto al indicador de pasos. Al pasar el mouse por encima (o al enfocarlo
 * con el teclado) despliega las plantillas oficiales disponibles para
 * descargar. Si no hay ninguna cargada todavía, el componente no se muestra.
 */

import { ChevronDown, Download } from 'lucide-react';

import { OFFICIAL_TEMPLATES } from '../data/officialTemplates';
import { downloadBlob } from '../services/excelService';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Baja la plantilla como archivo de verdad, en vez de dejar que el navegador
 * decida qué hacer con el enlace. Un `<a href download>` apuntando a un
 * estático a veces lo abre en una pestaña en línea en lugar de guardarlo
 * —depende del navegador y de cómo lo sirva el hosting—; trayendo los bytes
 * con `fetch` y soltándolos como blob se fuerza siempre el guardado, igual
 * que hacen las demás descargas de la app (`downloadAnnotated`, `downloadCorrected`).
 */
async function descargarPlantilla(plantilla: { archivo: string; nombre: string }) {
  const respuesta = await fetch(plantilla.archivo);
  if (!respuesta.ok) return;
  const bytes = await respuesta.arrayBuffer();
  const blob = new Blob([bytes], { type: XLSX_MIME });
  const nombreArchivo = plantilla.archivo.split('/').pop() ?? `${plantilla.nombre}.xlsx`;
  downloadBlob(blob, nombreArchivo);
}

export function TemplatesMenu() {
  if (OFFICIAL_TEMPLATES.length === 0) return null;

  return (
    <div className="group relative">
      <button
        type="button"
        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100 hover:text-navy-900 focus-visible:bg-slate-100 focus-visible:outline-none"
      >
        <Download size={15} />
        Descarga de plantillas
        <ChevronDown size={14} className="transition group-hover:rotate-180" />
      </button>

      {/* Puente invisible: evita que el menú se cierre en el hueco entre el
          botón y el panel al mover el mouse en diagonal. */}
      <div className="absolute right-0 top-full h-2 w-56" />

      <div
        className={[
          'invisible absolute right-0 top-full z-40 w-64 -translate-y-1 rounded-xl border',
          'border-slate-200 bg-white p-2 opacity-0 shadow-lg transition',
          'group-hover:visible group-hover:translate-y-0 group-hover:opacity-100',
          'group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100',
        ].join(' ')}
      >
        <p className="px-2 pb-1.5 pt-1 text-xs text-slate-500">
          Este archivo no corresponde a la plantilla oficial de Cursos de Extensión de la Oficina
          de Estadística. Descargue la plantilla oficial en el botón Descarga de plantillas.
        </p>
        <ul className="flex flex-col gap-1">
          {OFFICIAL_TEMPLATES.map((plantilla) => (
            <li key={plantilla.archivo}>
              <button
                type="button"
                onClick={() => void descargarPlantilla(plantilla)}
                title={plantilla.descripcion}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-navy-900 transition hover:bg-navy-50"
              >
                <Download size={14} className="shrink-0 text-navy-700" />
                <span className="min-w-0 leading-snug">{plantilla.nombre}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
