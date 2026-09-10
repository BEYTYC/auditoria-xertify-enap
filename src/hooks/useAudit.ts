/**
 * useAudit.ts
 * Estado central del asistente: carga, auditoría, registro e historial.
 */

import { useCallback, useMemo, useState } from 'react';

import {
  effectiveMode,
  loadConfig,
  loadRememberedResponsable,
  saveConfig,
  saveRememberedResponsable,
} from '../config/appConfig';
import {
  computeMetrics,
  isBatchClean,
  removeRow,
  revalidate,
  type BatchMetrics,
} from '../services/correctorService';
import {
  annotatedFileName,
  blobToBase64,
  correctedFileName,
  downloadBlob,
  fileDateFromIso,
  readTemplate,
  remapColumn,
  type ParsedTemplate,
} from '../services/excelService';
import { annotateTemplate, patchTemplate } from '../services/xlsxPatchService';
import {
  DEFAULT_LAST_CONSECUTIVO,
  DEFAULT_LAST_POSITION,
} from '../services/numberingService';
import {
  duplicateMessage,
  findDuplicateBatch,
  type DuplicateFinding,
} from '../services/duplicateService';
import { closeAdmin, isAdminAccount, openAdmin, readAdmin } from '../services/adminService';
import { suggestOffice } from '../services/officeService';
import {
  annulEntry,
  applyLedger,
  attachTemplate,
  clearLog,
  inspectDestination,
  previewRegistration,
  readLog,
  registerBatch,
  removeLogEntry,
} from '../services/registryService';
import { clearMockRows } from '../services/sharepointService';
import type { TableInfo } from '../services/sharepointService';
import type {
  BatchMetadata,
  CanonicalField,
  ColumnMapping,
  LedgerPosition,
  LogEntry,
  RegistrationResult,
  SharePointConfig,
  StudentRow,
  WizardStep,
} from '../types';

/**
 * Metadatos en blanco para un lote nuevo, salvo la facultad, el responsable y
 * su correo: esos se recuerdan de la última vez (ver `appConfig.ts`), porque
 * casi siempre los registra la misma persona.
 */
function emptyMetadata(): BatchMetadata {
  const recordado = loadRememberedResponsable();
  return {
    curso: '',
    oficina: recordado.oficina,
    responsable: recordado.responsable,
    correoResponsable: recordado.correoResponsable,
    fechaInicio: '',
    fechaRegistro: '',
    intensidad: '',
    archivoOriginal: '',
  };
}

/**
 * De las columnas mapeadas a `fechainicio`, cuáles traían el encabezado
 * literalmente en inglés («startdate» / «start date») en la plantilla
 * original. Esas son las únicas a las que se les exige el formato de fecha
 * en inglés; el encabezado en español, «fechainicio», sigue validándose
 * igual que siempre.
 */
function computeEnglishDateFields(mappings: ColumnMapping[]): Set<CanonicalField> {
  const fields = new Set<CanonicalField>();
  for (const mapping of mappings) {
    if (mapping.field !== 'fechainicio') continue;
    const header = mapping.header.trim().toLowerCase();
    if (header === 'startdate' || header === 'start date') fields.add('fechainicio');
  }
  return fields;
}

export interface AuditState {
  step: WizardStep;
  parsed: ParsedTemplate | null;
  rows: StudentRow[];
  metrics: BatchMetrics;
  metadata: BatchMetadata;
  config: SharePointConfig;
  tableInfo: TableInfo | null;
  lastPosition: LedgerPosition;
  lastConsecutivo: number;
  loading: string | null;
  error: string | null;
  result: RegistrationResult | null;
  log: LogEntry[];
}

export function useAudit() {
  const [step, setStep] = useState<WizardStep>('upload');
  const [parsed, setParsed] = useState<ParsedTemplate | null>(null);
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [metadata, setMetadataState] = useState<BatchMetadata>(emptyMetadata);

  // Cada vez que cambian facultad, responsable o correo, quedan recordados
  // para el próximo lote (y la próxima vez que se abra la app).
  const setMetadata = useCallback((next: BatchMetadata) => {
    setMetadataState(next);
    saveRememberedResponsable({
      oficina: next.oficina,
      responsable: next.responsable,
      correoResponsable: next.correoResponsable,
    });
  }, []);
  const [config, setConfig] = useState<SharePointConfig>(() => loadConfig());
  const [tableInfo, setTableInfo] = useState<TableInfo | null>(null);
  const [lastPosition, setLastPosition] = useState<LedgerPosition>(DEFAULT_LAST_POSITION);
  const [lastConsecutivo, setLastConsecutivo] = useState<number>(DEFAULT_LAST_CONSECUTIVO);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RegistrationResult | null>(null);
  const [log, setLog] = useState<LogEntry[]>(() => readLog());
  const [admin, setAdmin] = useState<string | null>(() => readAdmin());
  const [adminMensaje, setAdminMensaje] = useState<string | null>(null);

  const activeFields = useMemo(
    () => parsed?.activeFields ?? new Set<CanonicalField>(),
    [parsed],
  );

  // Columnas cuyo encabezado original en la plantilla vino en inglés
  // («startdate» / «start date»): a esas se les exige el formato de fecha en
  // inglés en vez del español, sin tocar el comportamiento cuando el
  // encabezado es el de siempre, «fechainicio».
  const englishDateFields = useMemo(
    () => computeEnglishDateFields(parsed?.map.mappings ?? []),
    [parsed],
  );

  const metrics = useMemo(() => computeMetrics(rows), [rows]);
  const clean = isBatchClean(metrics);

  /* -------------------------------------------------------------- */
  /* Carga                                                           */
  /* -------------------------------------------------------------- */

  const loadFile = useCallback(async (file: File) => {
    setLoading('Leyendo la plantilla…');
    setError(null);
    setResult(null);

    try {
      const template = await readTemplate(file);
      const validated = revalidate(
        template.rows,
        template.activeFields,
        computeEnglishDateFields(template.map.mappings),
      );

      // La oficina se propone con el curso más frecuente del lote.
      const titles = validated
        .map((row) => row.cells.titulo?.value?.trim() ?? '')
        .filter(Boolean);
      const dominant = mostFrequent(titles);
      const suggestion = dominant ? suggestOffice(dominant) : null;
      const first = validated[0];

      const recordado = loadRememberedResponsable();
      setParsed({ ...template, rows: validated });
      setRows(validated);
      setMetadata({
        curso: dominant ?? '',
        oficina: suggestion?.oficina ?? recordado.oficina,
        responsable: recordado.responsable,
        correoResponsable: recordado.correoResponsable,
        fechaInicio: first?.cells.fechainicio?.value ?? '',
        fechaRegistro: first?.cells.fechaemite?.value ?? '',
        intensidad: first?.cells.intensidad?.value ?? '',
        archivoOriginal: file.name,
      });
      setStep('audit');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(null);
    }
  }, []);

  const reset = useCallback(() => {
    setParsed(null);
    setRows([]);
    setMetadataState(emptyMetadata());
    setResult(null);
    setError(null);
    setStep('upload');
  }, []);

  /* -------------------------------------------------------------- */
  /* Auditoría                                                       */
  /* -------------------------------------------------------------- */

  const dropRow = useCallback(
    (rowId: string) => {
      setRows((current) => removeRow(current, rowId, activeFields, englishDateFields));
    },
    [activeFields, englishDateFields],
  );

  const remap = useCallback(
    (columnIndex: number, field: CanonicalField | null) => {
      if (!parsed) return;
      const next = remapColumn(parsed, columnIndex, field);
      const validated = revalidate(
        next.rows,
        next.activeFields,
        computeEnglishDateFields(next.map.mappings),
      );
      setParsed({ ...next, rows: validated });
      setRows(validated);
    },
    [parsed],
  );

  /* -------------------------------------------------------------- */
  /* Destino                                                         */
  /* -------------------------------------------------------------- */

  const inspect = useCallback(async () => {
    setLoading('Consultando la Base de Datos…');
    setError(null);
    try {
      const info = await inspectDestination(config);
      setTableInfo(info);
      if (info.lastPosition) setLastPosition(info.lastPosition);
      if (info.lastConsecutivo !== null) setLastConsecutivo(info.lastConsecutivo);
      return info;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return null;
    } finally {
      setLoading(null);
    }
  }, [config]);

  const updateConfig = useCallback((next: SharePointConfig) => {
    setConfig(next);
    saveConfig(next);
    setTableInfo(null);
  }, []);

  /* -------------------------------------------------------------- */
  /* Registro                                                        */
  /* -------------------------------------------------------------- */

  const preview = useMemo(() => {
    if (!rows.length) return null;
    return previewRegistration({
      rows,
      metadata,
      config,
      lastPosition,
      lastConsecutivo,
    });
  }, [rows, metadata, config, lastPosition, lastConsecutivo]);

  /**
   * Un lote que ya se asentó no se vuelve a asentar: quedaría dos veces en el
   * libro y eso no se deshace desde aquí. Se compara contra la bitácora de
   * este equipo y contra las últimas filas de la Base de Datos.
   */
  const duplicado: DuplicateFinding | null = useMemo(() => {
    if (!rows.length || result) return null;
    return findDuplicateBatch(rows, metadata.curso, log, tableInfo?.recentKeys ?? []);
  }, [rows, metadata.curso, log, tableInfo, result]);

  const register = useCallback(async () => {
    if (!clean) {
      setError('El lote todavía tiene errores. Corríjalos antes de registrar.');
      return null;
    }
    if (!metadata.oficina) {
      setError('Confirme la oficina responsable antes de registrar.');
      return null;
    }
    if (!metadata.responsable.trim()) {
      setError('Indique quién valida el lote.');
      return null;
    }

    setError(null);

    // Antes de registrar se vuelve a consultar la Base de Datos: si alguien
    // agregó una columna (p. ej. DIRECTOR FIRMANTE) o cambió algo mientras
    // esta pantalla estaba abierta, no se registra con datos viejos. Esto
    // también refresca las últimas claves de la tabla, así que el chequeo de
    // duplicados de abajo no se queda con información vieja o vacía.
    setLoading('Consultando la Base de Datos…');
    let info = tableInfo;
    try {
      info = await inspectDestination(config);
      setTableInfo(info);
      if (info.lastPosition) setLastPosition(info.lastPosition);
      if (info.lastConsecutivo !== null) setLastConsecutivo(info.lastConsecutivo);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setLoading(null);
      return null;
    }

    // Se revisa contra las claves recién leídas, no contra el `duplicado`
    // calculado antes de esta consulta: si el registro se dispara solo al
    // entrar al paso, ese valor puede estar vacío o desactualizado.
    const duplicadoFresco = findDuplicateBatch(rows, metadata.curso, log, info.recentKeys ?? []);
    if (duplicadoFresco) {
      setError(duplicateMessage(duplicadoFresco));
      setLoading(null);
      return null;
    }

    setLoading('Registrando el lote…');

    try {
      const outcome = await registerBatch({
        rows,
        metadata,
        config,
        lastPosition: info?.lastPosition ?? lastPosition,
        lastConsecutivo: info?.lastConsecutivo ?? lastConsecutivo,
        // Con esto el correo de confirmación puede llevar adjunta la misma
        // plantilla ya con el registro asentado (ver registryService.ts).
        template: parsed
          ? {
              buffer: parsed.buffer,
              sheetName: parsed.sheetName,
              firstDataRow: parsed.firstDataRow,
              mappings: parsed.map.mappings,
              fileName: parsed.fileName,
            }
          : undefined,
      });
      setResult(outcome);
      setLog(readLog());

      // El archivo corregido queda guardado con el lote: así se puede volver a
      // descargar desde la bitácora sin auditar de nuevo.
      if (outcome.outcome === 'success' && parsed) {
        try {
          const blob = patchTemplate(
            parsed.buffer,
            applyLedger(rows, outcome.receipt.allocation),
            {
              sheetName: parsed.sheetName,
              firstDataRow: parsed.firstDataRow,
              mappings: parsed.map.mappings,
            },
          );
          const nombre = correctedFileName(
            outcome.receipt.curso,
            fileDateFromIso(outcome.receipt.timestampIso),
            parsed.fileName,
          );
          setLog(attachTemplate(outcome.receipt.idRegistro, nombre, await blobToBase64(blob)));
        } catch {
          // Sin espacio o sin archivo original: la bitácora queda sin la copia.
        }
      }

      if (outcome.outcome === 'success') {
        setLastPosition(outcome.receipt.allocation.end);
        setLastConsecutivo(
          outcome.receipt.allocation.consecutivos[
            outcome.receipt.allocation.consecutivos.length - 1
          ] ?? lastConsecutivo,
        );
      }

      setStep('register');
      return outcome;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return null;
    } finally {
      setLoading(null);
    }
  }, [clean, rows, metadata, config, lastPosition, lastConsecutivo, tableInfo, log, parsed]);

  /* -------------------------------------------------------------- */
  /* Administración                                                  */
  /* -------------------------------------------------------------- */

  const abrirAdmin = useCallback((cuenta: string, clave: string) => {
    const abierto = openAdmin(cuenta, clave);
    setAdmin(abierto);
    setAdminMensaje(
      abierto
        ? null
        : isAdminAccount(cuenta)
          ? 'La contraseña no es correcta.'
          : 'Esa cuenta no es de la Oficina de Estadística.',
    );
    return abierto !== null;
  }, []);

  const cerrarAdmin = useCallback(() => {
    closeAdmin();
    setAdmin(null);
    setAdminMensaje(null);
  }, []);

  /** Quita un renglón de la bitácora de este equipo. El libro no se toca. */
  const borrarDeBitacora = useCallback((idRegistro: string) => {
    setLog(removeLogEntry(idRegistro));
    setAdminMensaje('Renglón retirado de la bitácora. El libro no se modificó.');
  }, []);

  /**
   * Vacía la bitácora de este equipo. En modo local (mock) también borra el
   * libro de prueba que se acumula en el navegador: ahí no hay nada real que
   * proteger, y dejarlo lleno es lo que hacía que un lote de prueba ya
   * registrado siguiera bloqueado aunque la bitácora se viera vacía.
   */
  const vaciarBitacora = useCallback(() => {
    clearLog();
    setLog([]);
    if (effectiveMode(config) === 'mock') {
      clearMockRows();
      // La tabla de destino ya leída queda desactualizada: se descarta para
      // que la próxima consulta —al entrar al registro— vea el libro vacío.
      setTableInfo(null);
      setAdminMensaje(
        'Bitácora vaciada, junto con el libro de prueba del registro local. El libro real no se modificó.',
      );
    } else {
      setAdminMensaje('Bitácora vaciada. El libro no se modificó.');
    }
  }, [config]);

  /** Anula el registro: borra del libro las filas de ese lote. */
  const anularRegistro = useCallback(
    async (entry: LogEntry) => {
      setLoading('Anulando el registro…');
      setAdminMensaje(null);
      try {
        const { borradas, log: siguiente } = await annulEntry(config, entry);
        setLog(siguiente);
        setAdminMensaje(
          `Se anularon ${borradas} filas del libro para ${entry.idRegistro}. ` +
            'La numeración de los registros siguientes no cambia.',
        );
        return borradas;
      } catch (caught) {
        setAdminMensaje(caught instanceof Error ? caught.message : String(caught));
        return 0;
      } finally {
        setLoading(null);
      }
    },
    [config],
  );

  /**
   * Lee la última posición del libro directamente de la Base de Datos. No
   * depende de que la bitácora de este equipo tenga un registro con qué
   * compararla —si lo tiene, se usa para confirmar que coincide—, porque
   * exigirlo dejaba el botón sin uso justo cuando más hacía falta: cuando la
   * bitácora local no refleja lo que ya hay en la base.
   */
  const validarUltimo = useCallback(async () => {
    setLoading('Validando contra la Base de Datos…');
    setAdminMensaje(null);
    try {
      const info = await inspectDestination(config);
      const posicion = info.lastPosition;
      if (!posicion) {
        setAdminMensaje('La Base de Datos no tiene ninguna fila registrada todavía.');
        return;
      }

      const ultimo = log.find((entry) => entry.outcome === 'success' && !entry.anulado);
      if (!ultimo) {
        setAdminMensaje(
          `El libro cierra en libro ${posicion.libro}, folio ${posicion.folio}, ` +
            `registro ${posicion.registro}. La bitácora de este equipo no tiene ningún registro ` +
            'con el que compararlo.',
        );
        return;
      }

      const coincide =
        posicion.libro === ultimo.libro &&
        posicion.folio === ultimo.folioFinal &&
        posicion.registro === ultimo.registroFinal;

      setAdminMensaje(
        coincide
          ? `Correcto: el libro cierra en libro ${posicion.libro}, folio ${posicion.folio}, ` +
              `registro ${posicion.registro}, que es justo donde termina ${ultimo.idRegistro}.`
          : `No coincide: el libro cierra en libro ${posicion.libro}, folio ${posicion.folio}, ` +
              `registro ${posicion.registro}, y ${ultimo.idRegistro} termina en libro ` +
              `${ultimo.libro}, folio ${ultimo.folioFinal}, registro ${ultimo.registroFinal}. ` +
              'Puede que alguien más haya registrado después, o que el registro no llegara.',
      );
    } catch (caught) {
      setAdminMensaje(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(null);
    }
  }, [config, log]);

  /* -------------------------------------------------------------- */
  /* Descargas                                                       */
  /* -------------------------------------------------------------- */

  /**
   * Arma el mismo archivo que subió la facultad, con las celdas ya corregidas.
   * No se reconstruye el libro: se parchea el .xlsx original, para que las
   * listas de validación, los formatos y la hoja `Parameters` lleguen intactos
   * a Xertify. La numeración es la que quedó asentada.
   */
  const buildCorrected = useCallback((): Blob | null => {
    if (!parsed) return null;
    const asentado = result?.receipt ?? preview?.receipt ?? null;
    return patchTemplate(
      parsed.buffer,
      applyLedger(rows, asentado ? asentado.allocation : null),
      {
        sheetName: parsed.sheetName,
        firstDataRow: parsed.firstDataRow,
        mappings: parsed.map.mappings,
      },
    );
  }, [parsed, rows, preview, result]);

  // El id de registro ya no forma parte del nombre del archivo, pero se deja
  // en la firma porque `RegisterStep` lo pasa desde el comprobante.
  const downloadCorrected = useCallback(
    (_idRegistro: string) => {
      void _idRegistro;
      const blob = buildCorrected();
      if (!blob || !parsed) return;
      const asentado = result?.receipt ?? preview?.receipt ?? null;
      const nombre = correctedFileName(
        asentado?.curso ?? metadata.curso,
        asentado ? fileDateFromIso(asentado.timestampIso) : '',
        parsed.fileName,
      );
      downloadBlob(blob, nombre);
    },
    [buildCorrected, parsed, result, preview, metadata.curso],
  );

  /**
   * La plantilla no se corrige dentro de la aplicación: se descarga tal como
   * llegó —con el mismo formato de siempre—, pero con cada celda que tiene
   * una novedad pendiente resaltada en amarillo y con un comentario de Excel
   * explicando qué corregir. El responsable arregla ahí y vuelve a cargar; lo
   * que ya quedó bien deja de resaltarse en la siguiente descarga.
   */
  const downloadAnnotated = useCallback(() => {
    if (!parsed) return;
    const blob = annotateTemplate(parsed.buffer, rows, {
      sheetName: parsed.sheetName,
      mappings: parsed.map.mappings,
    });
    downloadBlob(blob, annotatedFileName(parsed.fileName));
  }, [parsed, rows]);

  return {
    step,
    setStep,
    parsed,
    rows,
    metrics,
    clean,
    metadata,
    setMetadata,
    config,
    updateConfig,
    tableInfo,
    inspect,
    duplicado,
    admin,
    adminMensaje,
    abrirAdmin,
    cerrarAdmin,
    borrarDeBitacora,
    vaciarBitacora,
    anularRegistro,
    validarUltimo,
    lastPosition,
    setLastPosition,
    lastConsecutivo,
    setLastConsecutivo,
    loading,
    error,
    setError,
    result,
    log,
    activeFields,
    preview,
    loadFile,
    reset,
    dropRow,
    remap,
    register,
    downloadCorrected,
    downloadAnnotated,
  };
}

/* ------------------------------------------------------------------ */
/* Auxiliares                                                          */
/* ------------------------------------------------------------------ */

function mostFrequent(values: string[]): string | null {
  if (!values.length) return null;
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}
