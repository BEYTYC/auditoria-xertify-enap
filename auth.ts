/**
 * auth.ts
 * Reglas de acceso a la aplicación: solo correos institucionales
 * @enap.edu.co pueden solicitar código, salvo el usuario de prueba.
 */

/** Dominio institucional exigido para solicitar código de acceso. */
export const ALLOWED_EMAIL_DOMAIN = 'enap.edu.co';

/**
 * Usuario de prueba: entra sin correo institucional ni código, mientras no
 * haya un servicio de correo conectado. Se retira cuando el envío de
 * códigos sea real.
 */
export const TEST_USER = 'admin';

/** Minutos de validez de un código antes de tener que pedir uno nuevo. */
export const CODE_TTL_MINUTES = 10;

export const AUTH_STORAGE_KEY = 'xertify.auth.session';
