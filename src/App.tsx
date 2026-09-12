/**
 * App.tsx
 * Ensambla el asistente de cuatro pasos.
 */

import { AnimatePresence, motion } from 'framer-motion';
import { Home, LogOut, RotateCcw, Settings } from 'lucide-react';
import { useEffect, useState } from 'react';

import { loadAuthorizedRegistrars, saveAuthorizedRegistrars } from './config/appConfig';
import { AuditStep } from './components/AuditStep';
import { Escudo, MarcaDeAgua } from './components/Escudo';
import { HistoryStep } from './components/HistoryStep';
import { LoginScreen } from './components/LoginScreen';
import { RegisterStep } from './components/RegisterStep';
import { SettingsDialog } from './components/SettingsDialog';
import { Stepper } from './components/Stepper';
import { TemplatesMenu } from './components/TemplatesMenu';
import { UploadStep } from './components/UploadStep';
import { INSTITUCION } from './data/brand';
import { useAudit } from './hooks/useAudit';
import { useAuth } from './hooks/useAuth';
import type { WizardStep } from './types';

export default function App() {
  const auth = useAuth();
  const audit = useAudit();
  // Modo incrustado: cuando el Portal abre este sistema dentro de su propia
  // área de contenido, ya pone su membrete, su pie y su marca de agua — así
  // que aquí se ocultan para no duplicarlos. Se activa con ?embedded=1 en la
  // URL, que es como el Portal carga este iframe. Fuera del Portal (uso
  // directo, npm run dev, etc.) la app se ve completa, igual que siempre.
  const embedded = new URLSearchParams(window.location.search).get('embedded') === '1';

  // Incrustada, esta app no pinta su propio fondo: dentro del Portal, el
  // <html>/<body> del iframe siguen teniendo bg-slate-50 (para que la app
  // se vea completa cuando se abre sola), así que aquí se hacen transparentes
  // para que se vea el fondo y la marca de agua del Portal detrás, sin
  // ninguna línea ni tono distinto delatando el borde del iframe.
  useEffect(() => {
    if (!embedded) return;
    const html = document.documentElement;
    const { body } = document;
    const prevHtmlBg = html.style.background;
    const prevBodyBg = body.style.background;
    html.style.background = 'transparent';
    body.style.background = 'transparent';
    return () => {
      html.style.background = prevHtmlBg;
      body.style.background = prevBodyBg;
    };
  }, [embedded]);

  // Volver al Inicio incrustado: el Portal define esta función en su propia
  // página (mismo origen, así que se llama directo); si algún día un módulo
  // quedara en otro origen, el postMessage de abajo es el respaldo.
  const volverAlInicio = () => {
    // Al salir de la auditoría hacia el Portal se cierra la sesión: la
    // próxima vez que se entre a «Registrar» o a la bitácora, se debe pedir
    // el código de nuevo, en vez de seguir con la sesión anterior.
    auth.logout();
    try {
      const portal = window.parent as unknown as { volverAlPortal?: () => void };
      if (window.parent !== window && typeof portal.volverAlPortal === 'function') {
        portal.volverAlPortal();
        return;
      }
      window.parent.postMessage('volverAlInicio', '*');
    } catch {
      // Corriendo fuera del Portal (npm run dev, por ejemplo): no hay a
      // dónde volver, así que no se hace nada.
    }
  };

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [authorizedEmails, setAuthorizedEmails] = useState<string[]>(() => loadAuthorizedRegistrars());
  // "Ver bitácora de registros" desde "Cargar plantilla": pide inicio de
  // sesión igual que "Registrar", pero sin pasar por auditar/registrar un
  // lote. Si ya hay sesión, entra directo; si no, se pide el código y, en
  // cuanto queda autenticado, se salta a la bitácora.
  const [pendingHistory, setPendingHistory] = useState(false);

  const verBitacora = () => {
    if (auth.isAuthenticated) {
      audit.setStep('history');
    } else {
      setPendingHistory(true);
    }
  };

  useEffect(() => {
    if (pendingHistory && auth.isAuthenticated) {
      setPendingHistory(false);
      audit.setStep('history');
    }
  }, [pendingHistory, auth.isAuthenticated, audit]);

  // El engranaje del Portal siempre debe llevar al ingreso administrativo de
  // este módulo — mismo contrato en todos los módulos incrustados. Aquí ese
  // ingreso es el mismo que «Ver bitácora de registros»: pide el correo si
  // hace falta, o entra directo si ya hay sesión.
  useEffect(() => {
    if (!embedded) return;
    const w = window as unknown as { irAIngresoAdmin?: () => void };
    w.irAIngresoAdmin = verBitacora;
    const onMessage = (event: MessageEvent) => {
      if (event.data === 'irAIngresoAdmin') verBitacora();
    };
    window.addEventListener('message', onMessage);
    return () => {
      delete w.irAIngresoAdmin;
      window.removeEventListener('message', onMessage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedded, auth.isAuthenticated]);

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
    <div
      className={
        embedded ? 'isolate flex h-full flex-col overflow-hidden' : 'isolate flex h-[100dvh] flex-col overflow-hidden'
      }
    >
      {/* Incrustada, el fondo es transparente (ver el useEffect de arriba) y
          el Portal ya pone su propia marca de agua detrás — pintar esta
          también se vería como dos escudos superpuestos, ligeramente
          desalineados. Fuera del Portal, sigue siendo la única.
          Nota: `isolate` aquí es necesario para que el -z-10 de MarcaDeAgua
          quede detrás del contenido y no detrás del canvas del navegador
          (un -z-10 colgado directo del body pinta detrás de su propio color
          de fondo, invisible sin importar la opacidad). */}
      {!embedded && <MarcaDeAgua />}

      {/* Controles flotantes: incrustada, la barra de pasos queda oculta (el
          asistente avanza solo), así que este es el único punto fijo para
          reiniciar, volver al Portal, o —en «Cargar plantilla»— bajar una
          plantilla oficial. Siempre arriba a la derecha, en cualquier paso.
          Orden fijo: primero «Descarga de plantillas» (solo existe en el
          paso 1), después los tres íconos SIEMPRE juntos y en el mismo
          orden (Reiniciar, Configuración, Inicio) — nunca intercalados. */}
      {embedded && (
        <div className="fixed right-3 top-3 z-40 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center justify-end gap-2">
          {audit.step === 'upload' && <TemplatesMenu floating />}
          <button
            type="button"
            onClick={audit.reset}
            title="Reiniciar y empezar de nuevo"
            className="inline-flex items-center justify-center rounded-full border border-navy-200 bg-white p-1.5 text-navy-700 shadow-md transition hover:border-navy-300 hover:bg-navy-50 hover:text-navy-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-navy-400"
          >
            <RotateCcw size={15} />
            <span className="sr-only">Reiniciar y empezar de nuevo</span>
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            title="Configuración: reglas de validación de plantillas Xertify"
            className="inline-flex items-center justify-center rounded-full border border-navy-200 bg-white p-1.5 text-navy-700 shadow-md transition hover:border-navy-300 hover:bg-navy-50 hover:text-navy-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-navy-400"
          >
            <Settings size={15} />
            <span className="sr-only">Configuración y administración</span>
          </button>
          <button
            type="button"
            onClick={volverAlInicio}
            title="Volver al Inicio del Portal"
            className="inline-flex items-center justify-center rounded-full border border-navy-200 bg-white p-1.5 text-navy-700 shadow-md transition hover:border-navy-300 hover:bg-navy-50 hover:text-navy-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-navy-400"
          >
            <Home size={15} />
            <span className="sr-only">Volver al Inicio del Portal</span>
          </button>
        </div>
      )}

      {/* Nombre del módulo actual: no es un control, así que va como texto
          simple (sin borde ni fondo de botón), siempre visible mientras se
          está dentro de este módulo, fijo abajo a la derecha. */}
      {embedded && (
        <span className="fixed bottom-3 right-3 z-30 text-xs font-semibold text-navy-700/80">
          Registro de Cursos de Extensión
        </span>
      )}

      {/* Membrete institucional. Va fijo: acompaña toda la auditoría.
          En modo incrustado el Portal ya pone su propio membrete, así que
          aquí solo queda la barra de pasos (Stepper + plantillas). */}
      <div className="z-30 shrink-0 shadow-lg shadow-navy-950/20">
        {!embedded && (
          <>
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
          </>
        )}

        {/* Barra de pasos y plantillas. Incrustada, el Portal ya resuelve la
            navegación por su cuenta (avance automático de useAudit), así que
            aquí se omite para no duplicar controles. */}
        {!embedded && (
          <div className="border-b border-slate-200 bg-white/95 backdrop-blur">
            <div className="mx-auto flex max-w-[1400px] items-center justify-between px-4 py-1.5">
              <Stepper
                current={audit.step}
                reachable={reachable}
                onSelect={audit.setStep}
              />
              {audit.step === 'upload' && <TemplatesMenu />}
            </div>
          </div>
        )}
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
              {audit.step === 'upload' && !pendingHistory && (
                <div className="flex flex-1 items-center justify-center">
                  <UploadStep
                    onFile={audit.loadFile}
                    loading={audit.loading}
                    error={audit.error}
                    embedded={embedded}
                    onVerBitacora={verBitacora}
                  />
                </div>
              )}

              {audit.step === 'upload' && pendingHistory && !auth.isAuthenticated && (
                <div className="flex flex-1 flex-col items-center justify-center gap-3">
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
                    proposito="bitacora"
                  />
                  <button
                    type="button"
                    onClick={() => setPendingHistory(false)}
                    className="text-xs font-semibold text-navy-600 underline-offset-2 hover:underline"
                  >
                    Cancelar y volver a cargar plantilla
                  </button>
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

      {/* Pie institucional: también fijo, cierra el marco de la aplicación.
          En modo incrustado el Portal ya pone su propio pie. */}
      {!embedded && (
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
      )}

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
