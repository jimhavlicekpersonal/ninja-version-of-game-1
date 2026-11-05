/**
 * Gang Wars (roadmap steps 65-66, 70): queue and matching, generated Gangs
 * (labelled, unrated), prep with locked rosters and war layouts, solo and
 * relay strikes with a relay lock, scoring, chests once per member, Gang
 * Rating, and the abuse cases: rematches (win trading), roster swapping,
 * Gangs that are mostly one Alliance, duplicate claims.
 */
import { describe, expect, it } from 'vitest';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { deserialize } from '../../../src/gameplay/sim/save';
import { maxHousing } from '../../../server/core/pvp';
import { maxHousingAtHall } from '../../../src/gameplay/sim/army';
import { baseAt, HOUR, rush, world } from './harness';
import { repoFactories } from './pg';

type W = ReturnType<typeof world>;
type P = Awaited<ReturnType<W['player']>>;
const MIN = 60_000;
const gw = data.social.gangWar;

async function befriend(a: P, b: P) {
  await a.requestFriend({ code: (await b.friends()).code });
  await b.answerFriendRequest((await b.friends()).incoming[0].id, true);
}

async function gang(w: W, name: string, who: string[], keep = 3): Promise<P[]> {
  const ps: P[] = [];
  for (const [i, n] of who.entries()) ps.push(await w.player(n, baseAt(keep, n.length * 7 + i)));
  const [lead, ...rest] = ps;
  await lead.createGang(name);
  for (const p of rest) {
    await befriend(lead, p);
    await lead.inviteToGang(p.id);
    await p.answerGangInvite((await p.myGang()).invites[0].id, true);
  }
  return ps;
}

for (const [label, makeRepo] of repoFactories) {
  describe(`Gang Wars on ${label} storage`, () => {
    it('pairs two Gangs, locks rosters, then solo and relay strikes, scoring, chests and ratings', async () => {
      const w = world({ repo: await makeRepo() });
      const [a1, a2] = await gang(w, 'Owls', ['Ann', 'Abe']);
      const [b1, b2] = await gang(w, 'Foxes', ['Bea', 'Bob']);
      await expect(a2.queueGangWar()).rejects.toMatchObject({ code: 'bad_request' }); // only the leader
      expect((await a1.queueGangWar()).queued).not.toBeNull();
      const found = await b1.queueGangWar();
      expect(found.queued).toBeNull();
      expect(found.war).toMatchObject({ phase: 'prep', size: 2, ours: { name: 'Foxes', generated: false }, theirs: { name: 'Owls' } });
      // Rosters are locked: nobody leaves or joins until the war ends.
      await expect(a2.leaveGang()).rejects.toMatchObject({ code: 'conflict' });
      // Prep: no attacks yet, but a war layout may be set.
      await expect(a1.gangWarTicket(0, false)).rejects.toMatchObject({ code: 'raid_not_live' });
      await a2.setGangWarBase(baseAt(3, 99));
      w.advance(gw.prepHours * HOUR + 1);
      await expect(a2.setGangWarBase(baseAt(3, 98))).rejects.toMatchObject({ code: 'conflict' });
      // Battle day: a solo strike, then a relay of two strikes on one base.
      const solo = await a1.gangWarTicket(0, false);
      const r1 = await a1.gangWarAttack({ ticket: solo.ticket, seed: solo.seed, ...rush(15) });
      expect(r1.combined).toEqual({ stars: r1.result.stars, destruction: r1.result.destruction });
      const first = await a1.gangWarTicket(1, true);
      expect(first.startDamage).toBeUndefined();
      // Two mates can't relay the same base at once.
      await expect(a2.gangWarTicket(1, true)).rejects.toMatchObject({ code: 'conflict' });
      await a1.gangWarAttack({ ticket: first.ticket, seed: first.seed, ...rush(10) });
      await expect(a1.gangWarTicket(0, false)).rejects.toMatchObject({ code: 'no_attacks_left' });
      const second = await a2.gangWarTicket(1, true);
      expect(Object.keys(second.startDamage ?? {}).length).toBeGreaterThan(0); // starts from Ann's damage
      const r3 = await a2.gangWarAttack({ ticket: second.ticket, seed: second.seed, ...rush(10) });
      expect(r3.combined.destruction).toBeGreaterThanOrEqual(r3.result.destruction);
      const view = (await a1.gangWar()).war!;
      expect(view.theirs.bases[1].relay).toMatchObject({ strikes: 2, lastBy: 'Abe', busy: false });
      expect(view.attacks.filter((x) => x.side === 'ours')).toHaveLength(3);
      // The Foxes strike back once.
      const fox = await b2.gangWarTicket(0, false);
      await b2.gangWarAttack({ ticket: fox.ticket, seed: fox.seed, ...rush(5) });
      const seenByFoxes = (await b1.gangWar()).war!;
      expect(seenByFoxes.attacks.filter((x) => x.side === 'theirs')).toHaveLength(3);
      // The end: chests once, ratings move once, Honor never.
      await expect(a1.claimGangWar()).rejects.toMatchObject({ code: 'raid_not_ended' });
      w.advance(gw.battleHours * HOUR);
      const honor = (await a1.me()).trophies;
      const ended = (await a1.gangWar()).war!;
      expect(ended.phase).toBe('ended');
      const c = await a1.claimGangWar();
      expect(c.outcome).toBe(ended.outcome);
      await expect(a1.claimGangWar()).rejects.toMatchObject({ code: 'conflict' }); // duplicate claim
      expect((await a1.gangWar()).war!.claimed).toBe(true);
      expect((await b1.claimGangWar()).outcome).toBe(c.outcome === 'win' ? 'loss' : c.outcome === 'loss' ? 'win' : 'draw');
      expect((await a1.me()).trophies).toBe(honor);
      const ra = (await a1.gangWar()).rating!;
      const rb = (await b1.gangWar()).rating!;
      if (c.outcome === 'win') expect(ra).toBeGreaterThan(rb);
      if (c.outcome === 'loss') expect(ra).toBeLessThan(rb);
      expect(ra + rb).toBeCloseTo(3000, -1); // zero-sum at equal deviations
      // The roster lock lifts after the war.
      await a2.leaveGang();
    }, 30_000);

    it('gives one relay a budget of armies: a full opener leaves half an army for the next strike', async () => {
      const w = world({ repo: await makeRepo() });
      const [a1, a2] = await gang(w, 'Owls', ['Ann', 'Abe']);
      await a1.queueGangWar();
      w.advance(gw.botAfterMinutes * MIN);
      await a1.gangWar();
      w.advance(gw.prepHours * HOUR + 1);
      const per = data.troops.hedgehog_roller.housing;
      const camps = Math.floor(maxHousingAtHall(3, data) / per); // a full camp army
      const shareOf = (n: number) => (n * per) / maxHousing(3, data); // of the whole force (camps and Lodge)
      const t1 = await a1.gangWarTicket(0, true);
      expect(t1.armyShare).toBe(1);
      await a1.gangWarAttack({ ticket: t1.ticket, seed: t1.seed, ...rush(camps) });
      const left = gw.relayHousingShare - shareOf(camps);
      const t2 = await a2.gangWarTicket(0, true);
      expect(t2.armyShare).toBeCloseTo(Math.min(1, left), 5);
      await expect(a2.gangWarAttack({ ticket: t2.ticket, seed: t2.seed, ...rush(camps) })).rejects.toMatchObject({ code: 'bad_request' }); // over the budget
      const half = Math.floor(camps / 2);
      await a2.gangWarAttack({ ticket: t2.ticket, seed: t2.seed, ...rush(half) }); // the same ticket, a smaller army
      const after = left - shareOf(half);
      if (after < 0.1) await expect(a2.gangWarTicket(0, true)).rejects.toMatchObject({ code: 'no_attacks_left' });
      else expect((await a2.gangWarTicket(0, true)).armyShare).toBeCloseTo(after, 5);
    });

    it('offers a generated Gang after a wait, labelled and never rated', async () => {
      const w = world({ repo: await makeRepo() });
      const [a1] = await gang(w, 'Owls', ['Ann', 'Abe']);
      expect((await a1.queueGangWar()).queued).not.toBeNull();
      w.advance(gw.botAfterMinutes * MIN);
      const r = await a1.gangWar();
      expect(r.war).toMatchObject({ theirs: { generated: true, rating: null } });
      expect(r.war!.theirs.name).toMatch(/\(generated\)$/);
      w.advance((gw.prepHours + gw.battleHours) * HOUR + 1);
      const done = await a1.gangWar();
      expect(done.war!.theirs.stars).toBeGreaterThanOrEqual(0); // the generated Gang attacked during the day
      expect(done.rating).toBeNull(); // never rated against a generated Gang
      // A server-held village gets the chest in its economy (once).
      const ann = a1;
      await ann.startVillage();
      const before = deserialize((await ann.getVillage())!.file, data).resources.moonstones;
      const chest = await ann.claimGangWar();
      expect(deserialize((await ann.getVillage())!.file, data).resources.moonstones - before).toBe(chest.chest.moonstones ?? 0);
    });

    it('a player is in one Gang at a time and cannot hop to the enemy during or right after a war', async () => {
      const w = world({ repo: await makeRepo() });
      const [a1, a2] = await gang(w, 'Owls', ['Ann', 'Abe']);
      const [b1] = await gang(w, 'Foxes', ['Bea', 'Bob']);
      await befriend(b1, a2);
      await b1.inviteToGang(a2.id);
      const inv = (await a2.myGang()).invites[0];
      // A shared member is impossible: Abe must leave the Owls first.
      await expect(a2.answerGangInvite(inv.id, true)).rejects.toMatchObject({ code: 'conflict' });
      await a1.queueGangWar();
      await b1.queueGangWar();
      // Roster swapping: nobody leaves, joins or is invited while the war runs.
      await expect(a2.leaveGang()).rejects.toMatchObject({ code: 'conflict' });
      await expect(b1.inviteToGang(a1.id)).rejects.toMatchObject({ code: 'conflict' });
      w.advance((gw.prepHours + gw.battleHours) * HOUR + 1);
      // After the war Abe may leave, but not join the enemy for a day.
      await a2.leaveGang();
      await expect(a2.answerGangInvite(inv.id, true)).rejects.toMatchObject({ code: 'cooldown' });
    });

    it('never rematches recent opponents or pairs Gangs that are mostly one Alliance', async () => {
      const w = world({ repo: await makeRepo() });
      const [a1] = await gang(w, 'Owls', ['Ann', 'Abe']);
      const [b1] = await gang(w, 'Foxes', ['Bea', 'Bob']);
      await a1.queueGangWar();
      await b1.queueGangWar();
      w.advance((gw.prepHours + gw.battleHours) * HOUR + 1);
      // Win trading: right after, the same two Gangs are not paired again.
      await a1.queueGangWar();
      const again = await b1.queueGangWar();
      expect(again.war?.phase === 'prep').toBe(false);
      expect(again.queued).not.toBeNull();
      // Two Gangs whose members are mostly one Alliance are not paired either.
      const w2 = world({ repo: await makeRepo() });
      const [c1, c2] = await gang(w2, 'Cats', ['Cal', 'Cy1']);
      const [d1, d2] = await gang(w2, 'Dogs', ['Dee', 'Dan']);
      const g = await c1.createGrove('One Clan');
      for (const p of [c2, d1, d2]) await p.joinGrove(g.id);
      await c1.queueGangWar();
      expect((await d1.queueGangWar()).queued).not.toBeNull();
    });
  });
}

describe('Gang War pushes (roadmap step 68)', () => {
  it('pushes friend requests, invites, war found, under attack, relay turn and ending soon', async () => {
    const got: { id: string; type: string; title: string }[] = [];
    const w = world({ shared: { push: { enabled: true, notify: (id, m) => void got.push({ id, type: m.type, title: m.title }) } } });
    const [a1, a2] = await gang(w, 'Owls', ['Ann', 'Abe']);
    const [b1, b2] = await gang(w, 'Foxes', ['Bea', 'Bob']);
    expect(got.filter((x) => x.id === a2.id).map((x) => x.title)).toEqual(['Friend request', 'Gang invite']);
    await a1.queueGangWar();
    await b1.queueGangWar();
    for (const p of [a1, a2, b1, b2]) expect(got.some((x) => x.id === p.id && x.type === 'gangWar' && x.title === 'Gang War found!')).toBe(true);
    w.advance(gw.prepHours * HOUR + 1);
    const t = await a1.gangWarTicket(0, true);
    await a1.gangWarAttack({ ticket: t.ticket, seed: t.seed, ...rush(5) });
    const target = (await a1.gangWar()).war!.theirs.bases[0].name === 'Bea' ? b1 : b2;
    expect(got.some((x) => x.id === target.id && x.title === 'Your Gang is under attack')).toBe(true);
    expect(got.some((x) => x.id === a2.id && x.title === 'Your turn in the relay')).toBe(true);
    w.advance(gw.battleHours * HOUR - HOUR);
    expect(await w.core.remindGangWars()).toBe(1);
    expect(await w.core.remindGangWars()).toBe(0); // once per war
    for (const p of [a1, a2, b1, b2]) expect(got.some((x) => x.id === p.id && x.title === 'Gang War ends soon')).toBe(true);
  });
});
