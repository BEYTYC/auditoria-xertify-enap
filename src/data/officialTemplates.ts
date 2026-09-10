/**
 * officialTemplates.ts
 * Plantillas oficiales que la Oficina de Estadística ofrece para descargar
 * en el Paso 1, antes de auditar nada. Son las únicas que el sistema acepta:
 * `excelService.ts` (`isOfficialTemplate`) exige que la hoja `Parameters`
 * traiga «Validación2» en la celda A1 (la marca vieja, solo «Validación» sin
 * el 2, ya no cuela: es de una plantilla desactualizada).
 *
 * Para agregar una plantilla:
 *   1. Copie el archivo .xlsx a `public/plantillas/`.
 *   2. Agregue una entrada aquí con su nombre visible y la ruta del archivo.
 * No hace falta tocar nada más: la sección en el Paso 1 se arma sola a
 * partir de esta lista, y si está vacía la sección simplemente no aparece.
 */

export interface OfficialTemplate {
  /** Nombre visible del botón/enlace de descarga. */
  nombre: string;
  /** Ruta del archivo dentro de `public/`, ej. `/plantillas/archivo.xlsx`. */
  archivo: string;
  /** Aclaración corta opcional (para cuándo usar esta plantilla y no otra). */
  descripcion?: string;
}

export const OFFICIAL_TEMPLATES: OfficialTemplate[] = [
  {
    nombre: 'Cursos de Extensión',
    archivo: '/plantillas/Plantilla Cursos Extension.xlsx',
  },
  {
    nombre: 'Cursos PreAntártico',
    archivo: '/plantillas/Plantilla Cursos PreAntartico.xlsx',
  },
  {
    nombre: 'Cursos de Ley',
    archivo: '/plantillas/Plantilla Cursos de Ley.xlsx',
  },
  {
    nombre: 'Cursos de Extensión CIDIAM',
    archivo: '/plantillas/Plantilla Cursos Extension CIDIAM.xlsx',
  },
];
