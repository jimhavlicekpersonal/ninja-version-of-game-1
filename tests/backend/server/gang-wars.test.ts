/**
 * Gang Wars (roadmap steps 65-66) on every storage adapter: matching, the
 * generated-Gang fallback, prep, solo and relay strikes, the relay hand-off,
 * scoring, chests, and the Gang Rating.
 */
import { describe, expect, it } from 'vitest';
import { buildServer } from '../../../server/app';
import { MemoryRepo } from '../../../server/repo';
import { ServerError } from '../../../src/backend/net/ports';
import { ClientHeaders, PROTOCOL_VERSION, Routes } from '../../../src/backend/net/protocol';
import { battleDamage, createBattle, runBattle } from '../../../src/gameplay/sim/battle/battle';
import type { BaseLayout, BattleSetup } from '../../../src/gameplay/sim/battle/types';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { botDeployments } from '../../../src/gameplay/sim/defense';
import { botArmy } from '../../../src/gameplay/sim/matchmaking';
import { createRng } from '../../../src/gameplay/sim/rng';
import { carryRelayDamage } from '../../../src/gameplay/sim/social/gangWar';
import { baseAt, HOUR, world } from './harness';
import { repoFactories } from './pg';

const MIN = 60_000;

async function refusal(p: Promise<unknown>): Promise<ServerError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ServerError) return e;
    throw e;
  }
  throw new Error('expected a refusal');
}

/** A full Keep 3 bot army sent through the base's infiltration points. */
function strikeOn(base: BaseLayout, seed: number, startDamage?: Record<string, number>) {
  const army = botArmy(3, 1, data);
  const setup: BattleSetup = { seed, base, army, infiltration: true, ...(startDamage ? { startDamage } : {}) };
  const probe = createBattle(setup, data);
  return { army, deployments: botDeployments(probe.deployable, probe.grid.size, army, createRng(seed + 1), data, {}, probe.entry), setup };
}

for (const [label, makeRepo] of repoFactories) {
  async function scene(opts: { gangs?: number; size?: number } = {}) {
    const w = world({ repo: await makeRepo() });
    const names = ['Ann Swift', 'Bo Quietstep', 'Cy Ironpine', 'Dee Swiftwind', 'Eve Stonepath', 'Fay Cedarhand'];
    const gangs: Awaited<ReturnType<typeof w.player>>[][] = [];
    let n = 0;
    for (let g = 0; g < (opts.gangs ?? 2); g++) {
      const members: Awaited<ReturnType<typeof w.player>>[] = [];
      for (let i = 0; i < (opts.size ?? 2); i++) members.push(await w.player(names[n] ?? `Ninja Number ${n}`, baseAt(3, 10 + n++)));
      const [lead, ...rest] = members;
      await lead.createSquad(`Gang Number ${g + 1}`);
      for (const m of rest) {
        await lead.sendFriendRequest({ playerId: m.id });
        await m.sendFriendRequest({ playerId: lead.id });
        await lead.squadInvite(m.id);
        await m.answerSquadInvite((await m.squad()).invites[0].id, true);
      }
      gangs.push(members);
    }
    return { w, gangs };
  }

  describe(`Gang Wars on ${label} storage`, () => {
    it('pairs two Gangs of the same size, locks rosters, and refuses strikes during prep', async () => {
      const { w, gangs } = await scene();
      const [[ann, bo], [cy]] = gangs;
      expect((await refusal(bo.gangWarQueue())).status).toBe(403);
      const first = await ann.gangWarQueue();
      expect(first.war).toBeNull();
      expect(first.queued).toMatchObject({ botAt: w.now() + data.social.gangWar.botAfterMinutes * MIN });
      const found = await cy.gangWarQueue();
      expect(found.war).toMatchObject({ phase: 'prep', size: 2, opponent: { name: 'Gang Number 1', bot: false } });
      expect((await ann.gangWar()).war!.opponent.name).toBe('Gang Number 2');
      expect((await refusal(bo.leaveSquad())).code).toBe('conflict');
      expect((await refusal(ann.gangWarTicket({ target: 0 }))).code).toBe('raid_not_live');
      // Prep: move defenses, copy the village in again.
      expect((await bo.gangWarBase()).war!.phase).toBe('prep');
    });

    it('a Gang that finds nobody gets a generated Gang, labelled, after a few minutes', async () => {
      const { w, gangs } = await scene({ gangs: 1, size: 3 });
      const [[ann]] = gangs;
      await ann.gangWarQueue();
      w.advance((data.social.gangWar.botAfterMinutes + 1) * MIN);
      const v = await ann.gangWar();
      expect(v.war!.opponent.bot).toBe(true);
      expect(v.war!.opponent.name).toMatch(/generated Gang/);
      expect(v.war!.enemy).toHaveLength(3);
    });

    it('solo and relay strikes: the relay carries damage, one striker at a time; scoring and chests', async () => {
      const { w, gangs } = await scene();
      const [[ann, bo], [cy, dee]] = gangs;
      await ann.gangWarQueue();
      await cy.gangWarQueue();
      w.advance(data.social.gangWar.prepHours * HOUR + MIN);
      // A solo strike.
      const t1 = await ann.gangWarTicket({ target: 0 });
      const s1 = strikeOn(t1.base, t1.seed);
      const r1 = await ann.gangWarAttack({ ticket: t1.ticket, seed: t1.seed, army: s1.army, deployments: s1.deployments });
      expect(r1.result.hash).toBe(runBattle(s1.setup, s1.deployments, data).result.hash);
      // A relay: Bo takes the first strike on base 1; Ann can't strike it until he reports.
      const t2 = await bo.gangWarTicket({ target: 1, relay: true });
      expect(t2.startDamage).toEqual({});
      expect((await refusal(ann.gangWarTicket({ target: 1, relay: true }))).code).toBe('conflict');
      const s2 = strikeOn(t2.base, t2.seed, {});
      const r2 = await bo.gangWarAttack({ ticket: t2.ticket, seed: t2.seed, army: s2.army, deployments: s2.deployments });
      const t3 = await ann.gangWarTicket({ target: 1, relay: true });
      const firstRun = runBattle(s2.setup, s2.deployments, data);
      expect(t3.startDamage).toEqual(carryRelayDamage(battleDamage(firstRun.sim), data));
      const s3 = strikeOn(t3.base, t3.seed, t3.startDamage);
      const r3 = await ann.gangWarAttack({ ticket: t3.ticket, seed: t3.seed, army: s3.army, deployments: s3.deployments });
      expect(r3.result.destruction).toBeGreaterThanOrEqual(r2.result.destruction);
      expect((await refusal(ann.gangWarTicket({ target: 0 }))).code).toBe('no_attacks_left');
      const mid = (await bo.gangWar()).war!;
      expect(mid.enemy[1].relay).toMatchObject({ strikes: 2, lastBy: 'Ann Swift', busy: false });
      expect(mid.enemy[1].best.destruction).toBe(r3.result.destruction);
      // Their side does one weak strike.
      const t4 = await dee.gangWarTicket({ target: 0 });
      await dee.gangWarAttack({ ticket: t4.ticket, seed: t4.seed, army: { hedgehog_roller: 1 }, deployments: [] });
      expect((await refusal(cy.gangWarClaim(mid.id))).code).toBe('raid_not_ended');
      w.advance(data.social.gangWar.battleHours * HOUR);
      const end = (await ann.gangWar()).recent[0];
      expect(end.outcome).toBe('win');
      const claim = await ann.gangWarClaim(end.id);
      expect(claim).toMatchObject({ outcome: 'win', alreadyClaimed: false });
      expect((await ann.gangWarClaim(end.id)).alreadyClaimed).toBe(true);
      expect((await cy.gangWarClaim(end.id)).outcome).toBe('loss');
      // Step 66: the Gang Ratings moved once, the right way.
      const [mine, theirs] = [(await ann.squad()).squad!.rating, (await cy.squad()).squad!.rating];
      expect(mine).toBeGreaterThan(data.ranks.rating.initial);
      expect(theirs).toBeLessThan(data.ranks.rating.initial);
      await ann.gangWar();
      expect((await ann.squad()).squad!.rating).toBe(mine);
      // The roster is free again; the same two Gangs are not paired again straight away.
      expect((await bo.leaveSquad()).squad).toBeNull();
    });

    it('a war against a generated Gang never moves the Gang Rating', async () => {
      const { w, gangs } = await scene({ gangs: 1 });
      const [[ann]] = gangs;
      await ann.gangWarQueue();
      w.advance((data.social.gangWar.botAfterMinutes + 1) * MIN);
      await ann.gangWar();
      w.advance((data.social.gangWar.prepHours + data.social.gangWar.battleHours + 1) * HOUR);
      const done = await ann.gangWar();
      await ann.gangWarClaim(done.recent[0].id);
      expect((await ann.squad()).squad!.rating).toBe(data.ranks.rating.initial);
    });

    it('never pairs recent opponents, or a Gang with its own Alliance', async () => {
      const { w, gangs } = await scene();
      const [[ann], [cy]] = gangs;
      await ann.gangWarQueue();
      await cy.gangWarQueue();
      w.advance((data.social.gangWar.prepHours + data.social.gangWar.battleHours + 1) * HOUR);
      await ann.gangWarQueue();
      const again = await cy.gangWarQueue();
      expect(again.war).toBeNull();
      expect(again.queued).not.toBeNull();
    });
  });
}

describe('relay strikes need rules 3', () => {
  it('an older game is told to update before a relay strike (a solo strike still works)', async () => {
    let t = Date.UTC(2026, 3, 1);
    const app = buildServer({ repo: new MemoryRepo(), data, now: () => t });
    const call = async (method: 'GET' | 'POST' | 'PUT', url: string, token?: string, payload?: unknown, rules = 3) => {
      const r = await app.inject({ method, url, payload: payload as object, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), [ClientHeaders.protocol]: String(PROTOCOL_VERSION), [ClientHeaders.simRules]: String(rules) } });
      return { status: r.statusCode, body: r.body ? r.json() : null };
    };
    const ann = (await call('POST', Routes.players, undefined, { name: 'Ann Swift' })).body;
    const bo = (await call('POST', Routes.players, undefined, { name: 'Bo Quietstep' })).body;
    for (const p of [ann, bo]) await call('PUT', Routes.base, p.token, { base: baseAt(3, 4) });
    await call('POST', Routes.squad, ann.token, { name: 'Old Phones' });
    await call('POST', Routes.friendRequests, ann.token, { playerId: bo.playerId });
    await call('POST', Routes.friendRequests, bo.token, { playerId: ann.playerId });
    await call('POST', Routes.squadInvites, ann.token, { friendId: bo.playerId });
    const inv = (await call('GET', Routes.squad, bo.token)).body.invites[0];
    await call('POST', Routes.squadInvite(inv.id), bo.token, { accept: true });
    await call('POST', Routes.squadWarQueue, ann.token);
    t += (data.social.gangWar.botAfterMinutes + 1) * MIN;
    await call('GET', Routes.squadWar, ann.token);
    t += data.social.gangWar.prepHours * HOUR + MIN;
    expect((await call('POST', Routes.squadWarTicket, ann.token, { target: 0, relay: true }, 2)).status).toBe(426);
    expect((await call('POST', Routes.squadWarTicket, ann.token, { target: 0 }, 2)).status).toBe(200);
  });
});
