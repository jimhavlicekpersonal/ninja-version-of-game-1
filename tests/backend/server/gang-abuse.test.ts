/**
 * Abuse cases for Friends, Duels, Gangs and Gang Wars (roadmap step 70):
 * win trading, roster swapping, a shared member, duplicate reports and
 * claims, and strikes outside the battle day.
 */
import { describe, expect, it } from 'vitest';
import { ServerError } from '../../../src/backend/net/ports';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { applyCommand, createNewVillage } from '../../../src/gameplay/sim/village';
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

for (const [label, makeRepo] of repoFactories) {
  async function scene() {
    const w = world({ repo: await makeRepo() });
    const p = async (name: string, seed: number) => w.player(name, baseAt(3, seed));
    const [ann, bo, cy, dee, eve] = [await p('Ann Swift', 1), await p('Bo Quietstep', 2), await p('Cy Ironpine', 3), await p('Dee Swiftwind', 4), await p('Eve Stonepath', 5)];
    const befriend = async (a: typeof ann, b: typeof ann) => {
      await a.sendFriendRequest({ playerId: b.id });
      await b.sendFriendRequest({ playerId: a.id });
    };
    const gang = async (lead: typeof ann, name: string, ...rest: (typeof ann)[]) => {
      await lead.createSquad(name);
      for (const m of rest) {
        await befriend(lead, m);
        await lead.squadInvite(m.id);
        await m.answerSquadInvite((await m.squad()).invites[0].id, true);
      }
    };
    return { w, ann, bo, cy, dee, eve, befriend, gang };
  }

  describe(`abuse cases on ${label} storage`, () => {
    it('win trading: duels never move honor or ratings; two Gangs cannot farm each other', async () => {
      const { w, ann, bo, cy, dee, befriend, gang } = await scene();
      await befriend(ann, bo);
      const before = [await ann.me(), await bo.me()];
      for (let i = 0; i < 5; i++) {
        const t = await ann.duelTicket({ friendId: bo.id });
        await ann.reportDuel({ ticket: t.ticket, seed: t.seed, army: { hedgehog_roller: 1 }, deployments: [] });
      }
      expect((await ann.me()).trophies).toBe(before[0].trophies);
      expect((await bo.me()).trophies).toBe(before[1].trophies);
      // Two Gangs that just fought are not paired again (the last 3 wars), however they queue.
      await gang(ann, 'Gang One', bo);
      await gang(cy, 'Gang Two', dee);
      await ann.gangWarQueue();
      await cy.gangWarQueue();
      w.advance((data.social.gangWar.prepHours + data.social.gangWar.battleHours + 1) * HOUR);
      await cy.gangWarQueue();
      expect((await ann.gangWarQueue()).war).toBeNull();
    });

    it('a shared member is impossible: one Gang per player, and no invites to someone already in one', async () => {
      const { ann, bo, cy, befriend, gang } = await scene();
      await gang(ann, 'Gang One', bo);
      await befriend(cy, bo);
      await cy.createSquad('Gang Two');
      expect((await refusal(cy.squadInvite(bo.id))).code).toBe('conflict');
      expect((await refusal(bo.createSquad('Gang Three'))).code).toBe('conflict');
    });

    it('roster swapping: during a war nobody joins, leaves, or is invited, and only the roster at the start fights', async () => {
      const { w, ann, bo, cy, eve, befriend, gang } = await scene();
      await gang(ann, 'Gang One', bo);
      await befriend(ann, eve);
      await ann.squadInvite(eve.id); // invited before the war...
      await ann.gangWarQueue();
      w.advance((data.social.gangWar.botAfterMinutes + 1) * MIN);
      await ann.gangWar();
      // ...but cannot join while it runs.
      expect((await refusal(eve.answerSquadInvite((await eve.squad()).invites[0].id, true))).code).toBe('conflict');
      expect((await refusal(bo.leaveSquad())).code).toBe('conflict');
      await befriend(ann, cy);
      expect((await refusal(ann.squadInvite(cy.id))).code).toBe('conflict');
      expect((await ann.gangWar()).war!.mine.map((m) => m.name).sort()).toEqual(['Ann Swift', 'Bo Quietstep']);
    });

    it('duplicate reports and claims count once; no strikes outside the battle day', async () => {
      const { w, ann, bo, gang } = await scene();
      await gang(ann, 'Gang One', bo);
      await ann.gangWarQueue();
      w.advance((data.social.gangWar.botAfterMinutes + 1) * MIN);
      await ann.gangWar();
      w.advance(data.social.gangWar.prepHours * HOUR + MIN);
      const t = await ann.gangWarTicket({ target: 0 });
      const sub = { ticket: t.ticket, seed: t.seed, army: { hedgehog_roller: 1 }, deployments: [] };
      const first = await ann.gangWarAttack(sub);
      expect(await ann.gangWarAttack(sub)).toEqual(first);
      expect((await ann.gangWar()).war!.attacksLeft).toBe(data.social.gangWar.attacksPerMember - 1);
      w.advance(data.social.gangWar.battleHours * HOUR);
      expect((await refusal(ann.gangWarTicket({ target: 1 }))).status).toBe(404); // the war is over
      const id = (await ann.gangWar()).recent[0].id;
      const c1 = await ann.gangWarClaim(id);
      const c2 = await ann.gangWarClaim(id);
      expect([c1.alreadyClaimed, c2.alreadyClaimed]).toEqual([false, true]);
      // Ledger audit E13: this war was against a generated Gang, so its chest pays no Jade.
      expect(c1.generated).toBe(true);
      const paid = (generated: boolean) => {
        const v0 = createNewVillage(w.now(), data);
        const r = applyCommand(v0, { type: 'claimGangChest', warId: id, outcome: c1.outcome, generated }, w.now(), data);
        if (!r.ok) throw new Error(r.message);
        return { jade: r.state.resources.moonstones - v0.resources.moonstones, acorns: r.state.resources.acorns - v0.resources.acorns };
      };
      expect(paid(true).jade).toBe(0);
      expect(paid(true).acorns).toBe(paid(false).acorns);
      expect(paid(false).jade).toBeGreaterThan(0);
      // And the game banks a chest once per war, whatever the server says twice.
      const v = createNewVillage(w.now(), data);
      const r1 = applyCommand(v, { type: 'claimGangChest', warId: id, outcome: c1.outcome }, w.now(), data);
      expect(r1.ok).toBe(true);
      const r2 = applyCommand(r1.ok ? r1.state : v, { type: 'claimGangChest', warId: id, outcome: c1.outcome }, w.now(), data);
      expect(r2.ok).toBe(false);
    });

    it('a duel ticket only for its holder, once; challenges only between friends', async () => {
      const { ann, bo, cy, befriend } = await scene();
      await befriend(ann, bo);
      const t = await ann.duelTicket({ friendId: bo.id });
      expect((await refusal(cy.reportDuel({ ticket: t.ticket, seed: t.seed, army: {}, deployments: [] }))).status).toBe(404);
      expect((await refusal(ann.challenge(cy.id))).status).toBe(404);
      await ann.unfriend(bo.id);
      expect((await refusal(ann.duelTicket({ friendId: bo.id }))).status).toBe(404);
    });
  });
}
