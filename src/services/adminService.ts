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
 *
 * La sesión de administración NO se guarda en ningún almacenamiento del
 * navegador: vive solo en memoria, mientras dure la vista actual. Cualquier
 * recarga de la página (F5) o apertura nueva vuelve a pedir usuario y clave.
 */

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

/**
 * Ya no se recuerda entre recargas: siempre arranca sin sesión de
 * administración. Se deja esta función (devuelve siempre `null`) para no
 * tener que tocar los demás archivos que la llaman al iniciar.
 */
export function readAdmin(): string | null {
  return null;
}

/**
 * Abre el modo administración. Devuelve `null` si la cuenta no corresponde o
 * la contraseña no coincide. Ya no persiste en ningún almacenamiento: dura
 * solo mientras el estado de React lo mantenga (es decir, hasta la próxima
 * recarga de la página).
 */
export function openAdmin(account: string, password: string): string | null {
  if (!isAdminAccount(account)) return null;
  if (password !== ADMIN_PASSWORD) return null;
  return account.trim().toLowerCase();
}

export function closeAdmin(): void {
  // Nada que limpiar: el modo admin ya no se guarda en el navegador.
}
