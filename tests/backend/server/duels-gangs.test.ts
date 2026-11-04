/**
 * Friendly Duels (roadmap step 62) and Gangs (step 63).
 * Duels are re-simulated but never ranked: Honor, loot, troops, ratings,
 * shields and server-held villages never change. Gangs are 2-4 friends of
 * the leader, with a 24-hour cooldown after leaving, leadership hand-over,
 * Gang chat and troop gifts, and Gang mates are never matched in PvP.
 */
import { describe, expect, it } from 'vitest';
import { newRating } from '../../../src/gameplay/sim/rating';
import { economyHash } from '../../../src/gameplay/sim/serverEconomy';
import { deserialize } from '../../../src/gameplay/sim/save';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { baseAt, HOUR, rush, world } from './harness';
import { repoFactories } from './pg';

type W = ReturnType<typeof world>;
async function friends(_w: W, a: Awaited<ReturnType<W['player']>>, b: Awaited<ReturnType<W['player']>>) {
  await a.requestFriend({ code: (await b.friends()).code });
  await b.answerFriendRequest((await b.friends()).incoming[0].id, true);
}

for (const [label, makeRepo] of repoFactories) {
  describe(`Friendly Duels on ${label} storage`, () => {
    it('re-simulates a duel and changes nothing ranked: honor, loot, troops, ratings, shields, villages', async () => {
      const w = world({ repo: await makeRepo() });
      const ann = await w.player('Ann', baseAt(2));
      const ben = await w.player('Ben', baseAt(2, 9, 500));
      await expect(ann.duelTicket({ friendId: ben.id })).rejects.toMatchObject({ code: 'not_found' });
      await friends(w, ann, ben);
      await ann.startVillage();
      const t = w.now();
      await w.repo.updatePlayer(ann.id, { ratings: { attack: newRating(t, data.ranks.rating), base: newRating(t, data.ranks.rating) } });
      const before = { ann: await w.repo.getPlayer(ann.id), ben: await w.repo.getPlayer(ben.id), village: (await ann.getVillage())!, ledger: (await ann.ledger(50)).entries.length };
      const tk = await ann.duelTicket({ friendId: ben.id });
      expect(tk.opponent.name).toBe('Ben');
      expect(tk.layout).toBe('live');
      expect(tk.base.buildings.every((b) => !b.loot)).toBe(true); // nothing to win
      const sub = { ticket: tk.ticket, seed: tk.seed, ...rush(20) };
      const r = await ann.submitDuel(sub);
      expect(r.result.hash).toMatch(/./);
      expect(r.rivalry).toMatchObject({ friendId: ben.id, duels: 1, myWins: r.result.stars >= 1 ? 1 : 0, myBest: r.result.stars });
      expect(await ann.submitDuel(sub)).toEqual(r); // a retry gets the same answer
      const after = { ann: await w.repo.getPlayer(ann.id), ben: await w.repo.getPlayer(ben.id), village: (await ann.getVillage())! };
      for (const k of ['trophies', 'shieldUntil', 'ratings', 'honorLoss', 'base'] as const) {
        expect(after.ann![k], `Ann ${k}`).toEqual(before.ann![k]);
        expect(after.ben![k], `Ben ${k}`).toEqual(before.ben![k]);
      }
      expect(after.village.revision).toBe(before.village.revision);
      expect(economyHash(deserialize(after.village.file, data))).toBe(economyHash(deserialize(before.village.file, data)));
      expect((await ann.ledger(50)).entries.length).toBe(before.ledger);
      // Both get the replay; Ben sees it as defended.
      const seen = await ben.duels();
      expect(seen.duels[0]).toMatchObject({ mine: false, attacker: { name: 'Ann' }, result: { stars: r.result.stars } });
      expect(seen.duels[0].replay.deployments).toHaveLength(20);
      expect(seen.rivalries[0]).toMatchObject({ friendId: ann.id, theirBest: r.result.stars });
    });

    it('uses the duel layout a friend set, refused above their Keep', async () => {
      const w = world({ repo: await makeRepo() });
      const ann = await w.player('Ann', baseAt(3));
      const ben = await w.player('Ben', baseAt(3, 9));
      await friends(w, ann, ben);
      await expect(ben.setDuelLayout(baseAt(5, 4))).rejects.toMatchObject({ code: 'bad_request' });
      await ben.setDuelLayout(baseAt(2, 4));
      const tk = await ann.duelTicket({ friendId: ben.id, layout: 'duel' });
      expect(tk.layout).toBe('duel');
      expect(tk.base.hallLevel).toBe(2);
      const r = await ann.submitDuel({ ticket: tk.ticket, seed: tk.seed, ...rush(10) });
      expect((await ann.duels()).duels[0]).toMatchObject({ id: r.duelId, layout: 'duel' });
      expect((await ben.duels()).hasDuelLayout).toBe(true);
      await ben.setDuelLayout(null);
      expect((await ann.duelTicket({ friendId: ben.id, layout: 'duel' })).layout).toBe('live');
    });

    it('decides a challenge on stars, then destruction, or when its 24 hours end', async () => {
      const w = world({ repo: await makeRepo() });
      const ann = await w.player('Ann', baseAt(2));
      const ben = await w.player('Ben', baseAt(2, 9));
      await friends(w, ann, ben);
      const c = await ann.challengeFriend(ben.id);
      await expect(ben.challengeFriend(ann.id)).rejects.toMatchObject({ code: 'conflict' });
      const a = await ann.duelTicket({ friendId: ben.id });
      const ra = await ann.submitDuel({ ticket: a.ticket, seed: a.seed, challengeId: c.id, ...rush(25) });
      expect(ra.challenge).toMatchObject({ myDone: true, theirDone: false, winner: null, status: 'open' });
      const b = await ben.duelTicket({ friendId: ann.id });
      const rb = await ben.submitDuel({ ticket: b.ticket, seed: b.seed, challengeId: c.id, ...rush(2) });
      const want = ra.result.stars !== rb.result.stars ? (rb.result.stars > ra.result.stars ? 'me' : 'them') : rb.result.destruction > ra.result.destruction ? 'me' : rb.result.destruction < ra.result.destruction ? 'them' : 'draw';
      expect(rb.challenge).toMatchObject({ status: 'done', winner: want });
      // Only one side attacks: when the day is over, that side wins.
      const c2 = await ben.challengeFriend(ann.id);
      const b2 = await ben.duelTicket({ friendId: ann.id });
      await ben.submitDuel({ ticket: b2.ticket, seed: b2.seed, challengeId: c2.id, ...rush(5) });
      w.advance(25 * HOUR);
      expect((await ann.duels()).challenges.find((x) => x.id === c2.id)).toMatchObject({ status: 'expired', winner: 'them' });
    });
  });

  describe(`Gangs on ${label} storage`, () => {
    it('invites only the leader\'s friends, up to 4 counting open invites; leaving has a 24-hour cooldown', async () => {
      const w = world({ repo: await makeRepo() });
      const [lea, b, c, d, e] = [await w.player('Lea'), await w.player('Bob'), await w.player('Cat'), await w.player('Dan'), await w.player('Eve')];
      const g = (await lea.createGang('Night Owls')).gang!;
      expect(g).toMatchObject({ name: 'Night Owls', you: { role: 'leader' }, max: 4 });
      await expect(lea.inviteToGang(b.id)).rejects.toMatchObject({ code: 'bad_request' }); // not a friend
      for (const p of [b, c, d, e]) await friends(w, lea, p);
      await lea.inviteToGang(b.id);
      await lea.inviteToGang(c.id);
      await lea.inviteToGang(d.id);
      await expect(lea.inviteToGang(e.id)).rejects.toMatchObject({ code: 'full' });
      // Invitees answer.
      const inv = (await b.myGang()).invites[0];
      expect(inv).toMatchObject({ gang: { name: 'Night Owls', members: 1 }, from: 'Lea' });
      expect((await b.answerGangInvite(inv.id, true)).gang!.members.map((m) => m.name)).toEqual(['Lea', 'Bob']);
      await c.answerGangInvite((await c.myGang()).invites[0].id, false);
      // The leader withdraws Dan's invite, then invites Eve.
      const danInvite = (await lea.myGang()).gang!.invites.find((i) => i.player.name === 'Dan')!;
      await lea.answerGangInvite(danInvite.id, false);
      await lea.inviteToGang(e.id);
      await e.answerGangInvite((await e.myGang()).invites[0].id, true);
      expect((await lea.myGang()).gang!.members).toHaveLength(3);
      // Bob leaves: a day before he can join or start another.
      const left = await b.leaveGang();
      expect(left.gang).toBeNull();
      expect(left.canJoinAt).toBeGreaterThan(w.now());
      await expect(b.createGang('Solo Act')).rejects.toMatchObject({ code: 'cooldown' });
      w.advance(25 * HOUR);
      expect((await b.createGang('Solo Act')).gang!.name).toBe('Solo Act');
      // The friend card and lookup show the Gang.
      expect((await c.lookup('Lea')).gang).toBe('Night Owls');
    });

    it('hands leadership over, passes it on when the leader leaves, and closes an empty Gang', async () => {
      const w = world({ repo: await makeRepo() });
      const [lea, b, c] = [await w.player('Lea'), await w.player('Bob'), await w.player('Cat')];
      for (const p of [b, c]) await friends(w, lea, p);
      await lea.createGang('Night Owls');
      for (const p of [b, c]) {
        await lea.inviteToGang(p.id);
        w.advance(1000);
        await p.answerGangInvite((await p.myGang()).invites[0].id, true);
      }
      await lea.handOverGang(c.id);
      expect((await lea.myGang()).gang!.members.find((m) => m.role === 'leader')!.name).toBe('Cat');
      await c.leaveGang(); // the longest-serving member leads now
      expect((await lea.myGang()).gang!.members.find((m) => m.role === 'leader')!.name).toBe('Lea');
      await b.leaveGang();
      await lea.leaveGang();
      expect(await w.repo.getSquad((await w.repo.squadOf(lea.id))?.id ?? 'none')).toBeNull();
    });

    it('has Gang chat (filtered, reportable) and troop gifts, and Gang mates never meet in PvP', async () => {
      const w = world({ repo: await makeRepo() });
      const lea = await w.player('Lea', baseAt(3));
      const bob = await w.player('Bob', baseAt(3, 5));
      await friends(w, lea, bob);
      await lea.createGang('Night Owls');
      await lea.inviteToGang(bob.id);
      await bob.answerGangInvite((await bob.myGang()).invites[0].id, true);
      const msg = await bob.postGangChat('hello gang');
      expect((await lea.gangChat()).messages.map((m) => m.text)).toContain('hello gang');
      expect((await lea.report({ kind: 'chat', messageId: msg.id, reason: 'spam' })).alreadyReported).toBe(false);
      // A troop request in the Gang, filled by a mate (delivered like Alliance gifts).
      const req = await lea.gangRequestTroops(10);
      await bob.gangDonate(req.id, { troop: 'hedgehog_roller', count: 2, level: 1 });
      expect((await lea.inbox()).donations.map((d) => [d.fromName, d.troop, d.count])).toEqual([['Bob', 'hedgehog_roller', 2]]);
      // The two only exist as each other's opponents, but are never matched.
      w.pastShields();
      for (const p of [lea, bob]) await w.repo.updatePlayer(p.id, { shieldUntil: 0 });
      expect((await lea.match())!.opponent.kind).toBe('bot');
      // Account deletion leaves the Gang.
      await bob.deleteAccount();
      expect((await lea.myGang()).gang!.members.map((m) => m.name)).toEqual(['Lea']);
    });
  });
}
