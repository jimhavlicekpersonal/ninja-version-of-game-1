/**
 * The game's side of a server-owned village (roadmap step 21): actions are
 * queued with their time and hash, survive a restart and a lost connection,
 * and the server's economy wins when the two disagree.
 */
import { describe, expect, it } from 'vitest';
import { InProcessServerAdapter } from '../../../server/inProcess';
import { Analytics, MemoryEventStore } from '../../../src/backend/analytics/events';
import { Connection, type KeyValue } from '../../../src/backend/net/connection';
import { ServerError } from '../../../src/backend/net/ports';
import { MemorySaveStore } from '../../../src/backend/persist/saveStore';
import { GameController } from '../../../src/gameplay/control/controller';
import { canPlace } from '../../../src/gameplay/sim/grid';
import { deserialize, SAVE_VERSION } from '../../../src/gameplay/sim/save';
import { economyHash } from '../../../src/gameplay/sim/serverEconomy';
import { HOUR, world } from '../server/harness';
import { combineVerifiers, JwtVerifier } from '../../../server/identity/verify';
import { generateKeyPairSync, sign as cryptoSign } from 'node:crypto';

function memoryKv(): KeyValue & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, get: (k) => map.get(k) ?? null, set: (k, v) => (v === null ? map.delete(k) : map.set(k, v)) };
}

async function setup(w = world(), kv = memoryKv(), store = new MemorySaveStore()) {
  const clock = { now: () => w.now() };
  const { controller } = await GameController.start({ clock, store, data: w.data, analytics: new Analytics(new MemoryEventStore(), clock, 'test'), botRaids: false });
  const port = new InProcessServerAdapter(w.core);
  const conn = new Connection({ game: controller, builtInUrl: 'test.server', kv, makePort: () => port, log: () => undefined });
  await conn.sync();
  return { w, kv, store, controller, port, conn };
}

/** Place a collector of `res` the Keep allows on the first free spot (through the controller, like a tap). */
function placeCollector(c: GameController, res: 'acorns' | 'dew' = 'acorns') {
  const limits = c.data.hall.levels[0].limits;
  const type = Object.keys(limits).find((k) => c.data.buildings[k]?.produces === res && limits[k].count > 0)!;
  for (let y = 0; y < c.data.economy.mapSize; y++) {
    for (let x = 0; x < c.data.economy.mapSize; x++) {
      if (canPlace(c.state, c.data, type, x, y).ok) return c.dispatch({ type: 'place', buildingType: type, x, y });
    }
  }
  throw new Error('no room');
}

const serverHash = async (s: Awaited<ReturnType<typeof setup>>) => (await s.port.getVillage())!.stateHash;

describe('rolling deploy (2026-11-14): a server village saved by a newer build', () => {
  it('pauses online play with the "Update Kagemura" status instead of failing and retrying', async () => {
    const s = await setup();
    await s.conn.village!.enable();
    // A newer game on another device wrote the village (a save version this build does not know).
    const row = (await s.w.repo.getVillage(s.conn.player!.id))!;
    await s.w.repo.saveVillage({ ...row, file: { ...(row.file as object), version: SAVE_VERSION + 1 }, revision: row.revision + 1 }, row.revision, [], []);
    // This build meets it on a new device (cloud save): it cannot read the village.
    const clock = { now: () => s.w.now() };
    const store = new MemorySaveStore();
    const { controller } = await GameController.start({ clock, store, data: s.w.data, analytics: new Analytics(new MemoryEventStore(), clock, 'test'), botRaids: false });
    const port = new InProcessServerAdapter(s.w.core, s.port.credentials);
    const conn = new Connection({ game: controller, builtInUrl: 'test.server', kv: memoryKv(), makePort: () => port, log: () => undefined });
    await conn.sync();
    expect(conn.status).toBe('incompatible');
    expect(conn.lastError).toMatch(/new version of Kagemura/);
    // It does not keep retrying (sync is a no-op while incompatible), and nothing was adopted.
    await conn.sync();
    expect(conn.status).toBe('incompatible');
    expect(await store.listBackups()).toHaveLength(0);
  });
});

describe('server-owned village: the game side', () => {
  it('moves to a village on the server, keeping the old one as a backup', async () => {
    const s = await setup();
    expect(s.conn.canKeepVillage).toBe(true);
    expect(s.conn.serverVillage).toBe(false);
    placeCollector(s.controller); // progress on the device village
    expect(s.conn.village!.pending).toBe(0); // not kept on the server yet: nothing queued
    await s.conn.village!.enable();
    expect(s.conn.serverVillage).toBe(true);
    expect(economyHash(s.controller.state)).toBe(await serverHash(s));
    expect(await s.store.listBackups()).toHaveLength(1);
  });

  it('queues player actions with their hash, sends them, and leaves server results out', async () => {
    const s = await setup();
    await s.conn.village!.enable();
    expect(placeCollector(s.controller, 'acorns').ok).toBe(true);
    expect(placeCollector(s.controller, 'dew').ok).toBe(true);
    s.controller.dispatch({ type: 'syncRank', trophies: 500 }); // a server result: never sent back
    expect(s.conn.village!.pending).toBe(2);
    s.w.advance(6 * HOUR);
    for (const b of s.controller.state.buildings.filter((x) => s.controller.data.buildings[x.type].produces)) s.controller.dispatch({ type: 'collect', id: b.id });
    expect(s.conn.village!.pending).toBe(4);
    await s.conn.village!.flush();
    expect(s.conn.village!.pending).toBe(0);
    expect(s.conn.village!.corrections).toBe(0);
    expect(economyHash(s.controller.state)).toBe(await serverHash(s));
    // Every attack report waits for the actions before it (the troops must be on the server first).
    placeCollector(s.controller, 'acorns');
    await s.conn.flush();
    expect(s.conn.village!.pending).toBe(0);
  });

  it('keeps actions taken offline until the server has them, across a restart', async () => {
    const s = await setup();
    await s.conn.village!.enable();
    const send = s.port.sendCommands.bind(s.port);
    s.port.sendCommands = async () => {
      throw new ServerError(0, 'network', 'offline');
    };
    placeCollector(s.controller);
    await expect(s.conn.village!.flush()).rejects.toThrow('offline');
    expect(s.conn.village!.pending).toBe(1);
    // The game restarts: the queue is still there and goes once the server answers.
    s.port.sendCommands = send;
    const again = new Connection({ game: s.controller, builtInUrl: 'test.server', kv: s.kv, makePort: () => s.port, log: () => undefined });
    expect(again.serverVillage).toBe(true);
    expect(again.village!.pending).toBe(1);
    await again.sync();
    expect(again.village!.pending).toBe(0);
    expect(economyHash(s.controller.state)).toBe(await serverHash(s));
  });

  it('takes the server economy when the two disagree, and replays what was queued after', async () => {
    const s = await setup();
    await s.conn.village!.enable();
    // An edited save: far more coins than the server knows of.
    s.controller.state.resources.acorns += 400;
    placeCollector(s.controller);
    const afterPlace = s.controller.state.resources.acorns;
    await s.conn.village!.flush();
    expect(s.conn.village!.corrections).toBe(1);
    // The 400 extra coins are gone; the placement (which the server applied too) still cost what it cost.
    expect(s.controller.state.resources.acorns).toBe(afterPlace - 400);
    expect(economyHash(s.controller.state)).toBe(await serverHash(s));
  });

  it('on connecting, takes the server village when nothing is waiting and the device differs', async () => {
    const s = await setup();
    await s.conn.village!.enable();
    placeCollector(s.controller);
    await s.conn.village!.flush();
    // The device copy goes back to an older state (say, restored from a backup).
    const server = deserialize((await s.port.getVillage())!.file, s.w.data);
    s.controller.state.buildings = s.controller.state.buildings.filter((b) => !s.controller.data.buildings[b.type].produces);
    expect(economyHash(s.controller.state)).not.toBe(economyHash(server));
    const next = new Connection({ game: s.controller, builtInUrl: 'test.server', kv: s.kv, makePort: () => s.port, log: () => undefined });
    await next.sync();
    expect(economyHash(s.controller.state)).toBe(economyHash(server));
  });

  it('forgets the server village when the server has none (and when the account is deleted)', async () => {
    const s = await setup();
    await s.conn.village!.enable();
    expect(s.kv.map.has('tk.net.village:https://test.server')).toBe(true);
    await s.conn.deleteAccount();
    expect(s.conn.serverVillage).toBe(false);
    expect(s.kv.map.has('tk.net.village:https://test.server')).toBe(false);
  });

  it('cloud save: a second device signs in with a linked account and gets the village the server keeps', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k' };
    const fetch = async () => ({ ok: true, status: 200, json: async () => ({ keys: [jwk] }), arrayBuffer: async () => new ArrayBuffer(0) });
    const w0 = world();
    const apple = new JwtVerifier({ jwksUrl: 'x', issuers: ['https://appleid.apple.com'], audiences: ['app'], fetch, now: () => w0.now() });
    const w = world({ shared: { identity: combineVerifiers({ apple }) } });
    const token = () => {
      const h = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'k' })).toString('base64url');
      const p = Buffer.from(JSON.stringify({ iss: 'https://appleid.apple.com', aud: 'app', sub: 'me', exp: w.now() / 1000 + 600 })).toString('base64url');
      return { idToken: `${h}.${p}.${cryptoSign('RSA-SHA256', Buffer.from(`${h}.${p}`), privateKey).toString('base64url')}` };
    };
    const laptop = await setup(w);
    await laptop.conn.village!.enable();
    placeCollector(laptop.controller);
    await laptop.conn.village!.flush();
    await laptop.conn.link('apple', token());
    // A new phone starts its own village and its own online player, then signs in.
    const phone = await setup(w);
    expect(phone.conn.player!.id).not.toBe(laptop.conn.player!.id);
    await phone.conn.signIn('apple', token());
    expect(phone.conn.player!.id).toBe(laptop.conn.player!.id);
    expect(phone.conn.serverVillage).toBe(true);
    expect(economyHash(phone.controller.state)).toBe(economyHash(laptop.controller.state));
    expect(await phone.store.listBackups()).toHaveLength(1); // the phone's own village is kept
  });

  it('moves the village on this device to the server as it is (no backup, nothing replaced)', async () => {
    const s = await setup();
    placeCollector(s.controller);
    const before = economyHash(s.controller.state);
    await s.conn.village!.enable('move');
    expect(s.conn.serverVillage).toBe(true);
    expect(economyHash(s.controller.state)).toBe(before);
    expect(await serverHash(s)).toBe(before);
    expect(await s.store.listBackups()).toHaveLength(0);
    placeCollector(s.controller, 'dew');
    await s.conn.village!.flush();
    expect(s.conn.village!.corrections).toBe(0);
  });

  it('protocol 7: the real game moves its village to the server by itself, and remembers a refusal', async () => {
    const w = world();
    const clock = { now: () => w.now() };
    const { controller } = await GameController.start({ clock, store: new MemorySaveStore(), data: w.data, analytics: new Analytics(new MemoryEventStore(), clock, 'test'), botRaids: false });
    const port = new InProcessServerAdapter(w.core);
    const kv = memoryKv();
    const conn = new Connection({ game: controller, builtInUrl: 'test.server', kv, makePort: () => port, log: () => undefined, keepVillageOnServer: true });
    await conn.sync();
    expect(conn.serverVillage).toBe(true);
    expect(economyHash(controller.state)).toBe((await port.getVillage())!.stateHash);
    // A village the server refuses stays here; the reason is kept for Settings and not retried every minute.
    const w2 = world();
    const c2 = (await GameController.start({ clock: { now: () => w2.now() }, store: new MemorySaveStore(), data: w2.data, analytics: new Analytics(new MemoryEventStore(), clock, 'test'), botRaids: false })).controller;
    c2.state.resources.moonstones = 10_000_000;
    const kv2 = memoryKv();
    const conn2 = new Connection({ game: c2, builtInUrl: 'test.server', kv: kv2, makePort: () => new InProcessServerAdapter(w2.core), log: () => undefined, keepVillageOnServer: true });
    await conn2.sync();
    expect(conn2.serverVillage).toBe(false);
    expect(conn2.villageMoveRefused).toMatch(/Jade/);
    expect(conn2.status).toBe('online');
  });

  it('ledger audit A2: a village too far along for a new account moves by itself once the account is old enough', async () => {
    const w = world();
    const clock = { now: () => w.now() };
    const { controller } = await GameController.start({ clock, store: new MemorySaveStore(), data: w.data, analytics: new Analytics(new MemoryEventStore(), clock, 'test'), botRaids: false });
    controller.state.buildings.find((b) => w.data.buildings[b.type].category === 'hall')!.level = 7;
    const kv = memoryKv();
    const conn = new Connection({ game: controller, builtInUrl: 'test.server', kv, makePort: () => new InProcessServerAdapter(w.core), log: () => undefined, keepVillageOnServer: true });
    await conn.sync();
    expect(conn.serverVillage).toBe(false);
    expect(conn.villageMoveRefused).toMatch(/Keep 7 can move to the server once this online account is 9 days old/);
    // Not tried again the same day…
    w.advance(12 * HOUR);
    await conn.sync();
    expect(conn.serverVillage).toBe(false);
    // …but once the account is old enough, the next day's sync moves it.
    w.advance(9 * 24 * HOUR);
    await conn.sync();
    expect(conn.villageMoveRefused).toBeNull();
    expect(conn.serverVillage).toBe(true);
  });
});


describe('worldwide audit: several devices and storage failures', () => {
  it('GLOBAL-009: two devices numbering their own commands both get applied, and a retry is still skipped', async () => {
    const w = world();
    const a = await setup(w);
    await a.conn.village!.enable();
    // The same account on a second device (one in-process client = one sign-in).
    const clock = { now: () => w.now() };
    const { controller: c2 } = await GameController.start({ clock, store: new MemorySaveStore(), data: w.data, analytics: new Analytics(new MemoryEventStore(), clock, 'test'), botRaids: false });
    const conn2 = new Connection({ game: c2, builtInUrl: 'test.server', kv: memoryKv(), makePort: () => a.port, log: () => undefined });
    await conn2.sync();
    expect(conn2.serverVillage).toBe(true);
    const count = async (r: string) => deserialize((await a.port.getVillage())!.file, w.data).buildings.filter((b) => w.data.buildings[b.type].produces === r).length;
    const acorns0 = await count('acorns');
    const dew0 = await count('dew');
    // Both act before either sends: each queue's first command is its own "1".
    expect(placeCollector(a.controller, 'acorns').ok).toBe(true);
    // Device 2 builds on the far side of the map (the same tile would be a real conflict, refused and counted).
    const dewType = Object.keys(w.data.hall.levels[0].limits).find((k) => w.data.buildings[k]?.produces === 'dew' && w.data.hall.levels[0].limits[k].count > 0)!;
    const far = (() => {
      for (let y = w.data.economy.mapSize - 1; y >= 0; y--) for (let x = w.data.economy.mapSize - 1; x >= 0; x--) if (canPlace(c2.state, w.data, dewType, x, y).ok) return { x, y };
      throw new Error('no room');
    })();
    expect(c2.dispatch({ type: 'place', buildingType: dewType, ...far }).ok).toBe(true);
    await a.conn.village!.flush();
    await conn2.village!.flush();
    expect(a.conn.village!.pending).toBe(0);
    expect(conn2.village!.pending).toBe(0);
    expect(conn2.village!.refused).toBe(0);
    // Before the fix the second device's "command 1" was acknowledged without being applied.
    expect(await count('acorns')).toBe(acorns0 + 1);
    expect(await count('dew')).toBe(dew0 + 1);
    // Device 2 took the server's village (device 1's collector included) as a correction.
    expect(economyHash(c2.state)).toBe(await serverHash(a));
    // A batch sent again (its answer was lost) changes nothing.
    const before = (await a.port.getVillage())!.revision;
    const device = JSON.parse([...a.kv.map.values()].find((v) => v.includes('"device"'))!).device as string;
    const again = await a.port.sendCommands({ stateHash: '', device, commands: [{ seq: 1, t: w.now(), command: { type: 'collect', id: 'b1' } }] });
    expect(again.results).toEqual([]);
    expect((await a.port.getVillage())!.revision).toBe(before);
  });

  it('GLOBAL-009 follow-up: refused actions are kept with what they were about and the server reason code', async () => {
    const w = world();
    const a = await setup(w);
    await a.conn.village!.enable();
    expect(placeCollector(a.controller, 'acorns').ok).toBe(true);
    const placed = a.controller.state.buildings[a.controller.state.buildings.length - 1].type;
    // The server refuses it (as when the village changed on another device first) and names the command.
    const real = a.port.sendCommands.bind(a.port);
    a.port.sendCommands = async (batch) => {
      const r = await real(batch);
      return { ...r, results: r.results.map((x) => ({ seq: x.seq, ok: false, error: 'NO_FREE_BUILDER', type: 'place', at: w.now() })) };
    };
    await a.conn.village!.flush();
    expect(a.conn.village!.refused).toBe(1);
    expect(a.conn.refusedActions).toEqual([{ at: expect.any(Number), type: 'place', code: 'NO_FREE_BUILDER', building: placed }]);
  });

  it('GLOBAL-009 follow-up: refusedLog keeps only the newest REFUSED_LOG_SIZE (20) refused actions', async () => {
    const { REFUSED_LOG_SIZE } = await import('../../../src/backend/net/villageSync');
    expect(REFUSED_LOG_SIZE).toBe(20);
    const w = world();
    const a = await setup(w);
    await a.conn.village!.enable();
    expect(placeCollector(a.controller, 'acorns').ok).toBe(true);
    const real = a.port.sendCommands.bind(a.port);
    a.port.sendCommands = async (batch) => {
      const r = await real(batch);
      // 25 refusals at once, oldest first (times 1..25).
      return { ...r, results: Array.from({ length: 25 }, (_, i) => ({ seq: 10_000 + i, ok: false, error: 'NO_FREE_BUILDER', type: 'upgrade', at: i + 1 })) };
    };
    await a.conn.village!.flush();
    expect(a.conn.village!.refused).toBe(25);
    expect(a.conn.refusedActions).toHaveLength(20);
    expect(a.conn.refusedActions.map((x) => x.at)).toEqual(Array.from({ length: 20 }, (_, i) => i + 6));
  });

  it('GLOBAL-009 follow-up: the server names refused commands (type and time) in its answer', async () => {
    const w = world();
    const a = await setup(w);
    await a.conn.village!.enable();
    const r = await a.port.sendCommands({ stateHash: '', device: 'dev-x', commands: [{ seq: 1, t: w.now(), command: { type: 'upgrade', id: 'no-such-building' } }] });
    expect(r.results).toEqual([{ seq: 1, ok: false, error: 'NOT_FOUND', type: 'upgrade', at: expect.any(Number) }]);
  });

  it('GLOBAL-010: a queue that cannot be stored is reported and sent at once', async () => {
    const kv = memoryKv();
    let full = false;
    const failing: KeyValue & { map: Map<string, string> } = { ...kv, trySet: (k, v) => (full ? false : (kv.set(k, v), true)) };
    const s = await setup(world(), failing);
    await s.conn.village!.enable();
    full = true;
    expect(placeCollector(s.controller).ok).toBe(true);
    expect(s.conn.village!.storageProblem).toBe(true);
    expect(s.conn.storageProblem).toBe(true);
    // Sent straight away, so the server holds it even though this device could not.
    await s.conn.village!.flush();
    expect(s.conn.village!.pending).toBe(0);
    expect(economyHash(s.controller.state)).toBe(await serverHash(s));
    full = false;
    placeCollector(s.controller, 'dew');
    expect(s.conn.storageProblem).toBe(false);
  });
});
