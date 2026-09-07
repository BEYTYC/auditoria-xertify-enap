/**
 * brand.ts
 * Identidad institucional: nombres oficiales y dependencia.
 *
 * El escudo vive en `src/assets/escudo.png` (y su versión blanca para fondos
 * oscuros), empaquetado con la aplicación para que funcione sin conexión.
 */

export const INSTITUCION = {
  fuerza: 'Armada de Colombia',
  nombre: 'Escuela Naval de Cadetes «Almirante Padilla»',
  sigla: 'ENAP',
  dependencia: 'Oficina de Estadística',
  ciudad: 'Cartagena de Indias D. T. y C.',
  sistema: 'Registro de Cursos de Extensión',
  libro: 'Libro de Registro de Cursos de Extensión',
};

/**
 * Paleta institucional: azul naval y dorado.
 * Se replica en `tailwind.config.js`; aquí están los valores literales para
 * donde haga falta el color exacto (SVG, comprobantes, exportaciones).
 */
export const COLORS = {
  navy950: '#04142E',
  navy900: '#071C3C',
  navy800: '#0B2A5B',
  navy700: '#123A73',
  navy600: '#1B4C92',
  gold: '#C9A227',
  goldLight: '#E3C767',
};
