/**
 * Gameplay audit fixes for online play and battle lifecycles:
 * F05 online loot waits for the server, F03 uploaded bases obey the Keep,
 * F04 armies obey unlock Keeps and Lodge limits, F34 equal war rosters,
 * F06/F19 Alliance War attacks survive interruption and can be replayed,
 * F18 replays are versioned.
 */
import { describe, expect, it } from 'vitest';
import { checkArmy, normalizeBase, validateBase } from '../../../server/core/pvp';
import type { Player } from '../../../server/repo';
import { Analytics, MemoryEventStore } from '../../../src/backend/analytics/events';
import { Connection, type GameLink, type KeyValue } from '../../../src/backend/net/connection';
import type { ServerPort } from '../../../src/backend/net/ports';
import { MemorySaveStore } from '../../../src/backend/persist/saveStore';
import { InProcessServerAdapter } from '../../../server/inProcess';
import { GameController } from '../../../src/gameplay/control/controller';
import { replayable, runBattle, SIM_RULES } from '../../../src/gameplay/sim/battle/battle';
import type { BaseLayout, BattleSetup } from '../../../src/gameplay/sim/battle/types';
import { FakeClock } from '../../../src/gameplay/sim/clock';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { raidWindow } from '../../../src/gameplay/sim/social/groveRaid';
import { capacity } from '../../../src/gameplay/sim/resources';
import type { VillageState } from '../../../src/gameplay/sim/types';
import { applyCommand, battleLoadout, createNewVillage, type Command } from '../../../src/gameplay/sim/village';
import { baseAt, HOUR, rush, world, startSeed } from '../server/harness';

function memoryKv(): KeyValue {
  const map = new Map<string, string>();
  return { get: (k) => map.get(k) ?? null, set: (k, v) => (v === null ? map.delete(k) : map.set(k, v)) };
}

function village(w: ReturnType<typeof world>): GameLink & { state: VillageState } {
  const state = createNewVillage(w.now(), w.data);
  state.army = { hedgehog_roller: 20 };
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

/** Play an online attack the way App does: match, fight locally, record it as pending, report it. */
async function onlineAttack(w: ReturnType<typeof world>, game: ReturnType<typeof village>, port: ServerPort) {
  const m = (await port.match())!;
  const { deployments } = rush(20);
  // Ledger audit A1: the seed arrives when the raid starts (protocol 10), as App does on Attack.
  const setup: BattleSetup = { seed: await startSeed(port, m.ticket), base: m.base, ...battleLoadout(game.state, data), infiltration: true };
  const r = game.dispatch({ type: 'battleEnd', record: { at: w.now(), opponentName: m.base.name, setup, deployments, ticket: m.ticket } });
  expect(r.ok).toBe(true);
  const sub = { ticket: m.ticket, seed: setup.seed, army: setup.army, levels: setup.levels, reinforcements: setup.reinforcements, deployments };
  return { m, sub, local: runBattle(setup, deployments, data).result };
}

describe('F05: online loot is banked only when the server accepts the attack', () => {
  it('banks the server result once, and only after it answers', async () => {
    const w = world();
    const game = village(w);
    const port = new InProcessServerAdapter(w.core);
    const conn = new Connection({ game, builtInUrl: 'test.server', kv: memoryKv(), makePort: () => port, log: () => undefined });
    await conn.sync();
    const before = { ...game.state.resources };
    const { sub, local } = await onlineAttack(w, game, port);
    const rec = game.state.battleLog.at(-1)!;
    expect(rec.settlement).toBe('pending');
    expect(game.state.resources.acorns).toBe(before.acorns); // nothing banked yet
    expect(game.state.stats.starsEarned).toBe(0);
    await conn.report('attack', sub);
    const settled = game.state.battleLog.at(-1)!;
    expect(settled.settlement).toBe('confirmed');
    expect(settled.result.hash).toBe(local.hash);
    expect(game.state.resources.acorns).toBe(Math.min(capacity(game.state, data).acorns, before.acorns + (settled.banked?.acorns ?? 0)));
    expect(game.state.stats.starsEarned).toBe(settled.result.stars);
    // Reporting again (a retry) changes nothing.
    await conn.report('attack', sub);
    await conn.flush();
    expect(game.state.stats.starsEarned).toBe(settled.result.stars);
    expect(game.state.trophies).toBe((await port.me()).trophies);
  });

  it('an expired ticket becomes a practice result with no loot or honor', async () => {
    const w = world();
    const game = village(w);
    const port = new InProcessServerAdapter(w.core);
    const conn = new Connection({ game, builtInUrl: 'test.server', kv: memoryKv(), makePort: () => port, log: () => undefined });
    await conn.sync();
    const before = { ...game.state.resources };
    const trophies = game.state.trophies;
    const { sub } = await onlineAttack(w, game, port);
    w.advance(76 * HOUR); // longer than the three days a late report is accepted (audit R02)
    await conn.report('attack', sub);
    const rec = game.state.battleLog.at(-1)!;
    expect(rec.settlement).toBe('rejected');
    expect(rec.rejected).toBe('expired');
    expect(game.state.resources).toEqual(before);
    expect(game.state.trophies).toBe(trophies);
    expect(game.state.stats.raidsWon).toBe(0);
  });

  it('audit R02: a raid finished just before a two-day outage still settles with its loot and honor', async () => {
    const w = world();
    const game = village(w);
    const port = new InProcessServerAdapter(w.core);
    const conn = new Connection({ game, builtInUrl: 'test.server', kv: memoryKv(), makePort: () => port, log: () => undefined });
    await conn.sync();
    const { sub } = await onlineAttack(w, game, port);
    w.advance(48 * HOUR);
    await conn.report('attack', sub);
    const rec = game.state.battleLog.at(-1)!;
    expect(rec.settlement).not.toBe('rejected');
    expect(rec.settlement).not.toBe('pending');
  });

  it('a lost outbox and a lost answer still settle exactly once', async () => {
    const w = world();
    const game = village(w);
    const port = new InProcessServerAdapter(w.core);
    const conn = new Connection({ game, builtInUrl: 'test.server', kv: memoryKv(), makePort: () => port, log: () => undefined });
    await conn.sync();
    const { sub } = await onlineAttack(w, game, port);
    // The report reached the server, but the answer never came back and the outbox was wiped.
    const first = await port.submitAttack(sub);
    expect(conn.outbox()).toHaveLength(0);
    await conn.flush();
    const rec = game.state.battleLog.at(-1)!;
    expect(rec.settlement).toBe('confirmed');
    expect(rec.trophies).toBe(first.trophies);
    expect((await port.me()).trophies).toBe(first.playerTrophies);
  });
});

describe('F03: uploaded bases must be legal for their Keep', () => {
  const keep1 = () => baseAt(1);
  it('rejects too many or too strong defenses for the Keep, and trial multipliers', () => {
    const b = keep1();
    expect(validateBase(b, data)).toBeNull();
    const impossible: BaseLayout = { name: 'x', hallLevel: 1, buildings: [{ id: 'h', type: 'elder_toadstool', level: 1, x: 30, y: 30 }, ...Array.from({ length: 8 }, (_, i) => ({ id: `lb${i}`, type: 'longbow_yagura', level: 10, x: (i % 4) * 4, y: Math.floor(i / 4) * 4 }))] };
    expect(validateBase(impossible, data)).toMatch(/longbow_yagura/);
    expect(validateBase({ ...b, power: 1_000_000 } as BaseLayout, data)).toMatch(/not allowed/);
    expect('error' in normalizeBase({ ...b, power: 1_000_000 }, data)).toBe(true);
    const dup = keep1();
    dup.buildings[1] = { ...dup.buildings[1], id: dup.buildings[0].id };
    expect(validateBase(dup, data)).toMatch(/duplicate/);
    const n = normalizeBase({ ...b, practice: 'x' }, data);
    expect('base' in n && n.base.practice).toBeFalsy();
  });
});

describe('F04: attacks must use troops the Keep can train (or donated ones that fit the Lodge)', () => {
  const at = (hallLevel: number) => ({ hallLevel }) as Player;
  it('rejects Armored Guardian and Kite Raider at Keep 1', () => {
    for (const troop of ['beetle_brute', 'owl_bomber']) {
      expect(() => checkArmy({ ticket: 't', seed: 1, deployments: [], army: { [troop]: 1 } }, at(1), data)).toThrow('troop not unlocked');
    }
    expect(checkArmy({ ticket: 't', seed: 1, deployments: [], army: { saboteur: 1 } }, at(1), data).army).toEqual({ saboteur: 1 });
  });

  it('accepts a donated troop the receiver cannot train only when declared and within the Lodge', () => {
    const keep = data.hall.levels.findIndex((l) => (l.limits.grove_lodge?.count ?? 0) > 0) + 1;
    const sub = { ticket: 't', seed: 1, deployments: [], army: { eclipse_ninja: 1 }, reinforcements: { eclipse_ninja: { count: 1, level: 3 } } };
    expect(checkArmy(sub, at(keep), data).reinforcements).toEqual({ eclipse_ninja: { count: 1, level: 3 } });
    expect(() => checkArmy({ ...sub, reinforcements: {} }, at(keep), data)).toThrow('troop not unlocked');
    expect(() => checkArmy({ ...sub, army: { eclipse_ninja: 500 }, reinforcements: { eclipse_ninja: { count: 500, level: 3 } } }, at(keep), data)).toThrow('army too big');
    expect(() => checkArmy({ ...sub, reinforcements: { eclipse_ninja: { count: 1, level: 999 } } }, at(keep), data)).toThrow('bad troop levels');
  });
});

describe('F34: Alliance Wars pair equal rosters', () => {
  it('a 3-member Alliance against a 1-member one fields one base each, with the same attack budget', async () => {
    const w = world();
    const [ann, ben, cat, dan] = await Promise.all([w.player('Ann', baseAt(1, 1)), w.player('Ben', baseAt(1, 2)), w.player('Cat', baseAt(1, 3)), w.player('Dan', baseAt(1, 4))]);
    const ga = await ann.createGrove('Big Clan');
    await ben.joinGrove(ga.id);
    await cat.joinGrove(ga.id);
    await dan.createGrove('Small Clan');
    w.intoRaid(1);
    await dan.me();
    const big = await ann.raid();
    const small = await dan.raid();
    expect(big.opponent?.kind).toBe('grove');
    expect(big.opponent!.members).toHaveLength(1);
    expect(small.opponent!.members).toHaveLength(1);
    // The bigger Alliance gets 1 base × 2 attacks in total, like the smaller one.
    for (const who of [ann, ben]) {
      const t = await who.raidTicket(0);
      await who.submitRaidAttack({ ticket: t.ticket, seed: t.seed, ...rush(5) });
    }
    await expect(cat.raidTicket(0)).rejects.toMatchObject({ code: 'no_attacks_left' });
    expect((await cat.raid()).attacksLeft).toBe(0);
  });
});

describe('F06 / F19: Alliance War attacks are protected and replayable', () => {
  const live = raidWindow(3, data);

  function joined(now: number): VillageState {
    const s = createNewVillage(now - 7 * 24 * HOUR, data);
    s.army = { hedgehog_roller: 20 };
    const r = applyCommand(s, { type: 'joinGrove' }, now - 6 * 24 * HOUR, data);
    if (!r.ok) throw new Error(r.message);
    return r.state;
  }

  it('an interrupted war attack is settled on the next launch, even after the war ended', async () => {
    const start = live.start + HOUR;
    const clock = new FakeClock(start);
    const store = new MemorySaveStore();
    const analytics = new Analytics(new MemoryEventStore(), clock, 'test');
    const c = (await GameController.start({ clock, store, analytics, data })).controller;
    await c.replace(joined(start));
    const base: BaseLayout = { name: 'Enemy', hallLevel: 1, buildings: [{ id: 'h', type: 'elder_toadstool', level: 1, x: 30, y: 30 }] };
    const setup: BattleSetup = { seed: 4, base, ...battleLoadout(c.state, data), infiltration: false };
    const deployments = Array.from({ length: 10 }, (_, i) => ({ tick: i, troop: 'hedgehog_roller', x: 1, y: 1 }));
    c.trackBattle({ kind: 'war', target: 0, opponentName: 'Enemy', setup, deployments, at: start, rules: SIM_RULES });
    await c.save();
    // The app closes; it is reopened after the war has ended.
    clock.set(live.end + HOUR);
    const again = (await GameController.start({ clock, store, analytics, data })).controller;
    const out = again.resolvePendingBattle();
    expect(out?.record.war).toBe(true);
    expect(again.state.pendingBattle).toBeNull();
    expect(again.state.army.hedgehog_roller).toBe(10);
    expect(again.state.grove.raid?.attacks).toHaveLength(1);
    // Kept in the battle log, with the current rules, so "Watch replay" has something to show.
    expect(again.state.battleLog.at(-1)).toMatchObject({ war: true, rules: SIM_RULES });
    expect(again.resolvePendingBattle()).toBeNull();
  });

  it('a pending battle that can no longer be banked still spends its deployed troops', () => {
    const s = createNewVillage(Date.UTC(2026, 0, 5), data);
    s.army = { hedgehog_roller: 20 };
    const base: BaseLayout = { name: 'x', hallLevel: 1, buildings: [{ id: 'h', type: 'elder_toadstool', level: 1, x: 30, y: 30 }] };
    const setup: BattleSetup = { seed: 1, base, army: { hedgehog_roller: 20 }, levels: {} };
    const r = applyCommand(s, { type: 'abandonBattle', record: { at: 0, opponentName: 'x', setup, deployments: [{ tick: 0, troop: 'hedgehog_roller', x: 1, y: 1 }] } }, Date.UTC(2026, 0, 5), data);
    expect(r.ok && r.state.army.hedgehog_roller).toBe(19);
  });
});

describe('F18: replays are tied to the battle rules they were fought under', () => {
  it('new records carry the current rules; old ones are not offered for replay', () => {
    expect(replayable({ rules: SIM_RULES })).toBe(true);
    expect(replayable({})).toBe(false);
    // Rules 5 (heroes) plays a hero-less battle exactly as rules 4, so rules 4 replays stay watchable; rules 4
    // (design re-audit) changed combat, so rules 3 replays are shown as unavailable, never replayed wrongly.
    expect(replayable({ rules: SIM_RULES - 1 })).toBe(true);
    expect(replayable({ rules: SIM_RULES - 2 })).toBe(false);
    expect(replayable({ rules: 1 })).toBe(false);
  });
});

describe('Account deletion from the game (roadmap step 14)', () => {
  it('deletes the account, settles pending attacks as practice, and turns online play off on this device', async () => {
    const w = world();
    const game = village(w);
    const kv = memoryKv();
    const port = new InProcessServerAdapter(w.core);
    const conn = new Connection({ game, builtInUrl: 'test.server', kv, makePort: () => port, log: () => undefined });
    await conn.sync();
    const id = conn.player!.id;
    const { sub } = await onlineAttack(w, game, port);
    expect(game.state.battleLog.at(-1)!.settlement).toBe('pending');
    const before = { ...game.state.resources };
    await conn.deleteAccount();
    expect(await w.repo.getPlayer(id)).toBeNull();
    expect(conn.status).toBe('off');
    expect(conn.player).toBeNull();
    expect(port.hasIdentity()).toBe(false);
    expect(game.state.battleLog.at(-1)!.settlement).toBe('rejected'); // a practice result: no loot or honor
    expect(game.state.resources).toEqual(before);
    expect(conn.outbox()).toHaveLength(0);
    // The next start stays offline, so no new account appears by itself.
    expect(Connection.chosen(kv)).toBe('off');
    expect(new Connection({ game, builtInUrl: 'test.server', kv, makePort: () => port, log: () => undefined }).enabled).toBe(false);
    // And the old report can no longer be sent.
    await expect(port.submitAttack(sub)).rejects.toMatchObject({ code: 'unauthorized' });
  });
});

