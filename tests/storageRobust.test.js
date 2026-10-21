import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Faux IndexedDB : permet de simuler une base bloquée par une autre fenêtre
 * ou qui ne répond jamais, sans navigateur.
 */
function fakeIndexedDb(mode) {
  return {
    open() {
      const req = {};
      setTimeout(() => {
        if (mode === 'blocked') req.onblocked?.({});
        // 'silent' et 'blocked' : onsuccess n'arrive jamais
        if (mode === 'error') {
          req.error = new Error('refus');
          req.onerror?.({});
        }
      }, 0);
      return req;
    },
    deleteDatabase() {
      const req = {};
      setTimeout(() => {
        if (mode !== 'blocked') req.onsuccess?.({});
      }, 0);
      return req;
    },
  };
}

async function freshSession() {
  vi.resetModules();
  return import('../src/session.js');
}

describe('stockage local robuste', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("une base bloquée par une autre fenêtre donne une erreur 'blocked' au lieu d'attendre", async () => {
    vi.stubGlobal('indexedDB', fakeIndexedDb('blocked'));
    const S = await freshSession();
    S.__setTimeouts({ open: 500 });
    const p = S.listDocuments();
    const assertion = expect(p).rejects.toMatchObject({ code: 'blocked' });
    await vi.advanceTimersByTimeAsync(600);
    await assertion;
  });

  it("une base qui ne répond jamais donne une erreur 'timeout'", async () => {
    vi.stubGlobal('indexedDB', fakeIndexedDb('silent'));
    const S = await freshSession();
    S.__setTimeouts({ open: 500 });
    const p = S.saveSession('k', { name: 'a.pdf', numPages: 1 });
    const assertion = expect(p).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(600);
    await assertion;
  });

  it("un refus d'IndexedDB donne 'unavailable'", async () => {
    vi.stubGlobal('indexedDB', fakeIndexedDb('error'));
    const S = await freshSession();
    const p = S.listDocuments();
    const assertion = expect(p).rejects.toMatchObject({ code: 'unavailable' });
    await vi.advanceTimersByTimeAsync(10);
    await assertion;
  });

  it("après un échec, l'appel suivant réessaie (pas de cache d'erreur)", async () => {
    const open = vi.fn(() => ({}));
    vi.stubGlobal('indexedDB', { open, deleteDatabase: () => ({}) });
    const S = await freshSession();
    S.__setTimeouts({ open: 100 });
    const a = expect(S.listDocuments()).rejects.toBeTruthy();
    await vi.advanceTimersByTimeAsync(150);
    await a;
    const b = expect(S.listDocuments()).rejects.toBeTruthy();
    await vi.advanceTimersByTimeAsync(150);
    await b;
    expect(open).toHaveBeenCalledTimes(2);
  });

  it("la réinitialisation supprime la base, ou échoue clairement si bloquée", async () => {
    vi.stubGlobal('indexedDB', fakeIndexedDb('error'));
    const S = await freshSession();
    const ok = S.resetStorage();
    await vi.advanceTimersByTimeAsync(10);
    await expect(ok).resolves.toBe(true);

    vi.stubGlobal('indexedDB', fakeIndexedDb('blocked'));
    const S2 = await freshSession();
    S2.__setTimeouts({ open: 300 });
    const blocked = expect(S2.resetStorage()).rejects.toMatchObject({ code: 'blocked' });
    await vi.advanceTimersByTimeAsync(400);
    await blocked;
  });

  it('le plafond suit le quota du navigateur, sans limite fixe de 10 documents', async () => {
    const S = await freshSession();
    expect(S.MAX_DOCUMENTS).toBeGreaterThanOrEqual(500);
    vi.stubGlobal('navigator', {
      storage: { estimate: async () => ({ usage: 0, quota: 10 * 1024 ** 3 }), persisted: async () => true },
    });
    expect(await S.maxTotalBytes()).toBe(4 * 1024 ** 3);
    vi.stubGlobal('navigator', {
      storage: { estimate: async () => ({ usage: 0, quota: 1 * 1024 ** 3 }), persisted: async () => false },
    });
    expect(await S.maxTotalBytes()).toBe(Math.floor(0.6 * 1024 ** 3));
    const docs = Array.from({ length: 12 }, (_, i) => ({ key: `d${i}`, size: 1024 * 1024, updatedAt: i }));
    const plan = S.chooseEvictions(docs, { incomingKey: 'n', incomingBytes: 1024 * 1024 });
    expect(plan.evict).toEqual([]);
  });

  it('la demande de stockage persistant est faite et tolère un navigateur sans support', async () => {
    const S = await freshSession();
    const persist = vi.fn(async () => true);
    vi.stubGlobal('navigator', { storage: { persisted: async () => false, persist } });
    expect(await S.requestPersistence()).toBe(true);
    expect(persist).toHaveBeenCalled();
    vi.stubGlobal('navigator', {});
    expect(await S.requestPersistence()).toBe(false);
  });
});
