/**
 * Re-audit, the game's side: the age band is known before the device first
 * goes online (store signal or age screen through `Connection.ageGate`), the
 * server keeps the strictest band and the device adopts it, notices are read on
 * connecting, and an account left behind by "Play offline" can still be deleted.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { InProcessServerAdapter } from '../../../server/inProcess';
import { Connection, type GameLink, type KeyValue } from '../../../src/backend/net/connection';
import { bandFromAgeRange } from '../../../src/gameplay/sim/age';
import { applyCommand, createNewVillage, type Command } from '../../../src/gameplay/sim/village';
import type { VillageState } from '../../../src/gameplay/sim/types';
import { world } from '../server/harness';

function memoryKv(): KeyValue {
  const map = new Map<string, string>();
  return { get: (k) => map.get(k) ?? null, set: (k, v) => (v === null ? map.delete(k) : map.set(k, v)) };
}

function village(w: ReturnType<typeof world>): GameLink & { state: VillageState } {
  const state = createNewVillage(w.now(), w.data);
  const g = {
    data: w.data,
    state,
    now: () => w.now(),
    dispatch(cmd: Command) {
      const r = applyCommand(g.state, cmd, g.now(), w.data);
      if (r.ok) g.state = r.state;
      return r;
    },
  };
  return g;
}

describe('age before online play', () => {
  it('asks once before registering; "Not now" keeps the device offline and unregistered', async () => {
    const w = world();
    const game = village(w);
    const port = new InProcessServerAdapter(w.core);
    const conn = new Connection({ game, builtInUrl: 'test.server', kv: memoryKv(), makePort: () => port, log: () => undefined });
    let asked = 0;
    conn.ageGate = async () => (asked++, null);
    await conn.sync();
    expect(conn.status).toBe('offline');
    expect(port.hasIdentity()).toBe(false);
    await conn.sync(); // not asked again until the player asks to connect
    expect(asked).toBe(1);
    conn.askAgeAgain();
    conn.ageGate = async () => (asked++, '13to17');
    await conn.sync();
    expect(asked).toBe(2);
    expect(conn.status).toBe('online');
    expect(game.state.profile).toEqual({ under18: true, ageBand: '13to17' });
    // The server keeps it and applied the private defaults.
    expect(await port.stateAge({ band: null })).toEqual({ band: '13to17' });
    expect((await port.friends()).findable).toBe('friends_of_friends');
  });

  it('a stricter band kept by the server (another device) is adopted; an adult answer never loosens it', async () => {
    const w = world();
    const first = new InProcessServerAdapter(w.core);
    await first.register('Kid Ninja');
    await first.stateAge({ band: 'under13' });
    const game = village(w);
    const conn = new Connection({ game, builtInUrl: 'test.server', kv: memoryKv(), makePort: () => new InProcessServerAdapter(w.core, first.credentials), log: () => undefined });
    conn.ageGate = async () => 'adult';
    await conn.sync();
    expect(conn.status).toBe('online');
    expect(game.state.profile.ageBand).toBe('under13');
    expect(conn.ageBand).toBe('under13');
  });

  it('reads the store range conservatively', () => {
    expect(bandFromAgeRange(0, 12)).toBe('under13');
    expect(bandFromAgeRange(13, 15)).toBe('13to17');
    expect(bandFromAgeRange(16, 17)).toBe('13to17');
    expect(bandFromAgeRange(18, null)).toBe('adult');
    expect(bandFromAgeRange(null, 12)).toBe('under13');
    expect(bandFromAgeRange(null, null)).toBeNull();
  });
});

describe('notices and accounts left behind', () => {
  const store = new Map<string, string>();
  const ls = {
    get length() {
      return store.size;
    },
    key: (i: number) => [...store.keys()][i] ?? null,
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  afterEach(() => {
    store.clear();
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it('reads moderation notices on connecting and marks them read', async () => {
    const w = world({ shared: { account: { supportContact: 'help@example.test' } } });
    const game = village(w);
    const port = new InProcessServerAdapter(w.core);
    const conn = new Connection({ game, builtInUrl: 'test.server', kv: memoryKv(), makePort: () => port, log: () => undefined });
    await conn.sync();
    const other = await w.player('Spammer');
    await port.report({ kind: 'player', playerId: other.id, reason: 'spam' });
    const queue = (await w.core.admin.reportQueue('open')).reports;
    await w.core.admin.resolveReport(queue[0].id, { action: 'dismiss' });
    await conn.refreshNotices();
    expect(conn.notices).toHaveLength(1);
    expect(conn.notices[0]).toMatchObject({ kind: 'report_outcome', read: false });
    await conn.markNoticesRead([conn.notices[0].id]);
    expect((await port.notices()).notices[0].read).toBe(true);
  });

  it('after "Play offline" the stored account is listed and can be deleted without going online', async () => {
    (globalThis as { localStorage?: unknown }).localStorage = ls;
    const w = world();
    const game = village(w);
    const old = new InProcessServerAdapter(w.core);
    const reg = await old.register('Left Behind');
    store.set('tk.net.token:https://old.server', reg.token);
    const kv = memoryKv();
    Connection.choose('off', kv);
    const conn = new Connection({ game, builtInUrl: 'https://old.server', kv, makePort: () => old, log: () => undefined });
    expect(conn.enabled).toBe(false);
    expect(conn.storedAccounts()).toEqual(['https://old.server']);
    const code = await conn.storedDeletionCode('https://old.server');
    expect(code.code).toMatch(/^[2-9A-Z]{5}-[2-9A-Z]{5}$/);
    await conn.deleteStoredAccount('https://old.server');
    expect(await w.repo.getPlayer(reg.playerId)).toBeNull();
    expect(conn.enabled).toBe(false);
  });
});
