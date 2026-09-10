/**
 * sharepointService.test.ts
 * Cubre el caso reportado: dos registros casi simultáneos calculando el
 * mismo folio/registro porque el navegador no sabía cuál era la última fila
 * real del libro. `api/registrar.js` ahora relee esa fila justo antes de
 * escribir y la devuelve; este archivo comprueba que `WebhookAdapter.append`
 * usa esa numeración en vez de la calculada localmente.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DatabaseRow, SharePointConfig } from '../types';
import { WebhookAdapter } from './sharepointService';

function config(): SharePointConfig {
  return {
    mode: 'webhook',
    webhook: { url: 'https://ejemplo.vercel.app/api/registrar' },
  } as SharePointConfig;
}

function filaVacia(): DatabaseRow {
  return { cells: {} } as unknown as DatabaseRow;
}

describe('WebhookAdapter.append', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('usa la numeración real devuelta por el servidor, no la calculada en el navegador', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        rowsSent: 2,
        // El servidor releyó el libro y encontró que ya iba en el registro
        // 62 (no en el 54 que este navegador tenía guardado).
        numeracion: { previoPosicion: { libro: 3, folio: 99, registro: 62 }, previoConsecutivo: 11484 },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new WebhookAdapter(config());
    const outcome = await adapter.append([filaVacia(), filaVacia()]);

    expect(outcome.allocation).toBeDefined();
    expect(outcome.allocation?.start).toEqual({ libro: 3, folio: 99, registro: 63 });
    expect(outcome.allocation?.end).toEqual({ libro: 3, folio: 99, registro: 64 });
    expect(outcome.allocation?.consecutivos).toEqual([11485, 11486]);
  });

  it('sin «numeracion» en la respuesta (p. ej. un flujo real de Power Automate) no rompe nada', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', fetchMock);

    const adapter = new WebhookAdapter(config());
    const outcome = await adapter.append([filaVacia()]);

    expect(outcome.allocation).toBeUndefined();
    expect(outcome.rowsSent).toBe(1);
  });
});
