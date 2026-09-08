/**
 * useAuth.ts
 * Estado de acceso: pide correo institucional, valida el código y mantiene
 * la sesión mientras dure la pestaña (o entre recargas, si hay
 * almacenamiento local disponible).
 */

import { useCallback, useState } from 'react';

import {
  type AuthSession,
  clearSession,
  codeMatches,
  createPendingCode,
  isCodeExpired,
  isInstitutionalEmail,
  isTestUser,
  loadSession,
  saveSession,
} from '../services/authService';
import { ALLOWED_EMAIL_DOMAIN } from '../data/auth';

type AuthStage = 'email' | 'code';

interface PendingCode {
  email: string;
  code: string;
  expiresAt: number;
}

export function useAuth() {
  const [session, setSession] = useState<AuthSession | null>(() => loadSession());
  const [stage, setStage] = useState<AuthStage>('email');
  const [pending, setPending] = useState<PendingCode | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Código a mostrar en pantalla mientras no haya correo real conectado. */
  const [demoCode, setDemoCode] = useState<string | null>(null);

  const requestCode = useCallback((rawEmail: string) => {
    setError(null);

    if (isTestUser(rawEmail)) {
      const testSession: AuthSession = {
        email: 'admin',
        isTestUser: true,
        loggedInAt: Date.now(),
      };
      saveSession(testSession);
      setSession(testSession);
      return;
    }

    if (!isInstitutionalEmail(rawEmail)) {
      setError(`Use su correo institucional, terminado en «@${ALLOWED_EMAIL_DOMAIN}».`);
      return;
    }

    const code = createPendingCode(rawEmail);
    setPending(code);
    setDemoCode(code.code);
    setStage('code');
  }, []);

  const resendCode = useCallback(() => {
    if (!pending) return;
    const code = createPendingCode(pending.email);
    setPending(code);
    setDemoCode(code.code);
    setError(null);
  }, [pending]);

  const changeEmail = useCallback(() => {
    setStage('email');
    setPending(null);
    setDemoCode(null);
    setError(null);
  }, []);

  const verifyCode = useCallback(
    (attempt: string) => {
      if (!pending) return;
      if (isCodeExpired(pending)) {
        setError('El código venció. Solicite uno nuevo.');
        return;
      }
      if (!codeMatches(pending, attempt)) {
        setError('El código no coincide. Revíselo e intente de nuevo.');
        return;
      }
      const newSession: AuthSession = {
        email: pending.email,
        isTestUser: false,
        loggedInAt: Date.now(),
      };
      saveSession(newSession);
      setSession(newSession);
      setPending(null);
      setDemoCode(null);
      setError(null);
      setStage('email');
    },
    [pending],
  );

  const logout = useCallback(() => {
    clearSession();
    setSession(null);
    setStage('email');
    setPending(null);
    setDemoCode(null);
    setError(null);
  }, []);

  return {
    session,
    isAuthenticated: session !== null,
    stage,
    pendingEmail: pending?.email ?? null,
    demoCode,
    error,
    requestCode,
    resendCode,
    changeEmail,
    verifyCode,
    logout,
  };
}
