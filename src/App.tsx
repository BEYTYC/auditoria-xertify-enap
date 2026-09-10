/**
 * App.tsx
 * Ensambla el asistente de cuatro pasos.
 */

import { AnimatePresence, motion } from 'framer-motion';
import { LogOut, Settings } from 'lucide-react';
import { useState } from 'react';

import { loadAuthorizedRegistrars, saveAuthorizedRegistrars } from './config/appConfig';
import { AuditStep } from './components/AuditStep';
import { Escudo, MarcaDeAgua } from './components/Escudo';
import { HistoryStep } from './components/HistoryStep';
import { LoginScreen } from './components/LoginScreen';
import { RegisterStep } from './components/RegisterStep';
import { SettingsDialog } from './components/SettingsDialog';
import { Stepper } from './components/Stepper';
import { UploadStep } from './components/UploadStep';
import { INSTITUCION } from './data/brand';
import { useAudit } from './hooks/useAudit';
import { useAuth } from './hooks/useAuth';
import type { WizardStep } from './types';

export default function App() {
  const auth = useAuth();
  const audit = useAudit();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [authorizedEmails, setAuthorizedEmails] = useState<string[]>(() => loadAuthorizedRegistrars());

  const saveAuthorizedEmails = (emails: string[]) => {
    saveAuthorizedRegistrars(emails);
    setAuthorizedEmails(emails);
  };

  const reachable: WizardStep[] = ['upload', 'history'];
  if (audit.rows.length) reachable.push('audit');
  if (audit.clean && audit.rows.length) reachable.push('register');

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    const info = await audit.inspect();
    setTesting(false);
    setTestResult(
      info
        ? `Conexión correcta. La tabla tiene ${info.columns.length} columnas` +
            (info.lastPosition
              ? `; última posición: libro ${info.lastPosition.libro}, folio ${info.lastPosition.folio}, registro ${info.lastPosition.registro}.`
              : '. No se pudo leer la última posición; confírmela a mano.')
        : // El motivo real —lo que devolvió Graph, o el error de MSAL— queda en
          // `audit.error`; mostrarlo es la diferencia entre adivinar y saber
          // exactamente qué corregir.
          `No se pudo conectar: ${audit.error ?? 'revise los datos y los permisos de la aplicación.'}`,
    );
  };

  // El acceso institucional se retiró de la entrada: la app abre directo en
  // el asistente. El resto del estado de sesión (auth) se conserva porque
  // sigue alimentando el panel de administración y el botón de cerrar sesión.
  return (
    /* Armazón fijo: el membrete y el pie quedan anclados; el desplazamiento
       ocurre solo dentro del área de trabajo. */
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      <MarcaDeAgua />

      {/* Membrete institucional. Va fijo: acompaña toda la auditoría. */}
      <div className="z-30 shrink-0 shadow-lg shadow-navy-950/20">
        <div className="bg-navy-900">
          <div className="mx-auto flex max-w-[1400px] items-center gap-5 px-4 py-4 sm:gap-6 sm:py-5">
            <Escudo height={54} variant="sobre-oscuro" className="shrink-0" />
            <div className="min-w-0 leading-tight">
              <h1 className="truncate text-[13px] font-semibold text-white sm:text-[14px]">
                {INSTITUCION.nombre}
              </h1>
              <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold-400">
                {INSTITUCION.dependencia}
              </p>
              <p className="mt-0.5 text-[10px] text-navy-300 sm:truncate">{INSTITUCION.ciudad}</p>
            </div>

            <div className="ml-auto flex items-center gap-4">
              <div className="hidden border-r border-white/20 pr-4 text-right leading-tight md:block">
                <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-navy-300">
                  Sistema
                </p>
                <p className="text-[13px] font-semibold text-white">
                  Auditoría de Plantillas Xertify y
                  <br />
                  Registro de Cursos de Extensión
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setSettingsOpen(true)}
                    title="Administración"
                    className="rounded-lg p-2 text-navy-200 transition hover:bg-white/15 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
                  >
                    <Settings size={17} />
                    <span className="sr-only">Administración y ajustes de conexión</span>
                  </button>
                  <button
                    type="button"
                    onClick={auth.logout}
                    title={`Cerrar sesión (${auth.session?.email ?? ''})`}
                    className="rounded-lg p-2 text-navy-200 transition hover:bg-white/15 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
                  >
                    <LogOut size={17} />
                    <span className="sr-only">Cerrar sesión</span>
                  </button>
                </div>
                {audit.admin && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-gold-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gold-300"
                    title={`Administración abierta como ${audit.admin}`}
                  >
                    Admin
                  </span>
                )}
                {auth.session?.email && (
                  <p
                    className="hidden max-w-[180px] truncate text-[10px] text-navy-300 sm:block"
                    title={auth.session.email}
                  >
                    {auth.session.email}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Filete institucional */}
        <div className="h-1 bg-gold-500" />

        <div className="border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="mx-auto max-w-[1400px] px-4 py-1.5">
            <Stepper
              current={audit.step}
              reachable={reachable}
              onSelect={audit.setStep}
            />
          </div>
        </div>
      </div>

      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto flex min-h-full w-full max-w-[1400px] flex-col px-4 py-3 sm:py-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={audit.step}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="flex flex-1 flex-col"
            >
              {audit.step === 'upload' && (
                <div className="flex flex-1 items-center justify-center">
                  <UploadStep
                    onFile={audit.loadFile}
                    loading={audit.loading}
                    error={audit.error}
                  />
                </div>
              )}

              {audit.step === 'audit' && (
                <div className="flex flex-1 items-center justify-center">
                  <AuditStep
                    activeFields={audit.activeFields}
                    metrics={audit.metrics}
                    clean={audit.clean}
                    metadata={audit.metadata}
                    onMetadata={audit.setMetadata}
                    onContinue={() => audit.setStep('register')}
                    onDownloadAnnotated={audit.downloadAnnotated}
                    onReload={audit.reset}
                    mappings={audit.parsed?.map.mappings ?? []}
                    missingRequired={audit.parsed?.map.missingRequired ?? []}
                    onRemap={audit.remap}
                    isAdmin={Boolean(auth.session?.isTestUser)}
                  />
                </div>
              )}

              {audit.step === 'register' && (
                <div className="flex flex-1 items-center justify-center">
                  {auth.isAuthenticated ? (
                    <RegisterStep
                      preview={audit.preview}
                      metadata={audit.metadata}
                      config={audit.config}
                      tableInfo={audit.tableInfo}
                      loading={audit.loading}
                      error={audit.error}
                      result={audit.result}
                      clean={audit.clean}
                      onInspect={audit.inspect}
                      onRegister={audit.register}
                      duplicado={audit.duplicado}
                      onVerBitacora={() => audit.setStep('history')}
                      onDownloadCorrected={audit.downloadCorrected}
                      onReset={audit.reset}
                    />
                  ) : (
                    // Cargar y auditar no piden nada; solo al llegar aquí, a
                    // escribir de verdad en el libro, se exige demostrar con
                    // un código que el correo es uno de los autorizados.
                    <LoginScreen
                      stage={auth.stage}
                      pendingEmail={auth.pendingEmail}
                      demoCode={auth.demoCode}
                      sendingCode={auth.sendingCode}
                      error={auth.error}
                      onRequestCode={auth.requestCode}
                      onVerifyCode={auth.verifyCode}
                      onResendCode={auth.resendCode}
                      onChangeEmail={auth.changeEmail}
                    />
                  )}
                </div>
              )}

              {audit.step === 'history' && (
                <HistoryStep
                  log={
                    // La Oficina de Estadística (modo admin) ve todo, para
                    // supervisar. Cualquier otra persona ve solo los lotes que
                    // registró ella misma: la bitácora vive en el navegador,
                    // así que si varias personas comparten el mismo equipo,
                    // antes se veían los registros de todas entre sí.
                    audit.admin
                      ? audit.log
                      : audit.log.filter(
                          (entry) =>
                            auth.session?.email &&
                            entry.correoResponsable?.trim().toLowerCase() ===
                              auth.session.email.trim().toLowerCase(),
                        )
                  }
                  admin={audit.admin}
                  adminMensaje={audit.adminMensaje}
                  loading={audit.loading}
                  onCerrarAdmin={audit.cerrarAdmin}
                  onBorrarEntrada={audit.borrarDeBitacora}
                  onVaciar={audit.vaciarBitacora}
                  onAnular={audit.anularRegistro}
                  onValidarUltimo={audit.validarUltimo}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Pie institucional: también fijo, cierra el marco de la aplicación. */}
      <footer className="z-30 shrink-0 bg-navy-900 text-navy-200 shadow-[0_-6px_16px_rgba(4,20,46,0.25)]">
        <div className="h-1 bg-gold-500" />
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-2.5 sm:py-3">
          {/* Mismo escudo del membrete: fondo claro y halo blanco. */}
          <Escudo height={42} variant="sobre-oscuro" className="shrink-0" />
          <div className="ml-3 min-w-0 leading-tight sm:ml-4">
            <p className="truncate text-[12px] text-white">{INSTITUCION.dependencia}</p>
            <p className="truncate text-[13px] font-semibold text-gold-400">
              {INSTITUCION.sistema}
            </p>
          </div>

          <div className="ml-auto shrink-0 text-right leading-tight">
            <p className="text-[12px] font-semibold text-slate-200">
              Desarrollado por PD02 Beyty P. Camargo M.
            </p>
            <p className="mt-0 text-[11px] text-navy-300">Jefe de Estadística ENAP</p>
          </div>
        </div>
      </footer>

      <SettingsDialog
        open={settingsOpen}
        config={audit.config}
        onClose={() => setSettingsOpen(false)}
        onSave={audit.updateConfig}
        onTest={testConnection}
        testing={testing}
        testResult={testResult}
        admin={audit.admin}
        adminMensaje={audit.adminMensaje}
        onAbrirAdmin={audit.abrirAdmin}
        onCerrarAdmin={audit.cerrarAdmin}
        authorizedEmails={authorizedEmails}
        onSaveAuthorizedEmails={saveAuthorizedEmails}
      />
    </div>
  );
}
