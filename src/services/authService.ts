/**
 * authService.ts
 * Validación de correo institucional, generación/verificación de código y
 * persistencia de la sesión.
 *
 * No hay todavía un servicio de correo conectado: mientras no lo haya, el
 * código generado se devuelve a quien llama (para mostrarlo en pantalla,
 * claramente marcado como modo de prueba) en lugar de enviarse por correo.
 * El día que se conecte un servicio real (p. ej. una función serverless con
 * SendGrid, SES o EmailJS), basta con reemplazar `requestAccessCode` para
 * que despache el correo y deje de devolver el código a la interfaz.
 */

import { ALLOWED_EMAIL_DOMAIN, AUTH_STORAGE_KEY, CODE_TTL_MINUTES, TEST_USER } from '../data/auth';

export interface AuthSession {
  email: string;
  /** `true` cuando entró por el usuario de prueba, sin correo ni código reales. */
  isTestUser: boolean;
  loggedInAt: number;
}

interface PendingCode {
  email: string;
  code: string;
  expiresAt: number;
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

/** El usuario de prueba se escribe tal cual, sin arroba ni dominio. */
export function isTestUser(value: string): boolean {
  return normalizeEmail(value) === TEST_USER;
}

export function isInstitutionalEmail(value: string): boolean {
  const email = normalizeEmail(value);
  if (!email.includes('@')) return false;
  const domain = email.split('@')[1] ?? '';
  return domain === ALLOWED_EMAIL_DOMAIN;
}

export function generateAccessCode(): string {
  const n = Math.floor(Math.random() * 1_000_000);
  return n.toString().padStart(6, '0');
}

export function createPendingCode(email: string): PendingCode {
  return {
    email: normalizeEmail(email),
    code: generateAccessCode(),
    expiresAt: Date.now() + CODE_TTL_MINUTES * 60_000,
  };
}

export function isCodeExpired(pending: PendingCode): boolean {
  return Date.now() > pending.expiresAt;
}

export function codeMatches(pending: PendingCode, attempt: string): boolean {
  return pending.code === attempt.trim();
}

export function loadSession(): AuthSession | null {
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSession;
    if (!parsed || typeof parsed.email !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(session: AuthSession): void {
  try {
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Sin almacenamiento disponible: la sesión solo dura mientras la pestaña
    // siga abierta, en memoria dentro del hook.
  }
}

export function clearSession(): void {
  try {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // Nada que limpiar si el almacenamiento no está disponible.
  }
}
