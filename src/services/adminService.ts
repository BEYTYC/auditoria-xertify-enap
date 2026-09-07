/**
 * adminService.ts
 * Quién puede deshacer lo hecho.
 *
 * Registrar es un trámite de todos los días; anular un asiento del libro o
 * borrar la bitácora, no. Esas dos cosas quedan reservadas a la Oficina de
 * Estadística, que es la que responde por el libro.
 *
 * Esto es una barrera contra el accidente, no una cerradura: quien de verdad
 * puede escribir en `Tabla3` es quien tenga permiso sobre el archivo en
 * SharePoint, y eso lo decide SharePoint, no esta pantalla.
 */

const STORAGE_KEY = 'auditor-certificados.admin.v1';

/** Cuentas de la Oficina de Estadística. Se admite el usuario o el correo. */
export const ADMIN_ACCOUNTS = [
  'jestadistica',
  'jestadisticaplen',
  'jestadisticaplen@enap.edu.co',
  'jestadistica@enap.edu.co',
];

/** `true` si la cuenta indicada es de la Oficina de Estadística. */
export function isAdminAccount(account: string): boolean {
  const limpio = account.trim().toLowerCase();
  if (!limpio) return false;
  const usuario = limpio.split('@')[0];
  return ADMIN_ACCOUNTS.some(
    (permitida) => permitida === limpio || permitida.split('@')[0] === usuario,
  );
}

/** Cuenta con la que se abrió el modo administración, si sigue abierta. */
export function readAdmin(): string | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored && isAdminAccount(stored) ? stored : null;
  } catch {
    return null;
  }
}

/** Abre el modo administración. Devuelve `null` si la cuenta no corresponde. */
export function openAdmin(account: string): string | null {
  if (!isAdminAccount(account)) return null;
  const limpio = account.trim().toLowerCase();
  try {
    window.localStorage.setItem(STORAGE_KEY, limpio);
  } catch {
    // Sin almacenamiento: el modo dura lo que dure la pestaña.
  }
  return limpio;
}

export function closeAdmin(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nada que limpiar.
  }
}
