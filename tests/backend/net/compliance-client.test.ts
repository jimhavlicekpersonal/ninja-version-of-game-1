/**
 * Compliance switches 2026-11-14, the game's side: under-13 offline stops before registering (nothing sent),
 * the terms of service gate and its server record, no push token under 13, the consumption consent, and when a
 * significant update must be acknowledged again.
 */
import { describe, expect, it } from 'vitest';
import { InProcessServerAdapter } from '../../../server/inProcess';
import { Connection, type GameLink, type KeyValue } from '../../../src/backend/net/connection';
import { significantUpdateBuild, significantUpdateDue } from '../../../src/backend/platform/ageRegulatory';
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

function connect(w: ReturnType<typeof world>, port = new InProcessServerAdapter(w.core)) {
  const game = village(w);
  const conn = new Connection({ game, builtInUrl: 'test.server', kv: memoryKv(), makePort: () => port, log: () => undefined });
  return { game, conn, port };
}

describe('under 13 and the server mode', () => {
  it('offline mode: an under-13 device never registers and says so; limited keeps it online', async () => {
    const off = world({ shared: { policy: { under13Mode: 'offline' } } });
    const a = connect(off);
    a.conn.ageGate = async () => 'under13';
    await a.conn.sync();
    expect(a.conn.under13Mode).toBe('offline');
    expect(a.conn.under13Offline).toBe(true);
    expect(a.conn.status).toBe('offline');
    expect(a.conn.lastError).toMatch(/under 13/);
    expect(a.port.hasIdentity()).toBe(false);

    const lim = world();
    const b = connect(lim);
    b.conn.ageGate = async () => 'under13';
    await b.conn.sync();
    expect(b.conn.under13Mode).toBe('limited');
    expect(b.conn.status).toBe('online');
  });

  it('registers no push token for an under-13 player', async () => {
    const w = world({ shared: { push: { enabled: true, notify: () => undefined } } });
    const { conn } = connect(w);
    conn.ageGate = async () => 'under13';
    await conn.sync();
    let asked = 0;
    await conn.syncPush(['raided'], 0, async () => (asked++, { token: 'x'.repeat(32), platform: 'ios' }));
    expect(asked).toBe(0);
  });
});

describe('terms of service', () => {
  it('no gate: nothing is asked; a gate asks once before registering and the server records the version', async () => {
    const w = world();
    const { conn, port } = connect(w);
    conn.ageGate = async () => 'adult';
    let accepted = false;
    let asked = 0;
    conn.terms = { version: '2027-01-15', accepted: () => accepted, ask: async () => (asked++, false) };
    await conn.sync();
    expect(conn.status).toBe('offline');
    expect(port.hasIdentity()).toBe(false);
    await conn.sync();
    expect(asked).toBe(1);
    conn.askTermsAgain();
    conn.terms = { version: '2027-01-15', accepted: () => accepted, ask: async () => (asked++, (accepted = true)) };
    await conn.sync();
    expect(conn.status).toBe('online');
    expect(await conn.compliance()).toEqual({ termsVersion: '2027-01-15', consumptionConsent: false });
  });

  it('the consumption consent switch is offered only to adults on a server that answers Apple', async () => {
    const w = world();
    const { conn } = connect(w);
    conn.ageGate = async () => 'adult';
    await conn.sync();
    expect(conn.canConsumptionConsent).toBe(false);
  });
});

describe('significant update acknowledgement', () => {
  it('takes the newest required build and asks minors again only when the acknowledged one is older', () => {
    expect(significantUpdateBuild(null, undefined)).toBeNull();
    expect(significantUpdateBuild('1.4.0', '1.3.9')).toBe('1.4.0');
    expect(significantUpdateBuild('bad', '1.5')).toBe('1.5');
    expect(significantUpdateDue('1.4.0', '1.4.2', null, '13to17')).toBe(true);
    expect(significantUpdateDue('1.4.0', '1.4.2', '1.4.0', '13to17')).toBe(false);
    expect(significantUpdateDue('1.4.0', '1.4.2', '1.3.0', 'under13')).toBe(true);
    expect(significantUpdateDue('1.4.0', '1.4.2', null, 'adult')).toBe(false);
    expect(significantUpdateDue('1.4.0', '1.3.0', null, '13to17')).toBe(false);
    expect(significantUpdateDue(null, '1.4.2', null, '13to17')).toBe(false);
  });
});
