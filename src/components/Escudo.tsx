/**
 * Escudo.tsx
 * Escudo institucional de la Escuela Naval de Cadetes «Almirante Padilla».
 *
 * Se empaqueta dentro del bundle, así que la aplicación funciona sin conexión
 * y el archivo de demostración se puede abrir directamente.
 *
 * Tres versiones, según el fondo:
 *   `color`        azul sobre fondo claro (comprobante, documentos).
 *   `sobre-oscuro` conserva los blancos interiores y lleva halo blanco detrás,
 *                  para que el emblema no se pierda sobre el azul naval.
 *   `blanco`       silueta blanca, para el pie de página.
 */

import escudoBlanco from '../assets/escudo-blanco.png';
import escudoOscuro from '../assets/escudo-sobre-oscuro.png';
import escudoColor from '../assets/escudo.png';
import { INSTITUCION } from '../data/brand';

type Variante = 'color' | 'blanco' | 'sobre-oscuro';

const FUENTES: Record<Variante, string> = {
  color: escudoColor,
  blanco: escudoBlanco,
  'sobre-oscuro': escudoOscuro,
};

/**
 * Halo blanco recortado sobre la silueta del escudo: lo despega del azul sin
 * dibujarle un recuadro alrededor.
 */
const HALO =
  'drop-shadow(0 0 1.5px rgba(255,255,255,.95))' +
  ' drop-shadow(0 0 4px rgba(255,255,255,.7))' +
  ' drop-shadow(0 0 8px rgba(255,255,255,.35))';

interface EscudoProps {
  /** Alto en píxeles; el ancho se ajusta solo. */
  height?: number;
  variant?: Variante;
  className?: string;
}

export function Escudo({ height = 56, variant = 'color', className = '' }: EscudoProps) {
  return (
    <img
      src={FUENTES[variant]}
      alt={`Escudo de la ${INSTITUCION.nombre}`}
      className={`w-auto object-contain ${className}`}
      style={{ height, filter: variant === 'sobre-oscuro' ? HALO : undefined }}
    />
  );
}

/**
 * Marca de agua de fondo: el escudo en grande, muy tenue y detrás de todo.
 * `aria-hidden` porque es decorativa, y sin eventos para no estorbar al usuario.
 */
export function MarcaDeAgua() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 flex items-center justify-center overflow-hidden"
    >
      <img src={escudoColor} alt="" className="w-[min(72vw,640px)] max-w-none opacity-[0.05]" />
    </div>
  );
}

/**
 * Sello de agua dentro de un documento: se centra sobre el contenedor, que
 * debe llevar `relative overflow-hidden`.
 */
export function SelloDeAgua({
  opacity = 0.07,
  height = 320,
}: {
  opacity?: number;
  /**
   * Alto en píxeles. El archivo fuente mide 320px de alto, así que por
   * encima de eso se está ampliando: a esta opacidad tan baja el ligero
   * desenfoque no se nota, y por debajo del contenedor se recorta solo
   * (`overflow-hidden` en el envoltorio).
   */
  height?: number;
}) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"
    >
      <img
        src={escudoColor}
        alt=""
        className="w-auto max-w-none"
        style={{ opacity, height }}
      />
    </div>
  );
}
