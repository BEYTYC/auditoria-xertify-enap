/**
 * LoginScreen.tsx
 * Puerta de acceso: correo institucional @enap.edu.co + código de un solo
 * uso. Mientras no haya un servicio de correo conectado, el código se
 * muestra en pantalla (bloque marcado como modo de prueba) en lugar de
 * enviarse; el usuario de prueba «admin» entra sin ninguno de los dos pasos.
 */

import { AlertCircle, KeyRound, Mail, ShieldCheck } from 'lucide-react';
import { useState } from 'react';

import { ALLOWED_EMAIL_DOMAIN } from '../data/auth';
import { INSTITUCION } from '../data/brand';
import { Escudo } from './Escudo';

interface LoginScreenProps {
  stage: 'email' | 'code';
  pendingEmail: string | null;
  demoCode: string | null;
  error: string | null;
  onRequestCode: (email: string) => void;
  onVerifyCode: (code: string) => void;
  onResendCode: () => void;
  onChangeEmail: () => void;
}

export function LoginScreen({
  stage,
  pendingEmail,
  demoCode,
  error,
  onRequestCode,
  onVerifyCode,
  onResendCode,
  onChangeEmail,
}: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');

  return (
    <div className="flex min-h-[100dvh] flex-col bg-slate-50">
      <div className="bg-navy-900">
        <div className="mx-auto flex max-w-[1400px] items-center gap-4 px-4 py-4">
          <Escudo height={44} variant="sobre-oscuro" className="shrink-0" />
          <div className="min-w-0 leading-tight">
            <h1 className="truncate text-[13px] font-semibold text-white sm:text-[14px]">
              {INSTITUCION.nombre}
            </h1>
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold-400">
              {INSTITUCION.dependencia}
            </p>
            <p className="mt-0.5 text-[10px] text-navy-300 sm:truncate">{INSTITUCION.ciudad}</p>
          </div>
        </div>
      </div>
      <div className="h-1 bg-gold-500" />

      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <header className="mb-6 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-navy-50 text-navy-700">
              <ShieldCheck size={24} />
            </span>
            <h2 className="mt-3 text-lg font-semibold text-navy-900">Acceso institucional</h2>
            <p className="mt-1 text-sm text-slate-600">
              Auditoría de Plantillas Xertify y Registro de Cursos de Extensión
            </p>
          </header>

          <div className="card px-6 py-6">
            {stage === 'email' && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  onRequestCode(email);
                }}
                className="flex flex-col gap-4"
              >
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-navy-900">Correo institucional</span>
                  <div className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 focus-within:border-navy-500 focus-within:ring-2 focus-within:ring-navy-100">
                    <Mail size={16} className="shrink-0 text-slate-400" />
                    <input
                      type="text"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder={`usuario@${ALLOWED_EMAIL_DOMAIN}`}
                      autoFocus
                      className="w-full bg-transparent text-sm text-navy-900 outline-none placeholder:text-slate-400"
                    />
                  </div>
                </label>

                <button type="submit" className="btn-primary justify-center" disabled={!email.trim()}>
                  Enviar código
                </button>
              </form>
            )}

            {stage === 'code' && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  onVerifyCode(code);
                }}
                className="flex flex-col gap-4"
              >
                <p className="text-sm text-slate-600">
                  Se generó un código de acceso para <strong className="text-navy-900">{pendingEmail}</strong>.
                </p>

                {demoCode && (
                  <div className="rounded-lg border border-gold-500/60 bg-gold-50 px-3 py-2.5 text-sm text-navy-900">
                    <p className="font-semibold uppercase tracking-wide text-[10px] text-gold-700">
                      Modo de prueba — aún no hay correo conectado
                    </p>
                    <p className="mt-1">
                      Su código es <span className="font-mono text-base font-bold">{demoCode}</span>
                    </p>
                  </div>
                )}

                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="font-medium text-navy-900">Código de acceso</span>
                  <div className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 focus-within:border-navy-500 focus-within:ring-2 focus-within:ring-navy-100">
                    <KeyRound size={16} className="shrink-0 text-slate-400" />
                    <input
                      type="text"
                      inputMode="numeric"
                      value={code}
                      onChange={(event) => setCode(event.target.value)}
                      placeholder="000000"
                      autoFocus
                      className="w-full bg-transparent text-sm tracking-[0.3em] text-navy-900 outline-none placeholder:tracking-normal placeholder:text-slate-400"
                    />
                  </div>
                </label>

                <button type="submit" className="btn-primary justify-center" disabled={!code.trim()}>
                  Validar código
                </button>

                <div className="flex items-center justify-between text-xs text-slate-500">
                  <button type="button" onClick={onChangeEmail} className="underline hover:text-navy-700">
                    Cambiar correo
                  </button>
                  <button type="button" onClick={onResendCode} className="underline hover:text-navy-700">
                    Reenviar código
                  </button>
                </div>
              </form>
            )}

            {error && (
              <div
                role="alert"
                className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800"
              >
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          <p className="mt-4 text-center text-[12px] font-semibold text-slate-200">
            Desarrollado por PD02 Beyty P. Camargo M.
          </p>
          <p className="mt-0.5 text-center text-[11px] text-slate-400">
            {INSTITUCION.dependencia}
          </p>
        </div>
      </main>
    </div>
  );
}
