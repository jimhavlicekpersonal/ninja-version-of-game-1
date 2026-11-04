/**
 * The game's side of a Gang War (roadmap step 67): a strike is played on the
 * server's ticket and seed, spent and logged like an Alliance War attack,
 * reported through the outbox (`gangwar`), a relay strike starts from the
 * Gang's damage with the army cut to the relay's budget, and the chest lands
 * in the village once.
 */
import { describe, expect, it } from 'vitest';
import { Connection, type GameLink, type KeyValue } from '../../../src/backend/net/connection';
import { InProcessServerAdapter } from '../../../server/inProcess';
import { runBattle } from '../../../src/gameplay/sim/battle/battle';
import type { BattleSetup } from '../../../src/gameplay/sim/battle/types';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { armyHousing, armyShare, fullForceHousing, relayLoadout } from '../../../src/gameplay/sim/social/gangWar';
import type { VillageState } from '../../../src/gameplay/sim/types';
import { applyCommand, battleLoadout, createNewVillage, hallLevel, type Command } from '../../../src/gameplay/sim/village';
import { baseAt, HOUR, world } from '../server/harness';

const MIN = 60_000;
const gw = data.social.gangWar;

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

/** Strike the way App.gangWar does: ticket, cut the army to the budget, fight, spend locally, report. */
async function strike(conn: Connection, game: ReturnType<typeof village>, port: InProcessServerAdapter, target: number, relay: boolean, n: number) {
  const t = await port.gangWarTicket(target, relay);
  let loadout = battleLoadout(game.state, data);
  if (t.armyShare < 1) loadout = relayLoadout(loadout, t.armyShare, hallLevel(game.state, data), data);
  const deployments = Array.from({ length: Math.min(n, loadout.army.hedgehog_roller ?? 0) }, (_, i) => ({ tick: i, troop: 'hedgehog_roller', x: 1, y: 1 + (i % 30) }));
  const setup: BattleSetup = { seed: t.seed, base: t.base, ...loadout, infiltration: true, ...(t.startDamage ? { startDamage: t.startDamage } : {}) };
  const r = game.dispatch({ type: 'remoteGroveBattleEnd', target, record: { at: game.now(), opponentName: t.base.name, setup, deployments } });
  expect(r.ok).toBe(true);
  const local = runBattle(setup, deployments, data).result;
  await conn.report('gangwar', { ticket: t.ticket, seed: setup.seed, army: setup.army, levels: setup.levels, reinforcements: setup.reinforcements, deployments, clientHash: local.hash });
  return { t, setup, local };
}

describe('Gang War in the game (roadmap step 67)', () => {
  it('cuts a relay strike to the budget left, whole and deterministic', () => {
    const hall = 3;
    const full = fullForceHousing(hall, data);
    const loadout: { army: Record<string, number>; levels: Record<string, number>; reinforcements: Record<string, { count: number; level: number }> } = { army: { hedgehog_roller: 10, beetle_brute: 2 }, levels: {}, reinforcements: { beetle_brute: { count: 1, level: 1 } } };
    expect(relayLoadout(loadout, 1, hall, data)).toBe(loadout); // fits: unchanged
    const cut = relayLoadout(loadout, 0.25, hall, data);
    expect(armyHousing(cut.army, data)).toBeLessThanOrEqual(Math.floor(0.25 * full));
    for (const [k, n] of Object.entries(cut.army)) expect(n).toBeLessThanOrEqual(loadout.army[k]);
    for (const [k, r] of Object.entries(cut.reinforcements ?? {})) expect(r.count).toBeLessThanOrEqual(cut.army[k] ?? 0);
    expect(relayLoadout(loadout, 0.25, hall, data)).toEqual(cut);
    expect(armyShare(cut.army, hall, data)).toBeLessThanOrEqual(0.25 + 1e-9);
  });

  it('plays a solo and a relay strike, reports them through the outbox, and collects the chest once', async () => {
    const w = world();
    const game = village(w);
    const port = new InProcessServerAdapter(w.core);
    const conn = new Connection({ game, builtInUrl: 'test.server', kv: memoryKv(), makePort: () => port, log: () => undefined });
    await conn.sync();
    const mate = Object.assign(await w.player('Abe', baseAt(1, 5)), {});
    await port.requestFriend({ code: (await mate.friends()).code });
    await mate.answerFriendRequest((await mate.friends()).incoming[0].id, true);
    await port.createGang('Owls');
    await port.inviteToGang((await mate.me()).id);
    await mate.answerGangInvite((await mate.myGang()).invites[0].id, true);
    await port.queueGangWar();
    w.advance(gw.botAfterMinutes * MIN);
    const found = (await port.gangWar()).war!;
    expect(found.theirs.generated).toBe(true);
    w.advance(gw.prepHours * HOUR + 1);

    // A solo strike: troops spent here, logged as a war attack, the server has it once the outbox flushes.
    const before = game.state.army.hedgehog_roller;
    const { local } = await strike(conn, game, port, 0, false, 10);
    expect(local.used.hedgehog_roller).toBeGreaterThan(0);
    expect(game.state.army.hedgehog_roller).toBe(before - (local.used.hedgehog_roller ?? 0));
    expect(game.state.battleLog.at(-1)!.war).toBe(true);
    expect(conn.outbox()).toHaveLength(0);
    let view = (await port.gangWar()).war!;
    expect(view.attacks.filter((a) => a.side === 'ours')).toHaveLength(1);

    // A relay opener with the mate, then my relay strike starts from it within the budget left.
    const t1 = await mate.gangWarTicket(1, true);
    await mate.gangWarAttack({ ticket: t1.ticket, seed: t1.seed, army: { hedgehog_roller: 20 }, deployments: Array.from({ length: 20 }, (_, i) => ({ tick: i, troop: 'hedgehog_roller', x: 1, y: 1 + i })) });
    view = (await port.gangWar()).war!;
    const relay = view.theirs.bases[1].relay!;
    expect(relay).toMatchObject({ strikes: 1, lastBy: 'Abe', busy: false });
    expect(relay.armyLeft).toBeGreaterThan(0);
    const { t, setup } = await strike(conn, game, port, 1, true, 30);
    expect(t.startDamage).toBeDefined();
    expect(setup.startDamage).toEqual(t.startDamage);
    expect(armyShare(setup.army, hallLevel(game.state, data), data)).toBeLessThanOrEqual(t.armyShare + 1e-9);
    expect(conn.outbox()).toHaveLength(0);
    view = (await port.gangWar()).war!;
    expect(view.theirs.bases[1].relay!.strikes).toBe(2);
    expect(view.attacksLeft).toBe(0);
    // The replay of a relay strike starts from the same damage.
    const mine = view.attacks.find((a) => a.relay && a.attacker !== 'Abe')!;
    expect(mine.replay.startDamage).toEqual(t.startDamage);

    // The end: the chest lands in this village once.
    w.advance(gw.battleHours * HOUR);
    const jade = game.state.resources.moonstones;
    const c = await conn.claimGangWar();
    expect(game.state.resources.moonstones - jade).toBe(c.chest.moonstones ?? 0);
    expect(game.state.net.gangWars).toContain(c.warId);
    await expect(conn.claimGangWar()).rejects.toMatchObject({ code: 'conflict' });
    expect(game.state.resources.moonstones - jade).toBe(c.chest.moonstones ?? 0);
  });
});
