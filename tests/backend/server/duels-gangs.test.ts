/**
 * Friendly Duels (roadmap step 62) and Gangs (step 63), on every storage adapter.
 */
import { describe, expect, it } from 'vitest';
import { ServerError } from '../../../src/backend/net/ports';
import { runBattle } from '../../../src/gameplay/sim/battle/battle';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { baseAt, HOUR, rush, world } from './harness';
import { repoFactories } from './pg';

async function refusal(p: Promise<unknown>): Promise<ServerError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ServerError) return e;
    throw e;
  }
  throw new Error('expected a refusal');
}

for (const [label, makeRepo] of repoFactories) {
  async function scene() {
    const w = world({ repo: await makeRepo() });
    const ann = await w.player('Ann Swift', baseAt(3, 3, 400));
    const bo = await w.player('Bo Quietstep', baseAt(3, 5, 400));
    const cy = await w.player('Cy Ironpine', baseAt(2, 7));
    const dee = await w.player('Dee Swiftwind', baseAt(2, 9));
    const eve = await w.player('Eve Stonepath', baseAt(2, 11));
    const befriend = async (a: typeof ann, b: typeof ann) => {
      await a.sendFriendRequest({ playerId: b.id });
      await b.sendFriendRequest({ playerId: a.id });
    };
    return { w, ann, bo, cy, dee, eve, befriend };
  }

  describe(`Friendly Duels on ${label} storage`, () => {
    it('only between friends; re-simulated; nothing is won, lost or rated', { timeout: 20_000 }, async () => {
      const { ann, bo, cy, befriend } = await scene();
      expect((await refusal(ann.duelTicket({ friendId: cy.id }))).status).toBe(404);
      await befriend(ann, bo);
      const before = { ann: await ann.me(), bo: await bo.me() };
      const t = await ann.duelTicket({ friendId: bo.id });
      expect(t.opponent.name).toBe('Bo Quietstep');
      expect(t.base.buildings.every((b) => !Object.values(b.loot ?? {}).some(Boolean))).toBe(true);
      const { army, deployments } = rush(20);
      const r = await ann.reportDuel({ ticket: t.ticket, seed: t.seed, army, deployments });
      expect(r.result.hash).toBe(runBattle({ seed: t.seed, base: t.base, army, infiltration: true }, deployments, data).result.hash);
      expect(r.rivalry).toMatchObject({ friendId: bo.id, duels: 1, wins: r.result.stars >= 1 ? 1 : 0, theirDuels: 0 });
      // A retried report gets the same answer and changes nothing.
      expect((await ann.reportDuel({ ticket: t.ticket, seed: t.seed, army, deployments })).duelId).toBe(r.duelId);
      const after = { ann: await ann.me(), bo: await bo.me() };
      expect(after.ann.trophies).toBe(before.ann.trophies);
      expect(after.bo.trophies).toBe(before.bo.trophies);
      expect(after.bo.shieldUntil).toBe(before.bo.shieldUntil);
      // Both see it, with its replay.
      const mine = await ann.duels();
      const theirs = await bo.duels();
      expect(mine.duels[0]).toMatchObject({ side: 'attack', opponent: { name: 'Bo Quietstep' } });
      expect(theirs.duels[0]).toMatchObject({ side: 'defense', opponent: { name: 'Ann Swift' }, seed: t.seed });
      expect(theirs.rivalries[0]).toMatchObject({ friendId: ann.id, duels: 0, theirDuels: 1 });
    });

    it('can use a separate duel layout, never above the Keep', async () => {
      const { ann, bo, befriend } = await scene();
      await befriend(ann, bo);
      const layout = baseAt(3, 99);
      await bo.setDuelLayout({ base: layout });
      const t = await ann.duelTicket({ friendId: bo.id, layout: 'duel' });
      expect(t.layout).toBe('duel');
      expect(t.base.buildings.map((b) => b.id)).toEqual(layout.buildings.map((b) => b.id));
      expect((await ann.duelTicket({ friendId: bo.id })).layout).toBe('live');
      expect((await refusal(bo.setDuelLayout({ base: baseAt(5, 1) }))).status).toBe(400);
      await bo.setDuelLayout({ base: null });
      expect((await ann.duelTicket({ friendId: bo.id, layout: 'duel' })).layout).toBe('live');
    });

    it('challenges: each side attacks once within 24 hours; more stars, then destruction, wins', async () => {
      const { w, ann, bo, befriend } = await scene();
      await befriend(ann, bo);
      const c = await ann.challenge(bo.id);
      expect((await refusal(bo.challenge(ann.id))).code).toBe('conflict');
      const { army, deployments } = rush(20);
      const ta = await ann.duelTicket({ friendId: bo.id, challengeId: c.id });
      const ra = await ann.reportDuel({ ticket: ta.ticket, seed: ta.seed, army, deployments });
      expect(ra.challenge).toMatchObject({ my: { stars: ra.result.stars }, their: null, outcome: null });
      expect((await refusal(ann.duelTicket({ friendId: bo.id, challengeId: c.id }))).code).toBe('no_attacks_left');
      const tb = await bo.duelTicket({ friendId: ann.id, challengeId: c.id });
      const rb = await bo.reportDuel({ ticket: tb.ticket, seed: tb.seed, army: rush(5).army, deployments: rush(5).deployments });
      const mine = (await ann.challenges()).challenges[0];
      const expected = ra.result.stars - rb.result.stars || ra.result.destruction - rb.result.destruction;
      expect(mine.outcome).toBe(expected > 0 ? 'win' : expected < 0 ? 'loss' : 'draw');
      // A challenge nobody finished is decided when time runs out.
      const c2 = await ann.challenge(bo.id);
      const t2 = await bo.duelTicket({ friendId: ann.id, challengeId: c2.id });
      await bo.reportDuel({ ticket: t2.ticket, seed: t2.seed, army, deployments });
      w.advance(25 * HOUR);
      expect((await ann.challenges()).challenges.find((x) => x.id === c2.id)!.outcome).toBe('loss');
    });
  });

  describe(`Gangs on ${label} storage`, () => {
    it('found, invite friends only, accept, at most 4, and the leader hands over', async () => {
      const { ann, bo, cy, dee, eve, befriend } = await scene();
      for (const p of [bo, cy, dee, eve]) await befriend(ann, p);
      const made = await ann.createSquad('Silent Cranes');
      expect(made.squad).toMatchObject({ name: 'Silent Cranes', max: 4, members: [{ name: 'Ann Swift', role: 'leader' }] });
      expect((await refusal(bo.squadInvite(cy.id))).status).toBe(404); // not in a Gang
      for (const p of [bo, cy, dee, eve]) await ann.squadInvite(p.id);
      for (const p of [bo, cy, dee]) {
        const inv = (await p.squad()).invites[0];
        await p.answerSquadInvite(inv.id, true);
      }
      expect((await refusal(eve.answerSquadInvite((await eve.squad()).invites[0].id, true))).code).toBe('full');
      const gang = (await ann.squad()).squad!;
      expect(gang.members.map((m) => m.name)).toEqual(['Ann Swift', 'Bo Quietstep', 'Cy Ironpine', 'Dee Swiftwind']);
      await ann.squadLeader(bo.id);
      expect((await refusal(ann.squadInvite(eve.id))).status).toBe(403);
      expect((await bo.squad()).squad!.members.find((m) => m.role === 'leader')!.name).toBe('Bo Quietstep');
    });

    it('an invite needs a friendship with the leader; leaving waits 24 hours to join again', async () => {
      const { w, ann, bo, cy, befriend } = await scene();
      await befriend(ann, bo);
      expect((await refusal(ann.createSquad('No'))).status).toBe(400);
      await ann.createSquad('Iron Lotus');
      expect((await refusal(ann.squadInvite(cy.id))).status).toBe(404);
      await ann.squadInvite(bo.id);
      await bo.answerSquadInvite((await bo.squad()).invites[0].id, true);
      await bo.leaveSquad();
      expect((await refusal(bo.createSquad('Bo Gang'))).code).toBe('cooldown');
      w.advance(25 * HOUR);
      expect((await bo.createSquad('Bo Gang')).squad!.name).toBe('Bo Gang');
    });

    it('a leaving leader hands over to the longest-serving member; the last one out closes it', async () => {
      const { w, ann, bo, cy, befriend } = await scene();
      await befriend(ann, bo);
      await befriend(ann, cy);
      await ann.createSquad('Ember Gate');
      await ann.squadInvite(bo.id);
      await bo.answerSquadInvite((await bo.squad()).invites[0].id, true);
      w.advance(HOUR);
      await ann.squadInvite(cy.id);
      await cy.answerSquadInvite((await cy.squad()).invites[0].id, true);
      await ann.leaveSquad();
      const gang = (await bo.squad()).squad!;
      expect(gang.members.find((m) => m.role === 'leader')!.name).toBe('Bo Quietstep');
      await bo.leaveSquad();
      await cy.leaveSquad();
      expect((await cy.squad()).squad).toBeNull();
    });

    it('Gang chat is filtered, reportable and blockable; troop gifts arrive in the usual inbox', async () => {
      const { ann, bo, befriend } = await scene();
      await befriend(ann, bo);
      await ann.createSquad('Frost Ridge');
      await ann.squadInvite(bo.id);
      await bo.answerSquadInvite((await bo.squad()).invites[0].id, true);
      const msg = await bo.postSquadChat('Ready for war?');
      expect((await ann.squadChat()).messages.some((m) => m.id === msg.id)).toBe(true);
      expect((await ann.report({ kind: 'chat', messageId: msg.id, reason: 'spam' })).id).toBeTruthy();
      await ann.block(bo.id);
      expect((await ann.squadChat()).messages.some((m) => m.id === msg.id)).toBe(false);
      await ann.unblock(bo.id);
      const req = await bo.squadRequestTroops(10);
      await ann.squadDonate(req.id, { troop: 'hedgehog_roller', count: 2, level: 1 });
      expect((await bo.inbox()).donations).toMatchObject([{ fromName: 'Ann Swift', troop: 'hedgehog_roller', count: 2 }]);
    });

    it('deleting an account hands leadership over first', async () => {
      const { ann, bo, befriend } = await scene();
      await befriend(ann, bo);
      await ann.createSquad('Pine Shrine');
      await ann.squadInvite(bo.id);
      await bo.answerSquadInvite((await bo.squad()).invites[0].id, true);
      await ann.deleteAccount();
      expect((await bo.squad()).squad!.members).toMatchObject([{ name: 'Bo Quietstep', role: 'leader' }]);
    });
  });
}
