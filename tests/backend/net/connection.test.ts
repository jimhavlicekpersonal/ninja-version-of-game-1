/**
 * The game side of online play: Connection + sim commands against the server
 * core through the in-process adapter. Every server result must land in the
 * village exactly once, however often the game syncs.
 */
import { COMMUNITY_RULES_VERSION } from '../../../src/backend/net/protocol';
import { describe, expect, it } from 'vitest';
import { InProcessServerAdapter } from '../../../server/inProcess';
import { Connection, type GameLink, type KeyValue } from '../../../src/backend/net/connection';
import { ServerError, type ServerPort } from '../../../src/backend/net/ports';
import { canPlace } from '../../../src/gameplay/sim/grid';
import { applyCommand, createNewVillage, type Command } from '../../../src/gameplay/sim/village';
import { migrate, SAVE_VERSION } from '../../../src/gameplay/sim/save';
import type { GameData, VillageState } from '../../../src/gameplay/sim/types';
import { baseAt, HOUR, rush, world, startSeed } from '../server/harness';

function memoryKv(): KeyValue & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, get: (k) => map.get(k) ?? null, set: (k, v) => (v === null ? map.delete(k) : map.set(k, v)) };
}

/** A village the way GameController holds it, on the test world's clock. */
function village(w: ReturnType<typeof world>, extra: (s: VillageState) => void = () => undefined): GameLink & { state: VillageState } {
  const data: GameData = w.data;
  const state = createNewVillage(w.now(), data);
  extra(state);
  const g = {
    data,
    state,
    now: () => w.now(),
    dispatch(cmd: Command) {
      const r = applyCommand(g.state, cmd, g.now(), data);
      if (r.ok) g.state = r.state;
      return r;
    },
  };
  return g;
}

function addLodge(s: VillageState, data: GameData): void {
  s.buildings.find((b) => b.type === 'elder_toadstool')!.level = 3; // Lodges come with Keep 2+
  for (let y = 0; y < 38; y++) {
    for (let x = 0; x < 38; x++) {
      if (canPlace(s, data, 'grove_lodge', x, y).ok) {
        s.buildings.push({ id: `b${s.nextId++}`, type: 'grove_lodge', level: 2, x, y, upgrade: null, collector: null });
        return;
      }
    }
  }
}

function connect(w: ReturnType<typeof world>, game: GameLink, kv = memoryKv(), port?: ServerPort) {
  const p = port ?? new InProcessServerAdapter(w.core);
  const conn = new Connection({ game, builtInUrl: 'test.server', kv, makePort: () => p, log: () => undefined, rulesAccepted: () => COMMUNITY_RULES_VERSION });
  return { conn, port: p, kv };
}

describe('save v9', () => {
  it('adds empty online bookkeeping to a v8 save and keeps its daily chest', () => {
    const w = world();
    const v = createNewVillage(w.now(), w.data) as unknown as Record<string, unknown>;
    delete v.net;
    const daily = { ...(v.daily as object), lastDay: 123, step: 4 };
    v.daily = daily;
    const out = migrate({ version: 8, savedAt: 0, village: v }, w.data);
    expect(out.version).toBe(SAVE_VERSION);
    expect(out.village.net).toEqual({ playerId: null, defensesSince: 0, donations: [], raidWeeks: [], gangWars: [] });
    expect(out.village.daily).toEqual(daily);
  });
});

describe('Connection', () => {
  it('stays off without a server, and picks the Settings address over the built-in one', () => {
    const w = world();
    const kv = memoryKv();
    expect(new Connection({ game: village(w), kv }).status).toBe('off');
    Connection.choose('my.server.example', kv);
    expect(new Connection({ game: village(w), kv, builtInUrl: 'https://built.in', makePort: () => new InProcessServerAdapter(w.core) }).url).toBe('https://my.server.example');
    Connection.choose('off', kv);
    expect(new Connection({ game: village(w), kv, builtInUrl: 'https://built.in' }).enabled).toBe(false);
    Connection.choose('', kv);
    expect(new Connection({ game: village(w), kv, builtInUrl: 'https://built.in', makePort: () => new InProcessServerAdapter(w.core) }).url).toBe('https://built.in');
  });

  it('registers, shares the base, leaves the bot Grove and goes online', async () => {
    const w = world();
    const game = village(w);
    game.dispatch({ type: 'joinGrove' });
    expect(game.state.grove.joined).toBe(true);
    const { conn, port } = connect(w, game);
    expect(conn.status).toBe('connecting');
    await conn.sync();
    expect(conn.status).toBe('online');
    expect(game.state.net.playerId).toBe(conn.player!.id);
    expect(game.state.grove.joined).toBe(false); // the real Grove replaces the bot one
    expect((await w.repo.getPlayer(conn.player!.id))!.base).not.toBeNull();
    expect(port.hasIdentity()).toBe(true);
  });

  it('reports incompatible servers and does not retry them', async () => {
    const w = world();
    const game = village(w);
    const port = new InProcessServerAdapter(w.core);
    port.hello = async () => {
      throw new ServerError(0, 'version_mismatch', 'This server needs a newer version of the game.');
    };
    const { conn } = connect(w, game, memoryKv(), port);
    await conn.sync();
    expect(conn.status).toBe('incompatible');
    expect(conn.lastError).toMatch(/newer version/);
  });

  it('applies a real raid once: loot lost, trophies, shield and the replay', async () => {
    const w = world();
    const game = village(w, (s) => (s.resources.acorns = 900));
    const { conn } = connect(w, game);
    await conn.sync();
    const bob = await w.player('Bob', baseAt(1, 3));
    w.pastShields();
    await w.repo.updatePlayer(game.state.net.playerId!, { shieldUntil: 0 });
    await conn.uploadBase();
    const m = (await bob.match())!;
    expect(m.opponent.kind).toBe('player');
    const r = await bob.submitAttack({ ticket: m.ticket, seed: await startSeed(bob, m.ticket), ...rush(20) });
    const before = game.state.resources.acorns;
    await conn.sync();
    await conn.sync();
    expect(game.state.defenseLog).toHaveLength(1);
    expect(game.state.defenseLog[0]).toMatchObject({ opponentName: 'Bob', kind: 'defense' });
    expect(game.state.resources.acorns).toBe(Math.max(0, before - (r.result.loot.acorns ?? 0)));
    expect(game.state.trophies).toBe(conn.player!.trophies);
    expect(game.state.net.defensesSince).toBe(game.state.defenseLog[0].at);
    expect(conn.newDefenses).toBe(1);
  });

  it('adds donated troops to the Grove Lodge once, even if the acknowledgement is lost', async () => {
    const w = world();
    const game = village(w, (s) => addLodge(s, w.data));
    const { conn, port } = connect(w, game);
    await conn.sync();
    const g = await port.createGrove('Mossy Hollow');
    const ben = await w.player('Ben', baseAt(3));
    await ben.joinGrove(g.id);
    const req = await port.requestTroops(10);
    await ben.donate(req.id, { troop: 'hedgehog_roller', count: 4, level: 1 });
    // First sync: the ack fails, so the server will send the same donation again.
    const ack = port.ackInbox.bind(port);
    port.ackInbox = async () => {
      throw new ServerError(0, 'network', 'offline');
    };
    await conn.sync();
    expect(game.state.grove.reinforcements).toEqual({ hedgehog_roller: 4 });
    port.ackInbox = ack;
    await conn.sync();
    await conn.sync();
    expect(game.state.grove.reinforcements).toEqual({ hedgehog_roller: 4 });
    expect((await port.inbox()).donations).toHaveLength(0);
  });

  it('collects each Grove Raid chest once', async () => {
    const w = world();
    const game = village(w);
    const { conn, port } = connect(w, game);
    await conn.sync();
    await port.createGrove('Lonely Leaf');
    const week = w.intoRaid(1);
    await conn.sync();
    // Ledger audit E14: only members who attacked in the war get its chest.
    const t = await port.raidTicket(0);
    await port.submitRaidAttack({ ticket: t.ticket, seed: t.seed, ...rush(20) });
    expect(game.state.grove.raidHistory).toHaveLength(0);
    w.setTime(w.raidEnd(week) + HOUR);
    const moon = game.state.resources.moonstones;
    await conn.sync();
    expect(game.state.net.raidWeeks).toContain(week);
    expect(game.state.grove.raidHistory).toHaveLength(1);
    const outcome = game.state.grove.raidHistory[0].outcome;
    // Beast Mode GT-13: 30% of the chest follows the member's own stars (one attack of two here), so the Jade lies
    // between 70% and all of the outcome's chest, and is what the record says was paid.
    const full = w.data.social.groveRaid.rewards[outcome].moonstones ?? 0;
    const paid = game.state.resources.moonstones - moon;
    expect(paid).toBe(game.state.grove.raidHistory[0].reward.moonstones);
    expect(paid).toBeGreaterThanOrEqual(Math.floor(full * 0.7));
    expect(paid).toBeLessThanOrEqual(full);
    // A fresh session (app restart) asks again; the server says it was claimed and nothing is paid twice.
    const again = connect(w, game, memoryKv(), port).conn;
    await again.sync();
    expect(game.state.grove.raidHistory).toHaveLength(1);
    expect(game.state.resources.moonstones).toBe(moon + paid);
  });

  it('keeps battle reports in the outbox until the server takes them', async () => {
    const w = world();
    const game = village(w);
    const kv = memoryKv();
    const { conn, port } = connect(w, game, kv);
    await conn.sync();
    const m = (await port.match())!;
    const submit = port.submitAttack.bind(port);
    port.submitAttack = async () => {
      throw new ServerError(0, 'network', 'offline');
    };
    const s1 = await startSeed(port, m.ticket);
    await conn.report('attack', { ticket: m.ticket, seed: s1, ...rush(10) });
    expect(conn.outbox()).toHaveLength(1);
    // The outbox survives a restart (it is in storage).
    const restarted = connect(w, game, kv, port).conn;
    expect(restarted.outbox()).toHaveLength(1);
    port.submitAttack = submit;
    await restarted.sync();
    expect(restarted.outbox()).toHaveLength(0);
    // A rate limit is not a refusal: the report waits in the outbox, and the connection stays online.
    port.submitAttack = async () => {
      throw new ServerError(429, 'rate_limited', 'Too many battle reports at once. Try again in 30 seconds.');
    };
    const m2 = (await port.match())!;
    await restarted.report('attack', { ticket: m2.ticket, seed: await startSeed(port, m2.ticket), ...rush(10) });
    expect(restarted.outbox().map((i) => i.id)).toEqual([m2.ticket]);
    expect(restarted.status).toBe('online');
    expect(restarted.lastError).toMatch(/Try again/);
    port.submitAttack = submit;
    await restarted.sync();
    expect(restarted.outbox()).toHaveLength(0);
    // A report the server refuses (already used ticket) is dropped, not retried forever.
    await restarted.report('attack', { ticket: m.ticket, seed: s1, ...rush(10) });
    expect(restarted.outbox()).toHaveLength(0);
  });

  it('F6: donations are acknowledged only after the save that holds them landed', async () => {
    const w = world();
    let saves = false;
    const game = Object.assign(village(w), { persist: async () => saves });
    const { conn, port } = connect(w, game);
    await conn.sync();
    const gift = { id: 'don-1', at: w.now(), fromName: 'Ann', troop: 'hedgehog_roller', count: 2, level: 1 };
    port.inbox = async () => ({ donations: [gift] });
    const acked: string[][] = [];
    port.ackInbox = async (ids) => void acked.push(ids);
    await conn.sync();
    expect(game.state.net.donations).toContain('don-1'); // received here
    expect(acked).toEqual([]); // but the save failed: the server keeps them
    saves = true;
    await conn.sync();
    expect(acked).toEqual([['don-1']]);
  });

  it('F2: with storage full, a new report and a pending attack still reach the server', async () => {
    const w = world();
    const game = village(w);
    let full = false;
    const map = new Map<string, string>();
    const kv: KeyValue & { map: Map<string, string> } = { map, get: (k) => map.get(k) ?? null, set: (k, v) => void (!full && (v === null ? map.delete(k) : map.set(k, v))), trySet: (k, v) => (full ? false : (v === null ? map.delete(k) : map.set(k, v), true)) };
    const { conn, port } = connect(w, game, kv);
    await conn.sync();
    const sent: string[] = [];
    port.gangWarAttack = async (sub) => {
      sent.push(sub.ticket);
      return {} as never;
    };
    full = true;
    await conn.report('gangwar', { ticket: 'war-ticket-1', seed: 1, army: {}, levels: {}, deployments: [], endTick: 1 } as never);
    expect(sent).toEqual(['war-ticket-1']);
    expect(conn.storageProblem).toBe(true);
    expect(conn.outbox()).toHaveLength(0);
    // An attack still pending in the battle log (its report missing from the outbox) is sent again, storage full.
    const submit = port.submitAttack.bind(port);
    port.submitAttack = async (sub) => {
      sent.push(sub.ticket);
      return submit(sub);
    };
    const m = (await port.match())!;
    const seed = await startSeed(port, m.ticket);
    const r = rush(10);
    game.state.battleLog.push({ id: 'r1', at: w.now(), kind: 'attack', opponentName: 'x', ticket: m.ticket, settlement: 'pending', setup: { seed, base: m.base, army: r.army }, deployments: r.deployments, endTick: 0, result: { hash: '' } } as never);
    await conn.flush();
    expect(sent).toEqual(['war-ticket-1', m.ticket]);
  });
});

describe('ledger audit A1: the game asks for the seed on Attack and sends waiting reports before the next match', () => {
  it('startAttack returns the server seed; without a connection the raid does not start', async () => {
    const w = world();
    const game = village(w);
    const { conn, port } = connect(w, game);
    await conn.sync();
    await w.player('Dot', baseAt(1, 3));
    const m = (await port.match())!;
    expect(m.seed).toBeUndefined();
    const seed = await conn.startAttack(m.ticket);
    expect(seed).toBe((await w.repo.getTicket(m.ticket))!.seed);
    // A connection that never reached the server (status offline) refuses to start the raid.
    const offline = connect(w, game, memoryKv(), port).conn;
    (offline as unknown as { server: unknown }).server = (conn as unknown as { server: unknown }).server;
    expect(offline.online).toBe(false);
    await expect(offline.startAttack(m.ticket)).rejects.toThrow(/No connection/);
    // A server that refuses (this ticket is someone else's) says why, and the raid does not start either.
    const other = connect(w, village(w), memoryKv()).conn;
    await other.sync();
    await expect(other.startAttack(m.ticket)).rejects.toThrow(/Unknown ticket/);
  });

  it('sendReportsBeforeMatch empties the outbox first', async () => {
    const w = world();
    const game = village(w);
    const { conn, port } = connect(w, game);
    await conn.sync();
    const m = (await port.match())!;
    const seed = await startSeed(port, m.ticket);
    const submit = port.submitAttack.bind(port);
    // Rate limited: the report waits in the outbox and the connection stays online.
    port.submitAttack = async () => {
      throw new ServerError(429, 'rate_limited', 'Too many battle reports at once.');
    };
    await conn.report('attack', { ticket: m.ticket, seed, ...rush(10) });
    expect(conn.outbox()).toHaveLength(1);
    expect(conn.online).toBe(true);
    port.submitAttack = submit;
    await conn.sendReportsBeforeMatch();
    expect(conn.outbox()).toHaveLength(0);
  });
});
