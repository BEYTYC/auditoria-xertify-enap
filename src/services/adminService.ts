/**
 * adminService.ts
 * Quién puede deshacer lo hecho.
 *
 * Registrar es un trámite de todos los días; anular un registro del libro o
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
  'admin',
  'jestadistica',
  'jestadisticaplen',
  'jestadisticaplen@enap.edu.co',
  'jestadistica@enap.edu.co',
];

/**
 * Contraseña de la cuenta de la Oficina de Estadística.
 *
 * Es la misma barrera de siempre —contra el clic accidental, no contra quien
 * de verdad quiera forzarla—, pero ahora pide también la clave para entrar.
 */
export const ADMIN_PASSWORD = 'Enap2026**';

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

/**
 * Abre el modo administración. Devuelve `null` si la cuenta no corresponde o
 * la contraseña no coincide.
 */
export function openAdmin(account: string, password: string): string | null {
  if (!isAdminAccount(account)) return null;
  if (password !== ADMIN_PASSWORD) return null;
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
