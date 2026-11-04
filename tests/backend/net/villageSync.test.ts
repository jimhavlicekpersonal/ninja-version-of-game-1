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
import { deserialize } from '../../../src/gameplay/sim/save';
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
});
