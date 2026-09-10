/**
 * useAuth.ts
 * Estado de acceso: pide correo institucional, valida el código y mantiene
 * la sesión mientras dure la pestaña (o entre recargas, si hay
 * almacenamiento local disponible).
 */

import { useCallback, useState } from 'react';

import { isAuthorizedRegistrar, loadAuthorizedRegistrars, loadConfig } from '../config/appConfig';
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

/**
 * Manda el código por correo real vía la función de Vercel `api/enviar-codigo`
 * (Microsoft Graph, mismo permiso de aplicación que ya usa el aviso de
 * confirmación del registro). Devuelve `true` si el correo salió; `false` si
 * algo falló (por ejemplo, si el consentimiento de administrador de TIC para
 * `Mail.Send` todavía no está concedido) — en ese caso quien llama muestra el
 * código en pantalla como respaldo, para no dejar a nadie bloqueado.
 */
async function enviarCodigoPorCorreo(email: string, code: string): Promise<boolean> {
  try {
    const apiKey = loadConfig().webhook?.headers?.['x-api-key'];
    const resp = await fetch('/api/enviar-codigo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'x-api-key': apiKey } : {}),
      },
      body: JSON.stringify({ email, code }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

export function useAuth() {
  const [session, setSession] = useState<AuthSession | null>(() => loadSession());
  const [stage, setStage] = useState<AuthStage>('email');
  const [pending, setPending] = useState<PendingCode | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * Código a mostrar en pantalla, solo cuando el envío por correo real falló
   * (respaldo). Mientras el correo esté saliendo bien, esto se queda en
   * `null` y nadie más que el dueño del correo ve el código.
   */
  const [demoCode, setDemoCode] = useState<string | null>(null);
  /** `true` mientras se espera la respuesta del envío de correo. */
  const [sendingCode, setSendingCode] = useState(false);

  const dispararEnvio = useCallback((code: PendingCode) => {
    setSendingCode(true);
    setDemoCode(null);
    void enviarCodigoPorCorreo(code.email, code.code).then((enviado) => {
      setSendingCode(false);
      if (!enviado) {
        // Respaldo: si el correo real falla, se muestra el código en
        // pantalla (marcado como modo de prueba) para no dejar a nadie
        // bloqueado mientras se resuelve el envío.
        setDemoCode(code.code);
      }
    });
  }, []);

  const requestCode = useCallback(
    (rawEmail: string) => {
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

      if (!isAuthorizedRegistrar(rawEmail, loadAuthorizedRegistrars())) {
        setError(
          'Este correo no está autorizado para registrar cursos de extensión. Si cree que debería ' +
            'estarlo, comuníquese con la Oficina de Estadística.',
        );
        return;
      }

      const code = createPendingCode(rawEmail);
      setPending(code);
      setStage('code');
      dispararEnvio(code);
    },
    [dispararEnvio],
  );

  const resendCode = useCallback(() => {
    if (!pending) return;
    const code = createPendingCode(pending.email);
    setPending(code);
    setError(null);
    dispararEnvio(code);
  }, [pending, dispararEnvio]);

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
    sendingCode,
    error,
    requestCode,
    resendCode,
    changeEmail,
    verifyCode,
    logout,
  };
}
