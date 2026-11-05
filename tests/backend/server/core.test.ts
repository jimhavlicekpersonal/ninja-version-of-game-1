/**
 * The server core, through the same ServerPort the game uses (in-process
 * adapter). Checks that online play follows the game-theory rules: hall
 * window, trophy-based matching, loot penalty and storage caps, shield tiers,
 * Grove rules and the weekly Grove Raid.
 */
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../server/core';
import { InProcessServerAdapter } from '../../../server/inProcess';
import { ServerError } from '../../../src/backend/net/ports';
import { runBattle } from '../../../src/gameplay/sim/battle/battle';
import { defaultData } from '../../../src/gameplay/sim/data';
import { shieldHoursFor, storageLootCap } from '../../../src/gameplay/sim/defense';
import { hallWindow, lootPenalty } from '../../../src/gameplay/sim/matchmaking';
import type { GameData } from '../../../src/gameplay/sim/types';
import { HOUR, baseAt, rush, startSeed, sumLoot, world } from './harness';
import { repoFactories } from './pg';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ServerError || e instanceof ApiError) return e.code;
    throw e;
  }
  return 'ok';
}

const noTroops = { army: {}, deployments: [], endTick: 1 };

for (const [label, makeRepo] of repoFactories) {
  const W = async (o: { data?: GameData } = {}) => world({ ...o, repo: await makeRepo() });

  describe(`server core on ${label} storage`, () => {

    describe('PvP matchmaking on the server', () => {
      it('falls back to a generated base of matched strength when no real player fits', async () => {
        const w = await W();
        const a = await w.player('Ann', baseAt(2));
        const m = (await a.match())!;
        expect(m.opponent.kind).toBe('bot');
        const win = hallWindow(2, w.data);
        expect(m.base.hallLevel).toBeGreaterThanOrEqual(win.min);
        expect(m.base.hallLevel).toBeLessThanOrEqual(win.max);
        expect(m.expiresAt).toBe(w.now() + HOUR);
        // A bot battle still counts for trophies but leaves no defense record.
        const r = await a.submitAttack({ ticket: m.ticket, seed: await startSeed(a, m.ticket), ...rush() });
        expect(r.playerTrophies).toBe(Math.max(0, r.trophies));
        expect(w.repo).toBeTruthy();
      });

      it('only matches real players within one Elder Toadstool level, and not while shielded', async () => {
        const w = await W();
        const a = await w.player('Ann', baseAt(1));
        await w.player('Three', baseAt(3));
        await w.player('Two', baseAt(2));
        expect((await a.match())!.opponent.kind).toBe('bot'); // everyone is still under the new-player shield
        w.pastShields();
        const m = (await a.match())!;
        expect(m.opponent).toMatchObject({ kind: 'player', name: 'Two', hallLevel: 2 });
      });

      it('reserves a matched base for its attacker for 5 minutes', async () => {
        const w = await W();
        const a = await w.player('Ann', baseAt(1));
        const b = await w.player('Ben', baseAt(1, 5));
        await w.player('Two', baseAt(2));
        w.pastShields();
        // Ann and Ben would match each other, so put them in one Grove (Grove mates never match).
        const g = await a.createGrove('Mossy Hollow');
        await b.joinGrove(g.id);
        expect((await a.match())!.opponent.name).toBe('Two');
        expect((await b.match())!.opponent.kind).toBe('bot');
        w.advance(6 * 60_000);
        expect((await b.match())!.opponent.name).toBe('Two');
      });

      it('does not offer the same player again within an hour', async () => {
        const w = await W();
        const a = await w.player('Ann', baseAt(1));
        await w.player('Two', baseAt(2));
        w.pastShields();
        const m = (await a.match())!;
        expect(m.opponent.name).toBe('Two');
        await a.submitAttack({ ticket: m.ticket, seed: await startSeed(a, m.ticket), ...noTroops }); // 0% destruction: no shield
        expect((await a.match())!.opponent.kind).toBe('bot');
        w.advance(HOUR + 60_000);
        expect((await a.match())!.opponent.name).toBe('Two');
      });

      it('caps storage loot at upload and applies the loot penalty to higher-hall attackers', async () => {
        const w = await W();
        const two = await w.player('Two', baseAt(2, 22, 1_000_000));
        const stored = (await w.repo.getPlayer(two.id))!.base!;
        const stores = stored.buildings.filter((b) => !w.data.buildings[b.type].produces);
        expect(stores.reduce((s, b) => s + (b.loot?.acorns ?? 0), 0)).toBeLessThanOrEqual(storageLootCap(2, w.data));
        for (const b of stored.buildings) {
          const def = w.data.buildings[b.type];
          if (!def.produces) continue;
          const rate = def.levels[b.level - 1].ratePerHour ?? 0;
          expect(b.loot?.[def.produces] ?? 0).toBeLessThanOrEqual(rate * w.data.economy.collectorHoursCap * w.data.economy.raidableUncollectedFraction);
        }
        const a = await w.player('Ann', baseAt(3));
        w.pastShields();
        const m = (await a.match())!;
        expect(m.opponent.name).toBe('Two');
        const k = lootPenalty(3, 2, w.data);
        expect(k).toBeLessThan(1);
        m.base.buildings.forEach((b, i) => expect(b.loot?.acorns ?? 0).toBe(Math.floor((stored.buildings[i].loot?.acorns ?? 0) * k)));
        expect(sumLoot(m.base)).toBeLessThan(sumLoot(stored));
      });

      it('re-simulates attacks, moves trophies both ways and shields the defender by destruction tier', async () => {
        const w = await W();
        const a = await w.player('Ann', baseAt(1));
        const d = await w.player('Dot', baseAt(1, 77));
        w.pastShields();
        const m = (await a.match())!;
        expect(m.opponent.name).toBe('Dot');
        const { army, deployments } = rush(20);
        const seed = await startSeed(a, m.ticket);
        const r = await a.submitAttack({ ticket: m.ticket, seed, army, deployments });
        const local = runBattle({ seed, base: m.base, army, infiltration: true }, deployments, w.data).result;
        expect(r.result.hash).toBe(local.hash);
        expect((await a.me()).trophies).toBe(r.playerTrophies);
        const dp = await d.me();
        expect(dp.trophies).toBe(Math.max(0, -r.trophies));
        const hours = shieldHoursFor(local.destruction, w.data);
        if (hours) expect(dp.shieldUntil).toBe(w.now() + hours * HOUR);
        const defs = (await d.defenses(0)).defenses;
        expect(defs).toHaveLength(1);
        expect(defs[0]).toMatchObject({ attackerName: 'Ann', trophies: -r.trophies, seed });
      });

      it('issues the battle seed with each ticket and re-simulates with it, never with one the client picks', async () => {
        const w = await W();
        const a = await w.player('Ann', baseAt(1));
        const m1 = (await a.match())!;
        // Ledger audit A1: the match never carries the seed; starting the raid does (and again on a retry).
        expect(m1.seed).toBeUndefined();
        // Started, so the next match keeps it open (an unstarted ticket is voided by a new match: re-audit).
        const s1 = await startSeed(a, m1.ticket);
        expect(await startSeed(a, m1.ticket)).toBe(s1);
        const m2 = (await a.match())!;
        expect(s1).not.toBe(await startSeed(a, m2.ticket));
        const { army, deployments } = rush(20);
        // A battle played with another seed is refused, and the ticket stays usable.
        expect(await code(a.submitAttack({ ticket: m1.ticket, seed: (s1 + 1) >>> 0, army, deployments }))).toBe('bad_request');
        const r = await a.submitAttack({ ticket: m1.ticket, seed: s1, army, deployments });
        expect(r.result.hash).toBe(runBattle({ seed: s1, base: m1.base, army, infiltration: true }, deployments, w.data).result.hash);
        expect(await a.submitAttack({ ticket: m1.ticket, seed: s1, army, deployments })).toEqual(r);
      });

      it('keeps the client seed for a ticket issued before server seeds', async () => {
        const w = await W();
        const a = await w.player('Ann', baseAt(1));
        const m = (await a.match())!;
        const legacy = { ...(await w.repo.getTicket(m.ticket))!, id: 'legacy-ticket' };
        delete legacy.seed;
        await w.repo.createTicket(legacy);
        const { army, deployments } = rush(20);
        const r = await a.submitAttack({ ticket: 'legacy-ticket', seed: 77, army, deployments });
        expect(r.result.hash).toBe(runBattle({ seed: 77, base: m.base, army, infiltration: true }, deployments, w.data).result.hash);
      });

      it('keeps defense replays for 30 days, then retention removes them', async () => {
        const w = await W();
        const a = await w.player('Ann', baseAt(1));
        const d = await w.player('Dot', baseAt(1, 77));
        w.pastShields();
        const m = (await a.match())!;
        expect(m.opponent.name).toBe('Dot');
        await a.submitAttack({ ticket: m.ticket, seed: await startSeed(a, m.ticket), ...noTroops });
        w.advance(29 * 24 * HOUR);
        await w.core.prune();
        expect((await d.defenses(0)).defenses).toHaveLength(1);
        w.advance(2 * 24 * HOUR);
        expect(await w.core.prune()).toMatchObject({ attacks: 1 });
        expect((await d.defenses(0)).defenses).toHaveLength(0);
      });

      it('refuses late, reused and foreign tickets, and impossible armies', async () => {
        const w = await W();
        const a = await w.player('Ann', baseAt(1));
        const b = await w.player('Ben', baseAt(1, 4));
        const m1 = (await a.match())!;
        expect(await code(b.startAttack(m1.ticket))).toBe('not_found');
        const s1 = await startSeed(a, m1.ticket);
        expect(await code(b.submitAttack({ ticket: m1.ticket, seed: s1, ...noTroops }))).toBe('not_found');
        expect(await code(a.submitAttack({ ticket: m1.ticket, seed: s1, army: { beetle_brute: 500 }, deployments: [] }))).toBe('bad_request');
        expect(await code(a.submitAttack({ ticket: m1.ticket, seed: s1, army: { hedgehog_roller: 5 }, levels: { hedgehog_roller: 4 }, deployments: [] }))).toBe('bad_request');
        const first = await a.submitAttack({ ticket: m1.ticket, seed: s1, ...noTroops });
        // A repeated report (lost answer, retry) gets the first answer back and changes nothing.
        expect(await a.submitAttack({ ticket: m1.ticket, seed: s1, ...noTroops })).toEqual(first);
        expect((await a.me()).trophies).toBe(first.playerTrophies);
        // A reported ticket cannot be started again.
        expect(await code(a.startAttack(m1.ticket))).toBe('conflict');
        const m2 = (await a.match())!;
        const s2 = await startSeed(a, m2.ticket);
        // A raid reported after a long outage still counts (audit R02: up to 3 days after the ticket's hour) …
        w.advance(HOUR + 48 * HOUR);
        expect((await a.submitAttack({ ticket: m2.ticket, seed: s2, ...noTroops })).result).toBeDefined();
        // … but not forever.
        const m3 = (await a.match())!;
        const s3 = await startSeed(a, m3.ticket);
        w.advance(HOUR + 72 * HOUR + 1);
        expect(await code(a.submitAttack({ ticket: m3.ticket, seed: s3, ...noTroops }))).toBe('expired');
      });

      it('ranks players with bases on the leaderboard', async () => {
        const w = await W();
        const a = await w.player('Ann', baseAt(1));
        await w.player('Ben', baseAt(1, 4));
        await w.repo.updatePlayer(a.id, { trophies: 300 });
        const lb = await a.leaderboard(10);
        expect(lb.players.map((p) => p.name)).toEqual(['Ann', 'Ben']);
        expect(lb.me).toEqual({ rank: 1, trophies: 300 });
      });
    });

    describe('Groves on the server', () => {
      const small: GameData = { ...defaultData, social: { ...defaultData.social, membersMax: 3 } };

      it('creates, lists and joins Groves, and refuses full ones and double membership', async () => {
        const w = await W({ data: small });
        const [a, b, c, d] = await Promise.all(['Ann', 'Ben', 'Cat', 'Dan'].map((n) => w.player(n, baseAt(1))));
        const g = await a.createGrove('Mossy Hollow');
        expect(g.you.role).toBe('Leader');
        expect(await code(a.createGrove('Second'))).toBe('already_in_grove');
        expect((await b.listGroves()).groves.map((x) => x.name)).toEqual(['Mossy Hollow']);
        await b.joinGrove(g.id);
        await c.joinGrove(g.id);
        expect((await d.listGroves()).groves).toHaveLength(0); // full Groves are not listed
        expect(await code(d.joinGrove(g.id))).toBe('full');
        expect(await d.myGrove()).toBeNull();
        expect((await a.myGrove())!.members).toHaveLength(3);
        expect((await a.me()).groveId).toBe(g.id);
      });

      it('hands leadership to the longest-serving member when the Leader leaves', async () => {
        const w = await W();
        const a = await w.player('Ann');
        const b = await w.player('Ben');
        const c = await w.player('Cat');
        const g = await a.createGrove('Fern Gully');
        await b.joinGrove(g.id);
        w.advance(1000);
        await c.joinGrove(g.id);
        await a.leaveGrove();
        const view = (await c.myGrove())!;
        expect(view.members.find((m) => m.name === 'Ben')!.role).toBe('Leader');
        expect(await a.myGrove()).toBeNull();
        expect((await a.me()).groveId).toBeNull();
      });

      it('filters chat, limits how fast one player posts and pages with a cursor', async () => {
        const w = await W();
        const a = await w.player('Ann');
        const b = await w.player('Ben');
        const g = await a.createGrove('Puddle Pals');
        await b.joinGrove(g.id);
        const first = await b.chat();
        const sent = await a.postChat('you are a stupid idiot');
        expect(sent.text).not.toMatch(/stupid|idiot/);
        const later = await b.chat(first.cursor);
        expect(later.messages.map((m) => m.id)).toEqual([sent.id]);
        expect(later.messages[0].from!.name).toBe('Ann');
        for (let i = 1; i < w.data.social.chatPerMinute; i++) await a.postChat(`hi ${i}`);
        expect(await code(a.postChat('one more'))).toBe('cooldown');
        w.advance(61_000);
        expect(await code(a.postChat('ok again'))).toBe('ok');
        expect(await code(a.postChat('   '))).toBe('bad_request');
        expect(await code(a.postChat('x'.repeat(201)))).toBe('bad_request'); // longer than any message the game can type
      });

      it('runs troop requests and donations end to end', async () => {
        const w = await W();
        const a = await w.player('Ann', baseAt(3));
        const b = await w.player('Ben', baseAt(3, 8));
        const g = await a.createGrove('Toad Hall');
        await b.joinGrove(g.id);
        const req = await a.requestTroops(10);
        expect(req.size).toBe(10);
        expect(await code(a.requestTroops(10))).toBe('cooldown');
        expect(await code(a.donate(req.id, { troop: 'hedgehog_roller', count: 1, level: 1 }))).toBe('bad_request'); // not your own
        const list = await b.requests();
        expect(list.requests).toHaveLength(1);
        expect(list.requests[0].mine).toBe(false);
        const don = await b.donate(req.id, { troop: 'beetle_brute', count: 1, level: 1 });
        expect(don.request.filled).toBe(5);
        expect(don.xp).toBe(5 * w.data.social.xpPerHousing);
        expect(await code(b.donate(req.id, { troop: 'beetle_brute', count: 2, level: 1 }))).toBe('full');
        expect(await code(b.donate(req.id, { troop: 'hedgehog_roller', count: 1, level: 9 }))).toBe('bad_request');
        await b.donate(req.id, { troop: 'hedgehog_roller', count: 5, level: 1 });
        expect((await b.requests()).requests).toHaveLength(0); // filled requests close
        const inbox = await a.inbox();
        expect(inbox.donations.map((d) => [d.fromName, d.troop, d.count])).toEqual([
          ['Ben', 'beetle_brute', 1],
          ['Ben', 'hedgehog_roller', 5],
        ]);
        await a.ackInbox(inbox.donations.map((d) => d.id));
        expect((await a.inbox()).donations).toHaveLength(0);
        expect((await a.myGrove())!.members.find((m) => m.name === 'Ben')!.xp).toBe(10 * w.data.social.xpPerHousing);
        w.advance(w.data.social.requestCooldownMinutes * 60_000);
        expect(await code(a.requestTroops(10))).toBe('ok');
      });
    });

    describe('Grove Raids on the server', () => {
      it('pairs two real Groves, scores best stars per base and pays each member once', async () => {
        const w = await W();
        const [ann, ben, cat, dan] = await Promise.all([w.player('Ann', baseAt(1, 1)), w.player('Ben', baseAt(1, 2)), w.player('Cat', baseAt(1, 3)), w.player('Dan', baseAt(1, 4))]);
        const ga = await ann.createGrove('Acorn Army');
        await ben.joinGrove(ga.id);
        const gb = await cat.createGrove('Beetle Band');
        await dan.joinGrove(gb.id);
        const before = await ann.raid();
        expect(before.phase).not.toBe('live');
        const week = w.intoRaid(1);
        await cat.me(); // Beetle Band was seen recently
        const view = await ann.raid();
        expect(view).toMatchObject({ phase: 'live', week, eligible: true, attacksLeft: 2 });
        expect(view.opponent).toMatchObject({ name: 'Beetle Band', kind: 'grove' });
        expect(view.opponent!.members.map((m) => m.name).sort()).toEqual(['Cat', 'Dan']);
        expect((await cat.raid()).opponent!.name).toBe('Acorn Army');

        const stars: number[] = [];
        const destruction: number[] = [];
        for (const who of [ann, ann, ben]) {
          const t = await who.raidTicket(0);
          expect(Number.isInteger(t.seed)).toBe(true);
          expect(await code(who.submitRaidAttack({ ticket: t.ticket, seed: (t.seed + 1) >>> 0, ...rush(20) }))).toBe('bad_request');
          expect(t.base.buildings.every((b) => !Object.values(b.loot ?? {}).some((v) => v))).toBe(true); // no loot in Grove Raids
          const r = await who.submitRaidAttack({ ticket: t.ticket, seed: t.seed, ...rush(20) });
          stars.push(r.stars);
          destruction.push(r.result.destruction);
        }
        expect(await code(ann.raidTicket(1))).toBe('no_attacks_left');
        const best = Math.max(...stars);
        expect((await ann.raid()).enemyBaseStars[0]).toBe(best);
        expect((await ann.raid()).ours).toBe(best);
        expect((await cat.raid()).theirs).toBe(best);
        expect((await ben.raid()).attacksLeft).toBe(1);

        expect(await code(ann.claimRaid(week))).toBe('raid_not_ended');
        w.setTime(w.raidEnd(week) + 1);
        const done = await ann.raid();
        // Equal stars are decided by destruction (audit F34), so 0 stars with some destruction still wins.
        expect(done.result).toMatchObject({ ours: best, theirs: 0, outcome: best > 0 || Math.max(...destruction) > 0 ? 'win' : 'draw' });
        expect(done.chests).toEqual([{ week, claimed: false }]);
        const claim = await ann.claimRaid(week);
        expect(claim).toMatchObject({ week, outcome: done.result!.outcome, alreadyClaimed: false });
        expect((await ann.claimRaid(week)).alreadyClaimed).toBe(true);
        expect((await ann.raid()).claimed).toBe(true);
        expect((await ann.raid()).chests).toEqual([{ week, claimed: true }]);
        expect((await cat.claimRaid(week)).outcome).toBe(best > 0 ? 'loss' : 'draw');
      });

      it('gives a Grove with no free rival a bot Grove whose stars grow during the event', async () => {
        const w = await W();
        const fay = await w.player('Fay', baseAt(2));
        const g = await fay.createGrove('Lonely Leaf');
        for (const n of ['Gus', 'Hal', 'Ivy']) await (await w.player(n, baseAt(2, n.length * 7))).joinGrove(g.id);
        const week = w.intoRaid(0.01);
        const early = await fay.raid();
        expect(early.opponent!.kind).toBe('bot');
        expect(early.opponent!.members.length).toBeGreaterThan(0);
        expect((await fay.raid()).theirs).toBe(early.theirs); // deterministic
        w.setTime(w.raidEnd(week) - 1);
        const late = await fay.raid();
        expect(late.theirs).toBeGreaterThanOrEqual(early.theirs);
        expect(late.theirs).toBeGreaterThan(0);
        expect(late.opponent!.name).toBe(early.opponent!.name);
      });

      it('keeps members who join during a raid out of it until next week', async () => {
        const w = await W();
        const ann = await w.player('Ann', baseAt(1));
        const g = await ann.createGrove('Acorn Army');
        const week = w.intoRaid(2);
        const eve = await w.player('Eve', baseAt(1, 9));
        await eve.joinGrove(g.id);
        const v = await eve.raid();
        expect(v).toMatchObject({ eligible: false, attacksLeft: 0 });
        expect(await code(eve.raidTicket(0))).toBe('no_attacks_left');
        w.setTime(w.raidEnd(week) + 1);
        expect((await eve.raid()).chests).toEqual([]);
        expect(await code(eve.claimRaid(week))).toBe('not_found');
        expect((await ann.claimRaid(week)).alreadyClaimed).toBe(false);
      });
    });

    describe('account deletion (roadmap step 14)', () => {
      it('deletes the account and what is only theirs, and keeps what others hold under "Deleted player"', async () => {
        const w = await W();
        const ann = await w.player('Ann', baseAt(3));
        const ben = await w.player('Ben', baseAt(3, 8));
        const dot = await w.player('Dot', baseAt(3, 9));
        const g = await ann.createGrove('Toad Hall');
        await ben.joinGrove(g.id);
        await ann.postChat('hello from Ann');
        // Ann gifts Ben troops, and asks for some herself (Ben fills it).
        const benAsk = await ben.requestTroops(10);
        await ann.donate(benAsk.id, { troop: 'hedgehog_roller', count: 2, level: 1 });
        const annAsk = await ann.requestTroops(10);
        await ben.donate(annAsk.id, { troop: 'hedgehog_roller', count: 1, level: 1 });
        // Ann raids Dot; Dot raids Ann.
        w.pastShields();
        const raid = async (from: typeof ann, target: string) => {
          for (let i = 0; i < 6; i++) {
            const m = (await from.match())!;
            if (m.opponent.name === target) return from.submitAttack({ ticket: m.ticket, seed: await startSeed(from, m.ticket), ...noTroops });
          }
          throw new Error(`never matched ${target}`);
        };
        await raid(ann, 'Dot');
        await w.repo.updatePlayer(ann.id, { shieldUntil: 0 });
        await raid(dot, 'Ann');
        // Ann is on an Alliance War roster (as an enemy base of another Alliance).
        await w.repo.createPairings([{ week: 1, groveId: 'other', opponentGroveId: g.id, opponentName: 'Toad Hall', botSeed: 0, roster: [{ index: 0, name: 'Ann', hallLevel: 3, trophies: 0, base: { ...baseAt(3), name: 'Ann' }, playerId: ann.id }], ourSize: 1, ourHall: 3, createdAt: w.now() }]);
        const annToken = ann.credentials;

        await ann.deleteAccount();

        expect(ann.hasIdentity()).toBe(false);
        expect(await w.repo.getPlayer(ann.id)).toBeNull();
        const stale = new InProcessServerAdapter(w.core, annToken);
        expect(await code(stale.me())).toBe('unauthorized');
        // Ben leads the Alliance now; nothing there names Ann.
        const view = (await ben.myGrove())!;
        expect(view.members.map((m) => [m.name, m.role])).toEqual([['Ben', 'Leader']]);
        const chat = (await ben.chat()).messages;
        expect(chat.some((m) => m.from?.id === ann.id)).toBe(false);
        expect(chat.map((m) => m.text).join('|')).not.toMatch(/\bAnn\b/);
        expect(chat.map((m) => m.text)).toContain('A member left the Alliance.');
        expect(chat.find((m) => m.kind === 'donation' && m.from?.id === ben.id)!.text).toMatch(/to Deleted player\.$/);
        // Gifts Ann sent stay with Ben, without her name; her own request is gone.
        expect((await ben.inbox()).donations.map((d) => d.fromName)).toEqual(['Deleted player']);
        expect((await ben.requests()).requests).toHaveLength(0);
        // Dot keeps the replay of Ann's raid, anonymised; raids on Ann are gone.
        expect((await dot.defenses(0)).defenses.map((d) => d.attackerName)).toEqual(['Deleted player']);
        expect(await w.repo.defensesFor(ann.id, 0, 10)).toEqual([]);
        // The war roster keeps the base (the score depends on it), without her name.
        const roster = (await w.repo.getPairing(1, 'other'))!.roster[0];
        expect(roster).toMatchObject({ playerId: null, name: 'Deleted player', base: { name: 'Deleted player' } });
        // Opponents can no longer be matched against her.
        for (let i = 0; i < 4; i++) expect((await dot.match())!.opponent.name).not.toBe('Ann');
      });

      it('takes web deletion requests without saying whether the player exists; staff carry out only verified ones', async () => {
        const w = await W();
        const ann = await w.player('Ann', baseAt(1));
        const ben = await w.player('Ben', baseAt(1));
        expect(await code(w.core.requestDeletion({}))).toBe('bad_request');
        // Re-audit: a Player ID alone proves nothing (other players see it); the one-time code from Settings does.
        const { code: annCode, expiresAt } = await ann.deletionCode!();
        expect(expiresAt).toBe(w.now() + 30 * 24 * 3_600_000);
        const real = await w.core.requestDeletion({ playerId: ann.id, contact: 'ann@example.com', note: 'lost my phone', code: annCode });
        const fake = await w.core.requestDeletion({ playerId: 'nobody', name: 'Ghost', code: annCode });
        const wrong = await w.core.requestDeletion({ playerId: ben.id, code: 'AAAAA-AAAAA' });
        expect(Object.keys(real).sort()).toEqual(['id', 'verified']);
        expect([real.verified, fake.verified, wrong.verified]).toEqual([true, false, false]);
        // The code is used up.
        expect((await w.core.requestDeletion({ playerId: ann.id, code: annCode })).verified).toBe(false);
        const queue = (await w.core.admin.deletionQueue('open')).requests;
        // An email sent by an old page is not kept (GLOBAL-019).
        expect(JSON.stringify(queue)).not.toContain('ann@example.com');
        expect(queue.map((r) => [r.id, r.player?.name ?? null, r.verified])).toEqual([
          [real.id, 'Ann', true],
          [fake.id, null, false],
          [wrong.id, 'Ben', false],
          [expect.any(String), 'Ann', false],
        ]);
        // Unverified: no plain delete; an override needs a note saying how ownership was checked.
        expect(await code(w.core.admin.resolveDeletion(wrong.id, 'delete', ''))).toBe('conflict');
        expect(await code(w.core.admin.resolveDeletion(wrong.id, 'override', 'ok'))).toBe('bad_request');
        expect(await w.repo.getPlayer(ben.id)).not.toBeNull();
        expect(await w.core.admin.resolveDeletion(real.id, 'delete', '')).toMatchObject({ status: 'done', resolution: 'Account deleted.' });
        expect(await w.repo.getPlayer(ann.id)).toBeNull();
        expect(await code(w.core.admin.resolveDeletion(real.id, 'delete', ''))).toBe('conflict');
        expect(await code(w.core.admin.resolveDeletion(fake.id, 'maybe', ''))).toBe('bad_request');
        expect(await w.core.admin.resolveDeletion(fake.id, 'reject', 'Could not confirm ownership.')).toMatchObject({ status: 'rejected', resolution: 'Could not confirm ownership.' });
        expect(await w.core.admin.resolveDeletion(wrong.id, 'override', 'Owner wrote from the Apple ID linked to this account.')).toMatchObject({ status: 'done', resolution: 'Staff override: Owner wrote from the Apple ID linked to this account.' });
        expect(await w.repo.getPlayer(ben.id)).toBeNull();
        expect((await w.core.admin.deletionQueue('open')).requests).toHaveLength(1);
        expect((await w.core.admin.deletionQueue('all')).requests).toHaveLength(4);
      });

      it('a deletion code expires after 30 days and a new one replaces the old', async () => {
        const w = await W();
        const ann = await w.player('Ann', baseAt(1));
        const first = await ann.deletionCode!();
        const second = await ann.deletionCode!();
        expect((await w.core.requestDeletion({ playerId: ann.id, code: first.code })).verified).toBe(false);
        w.advance(31 * 24 * 3_600_000);
        expect((await w.core.requestDeletion({ playerId: ann.id, code: second.code })).verified).toBe(false);
        const third = await ann.deletionCode!();
        expect((await w.core.requestDeletion({ playerId: ann.id, code: third.code.replace('-', ' ') })).verified).toBe(true);
      });
    });

    describe('reports, blocks and the moderation queue (roadmap step 15)', () => {
      async function alliance(w: Awaited<ReturnType<typeof W>>, names: string[]) {
        const ps = [];
        for (const n of names) ps.push(await w.player(n, baseAt(3, n.length)));
        const g = await ps[0].createGrove('Toad Hall');
        for (const p of ps.slice(1)) await p.joinGrove(g.id);
        return ps;
      }

      it('reports a message with its text, hides it once three players report it, and staff decide', async () => {
        const w = await W();
        const [ann, ben, cat, dan, eve] = await alliance(w, ['Ann', 'Ben', 'Cat', 'Dan', 'Eve']);
        const zed = await w.player('Zed');
        const msg = await ann.postChat('give me your gold or else');
        expect(await code(ben.report({ kind: 'chat', messageId: msg.id, reason: 'nope' as never }))).toBe('bad_request');
        expect(await code(ann.report({ kind: 'chat', messageId: msg.id, reason: 'harassment' }))).toBe('bad_request'); // your own
        expect(await code(zed.report({ kind: 'chat', messageId: msg.id, reason: 'harassment' }))).toBe('not_found'); // not your Alliance's chat
        const first = await ben.report({ kind: 'chat', messageId: msg.id, reason: 'harassment', note: 'threats' });
        expect(first).toMatchObject({ alreadyReported: false, blocked: false });
        expect(first.id).toBeTruthy();
        expect(await ben.report({ kind: 'chat', messageId: msg.id, reason: 'spam' })).toEqual({ id: null, alreadyReported: true, blocked: false });
        await cat.report({ kind: 'chat', messageId: msg.id, reason: 'harassment' });
        expect((await eve.chat()).messages.map((m) => m.id)).toContain(msg.id); // two reporters: still shown
        await dan.report({ kind: 'chat', messageId: msg.id, reason: 'hate' });
        const after = await eve.chat();
        expect(after.messages.map((m) => m.id)).not.toContain(msg.id); // three: hidden from everyone
        expect(after.hidden).toContain(msg.id); // so clients that already show it drop it

        const queue = (await w.core.admin.reportQueue('open')).reports;
        expect(queue).toHaveLength(3);
        expect(queue[0]).toMatchObject({ kind: 'chat', targetId: ann.id, targetName: 'Ann', text: 'give me your gold or else', note: 'threats', openOnTarget: 3, messageHidden: true });
        // Staff find it harmless: it comes back, and every report on it is settled.
        expect(await w.core.admin.resolveReport(queue[0].id, { action: 'dismiss' })).toMatchObject({ status: 'dismissed' });
        expect((await w.core.admin.reportQueue('open')).reports).toHaveLength(0);
        expect((await eve.chat()).messages.map((m) => m.id)).toContain(msg.id);
        expect(await code(w.core.admin.resolveReport(queue[1].id, { action: 'mute' }))).toBe('conflict');

        // A worse one: staff mute Ann for 2 hours and the message goes.
        const bad = await ann.postChat('you are all trash');
        const r = await ben.report({ kind: 'chat', messageId: bad.id, reason: 'harassment' });
        expect(await code(w.core.admin.resolveReport(r.id!, { action: 'shout' }))).toBe('bad_request');
        expect(await w.core.admin.resolveReport(r.id!, { action: 'mute', hours: 2 })).toMatchObject({ status: 'actioned', resolution: 'Chat muted for 2 hours; message removed.' });
        expect((await eve.chat()).messages.map((m) => m.id)).not.toContain(bad.id);
        expect(await code(ann.postChat('sorry'))).toBe('muted');
        w.advance(2 * HOUR + 1);
        expect(await code(ann.postChat('sorry, truly'))).toBe('ok');
        // A player report cannot remove a message.
        const pr = await cat.report({ kind: 'player', playerId: ann.id, reason: 'name' });
        expect(await code(w.core.admin.resolveReport(pr.id!, { action: 'remove_message' }))).toBe('bad_request');
        expect(await code(cat.report({ kind: 'player', playerId: cat.id, reason: 'other' }))).toBe('bad_request');
        expect(await code(cat.report({ kind: 'player', playerId: 'nobody', reason: 'other' }))).toBe('not_found');
      });

      it('blocking hides a player\'s messages and troop requests from the blocker only', async () => {
        const w = await W();
        const [ann, ben, cat] = await alliance(w, ['Ann', 'Ben', 'Cat']);
        expect(await code(ben.block(ben.id))).toBe('bad_request');
        expect(await code(ben.block('nobody'))).toBe('not_found');
        await ben.block(ann.id);
        const hi = await ann.postChat('hi all');
        await ann.requestTroops(10);
        expect((await ben.chat()).messages.some((m) => m.from?.id === ann.id)).toBe(false);
        expect((await ben.requests()).requests).toHaveLength(0);
        expect((await cat.chat()).messages.map((m) => m.id)).toContain(hi.id);
        expect((await cat.requests()).requests).toHaveLength(1);
        expect((await ben.blocks()).blocked).toEqual([{ id: ann.id, name: 'Ann', at: w.now() }]);
        await ben.unblock(ann.id);
        expect((await ben.chat()).messages.map((m) => m.id)).toContain(hi.id);
        // Report and block in one go.
        expect(await cat.report({ kind: 'player', playerId: ann.id, reason: 'cheating', block: true })).toMatchObject({ blocked: true });
        expect((await cat.blocks()).blocked.map((b) => b.id)).toEqual([ann.id]);
      });

      it('keeps handled reports 90 days, and deleting an account closes reports about it without the text', async () => {
        const w = await W();
        const [ann, ben] = await alliance(w, ['Ann', 'Ben']);
        const m1 = await ann.postChat('first');
        const r1 = await ben.report({ kind: 'chat', messageId: m1.id, reason: 'spam' });
        await w.core.admin.resolveReport(r1.id!, { action: 'dismiss' });
        const m2 = await ann.postChat('second');
        await ben.report({ kind: 'chat', messageId: m2.id, reason: 'spam' });
        await ben.block(ann.id);
        await ann.block(ben.id);
        w.advance(91 * 24 * HOUR);
        expect(await w.core.prune()).toMatchObject({ reports: 1 }); // the handled one; the open one stays
        await ann.deleteAccount();
        const all = (await w.core.admin.reportQueue('all')).reports;
        expect(all).toEqual([expect.objectContaining({ status: 'dismissed', resolution: 'Account deleted.', targetName: 'Deleted player', text: null })]);
        expect((await ben.blocks()).blocked).toEqual([]);
      });
    });
  });
}

