/**
 * Contract for the server's storage port (server/repo.ts). Every adapter must
 * pass it: MemoryRepo always, PgRepo when TEST_DATABASE_URL is set. A future
 * database adapter only needs a factory added in ./pg.ts.
 */
import { describe, expect, it } from 'vitest';
import { canonicalJson, contentHash } from '../../../server/contentHash';
import { PgRepo } from '../../../server/pgRepo';
import type { AttackRecord, Player, Repo, Ticket } from '../../../server/repo';
import { baseAt } from './harness';
import { repoFactories } from './pg';

const DAY = 24 * 3_600_000;

describe('content hashes for stored bases', () => {
  it('ignore key order, keep array order, and drop undefined fields', () => {
    expect(canonicalJson({ b: { d: [1, 2], c: 'x' }, a: 1, z: undefined })).toBe('{"a":1,"b":{"c":"x","d":[1,2]}}');
    expect(contentHash({ a: 1, b: { c: 2 } })).toBe(contentHash({ b: { c: 2 }, a: 1 }));
    expect(contentHash({ a: [1, 2] })).not.toBe(contentHash({ a: [2, 1] }));
    expect(contentHash(baseAt(1))).toMatch(/^[0-9a-f]{64}$/);
  });
});

const T = Date.UTC(2026, 5, 1);

function player(id: string, over: Partial<Player> = {}): Player {
  return { id, name: id, tokenHash: `h-${id}`, trophies: 100, hallLevel: 2, shieldUntil: 0, base: baseAt(2), groveId: null, createdAt: T, updatedAt: T, lastSeenAt: T, ...over };
}

function ticket(id: string, attackerId: string, defenderId: string | null, over: Partial<Ticket> = {}): Ticket {
  return { id, kind: 'pvp', attackerId, defenderId, defenderName: 'x', base: baseAt(1), defenderTrophies: 0, createdAt: T, expiresAt: T + 3_600_000, used: false, ...over };
}

for (const [label, make] of repoFactories) {
  describe(`Repo contract: ${label}`, () => {
    let repo: Repo;
    const fresh = async () => (repo = await make());

    it('stores, finds and patches players', async () => {
      await fresh();
      await repo.createPlayer(player('a', { base: null }));
      expect((await repo.playerByTokenHash('h-a'))!.id).toBe('a');
      expect(await repo.playerByTokenHash('nope')).toBeNull();
      await repo.updatePlayer('a', { trophies: 250, groveId: 'g1', base: baseAt(3), hallLevel: 3, lastSeenAt: T + 5 });
      const a = (await repo.getPlayer('a'))!;
      expect(a).toMatchObject({ trophies: 250, groveId: 'g1', hallLevel: 3, lastSeenAt: T + 5 });
      expect(a.base!.buildings.length).toBeGreaterThan(0);
      await repo.updatePlayer('a', { groveId: null });
      expect((await repo.getPlayer('a'))!.groveId).toBeNull();
    });

    it('finds opponents by hall, trophies, shield, exclusions and open tickets', async () => {
      await fresh();
      await repo.createPlayer(player('me'));
      await repo.createPlayer(player('ok'));
      await repo.createPlayer(player('shielded', { shieldUntil: T + 1 }));
      await repo.createPlayer(player('nobase', { base: null }));
      await repo.createPlayer(player('tooHigh', { hallLevel: 5 }));
      await repo.createPlayer(player('tooRich', { trophies: 900 }));
      await repo.createPlayer(player('locked'));
      await repo.createPlayer(player('oldLock'));
      await repo.createTicket(ticket('t1', 'me', 'locked', { createdAt: T - 60_000 }));
      await repo.createTicket(ticket('t2', 'me', 'oldLock', { createdAt: T - 600_000 }));
      const q = { excludeIds: ['me'], minHall: 1, maxHall: 3, minTrophies: 0, maxTrophies: 200, now: T, lockedSince: T - 300_000, limit: 20 };
      expect((await repo.findOpponents(q)).map((p) => p.id).sort()).toEqual(['ok', 'oldLock']);
      await repo.useTicket('t1');
      expect((await repo.findOpponents(q)).map((p) => p.id).sort()).toEqual(['locked', 'ok', 'oldLock']);
      expect(await repo.findOpponents({ ...q, excludeIds: ['me', 'ok', 'locked', 'oldLock'] })).toEqual([]);
    });

    it('ranks players and uses each ticket once', async () => {
      await fresh();
      await repo.createPlayer(player('a', { trophies: 300 }));
      await repo.createPlayer(player('b', { trophies: 200, createdAt: T + 1 }));
      await repo.createPlayer(player('c', { trophies: 200, createdAt: T + 2 }));
      await repo.createPlayer(player('d', { trophies: 999, base: null }));
      expect((await repo.topPlayers(10)).map((p) => p.id)).toEqual(['a', 'b', 'c']);
      expect(await repo.rankOf(200)).toBe(2);
      expect(await repo.rankOf(1000)).toBe(1);
      await repo.createTicket(ticket('t', 'a', null, { kind: 'raid', week: 4, groveId: 'g', target: 2 }));
      expect(await repo.getTicket('t')).toMatchObject({ kind: 'raid', defenderId: null, week: 4, groveId: 'g', target: 2, used: false });
      const both = await Promise.all([repo.useTicket('t'), repo.useTicket('t')]);
      expect(both.filter(Boolean)).toHaveLength(1);
      expect(await repo.useTicket('missing')).toBe(false);
    });

    it('keeps attacks as defense logs and recent targets', async () => {
      await fresh();
      await repo.createPlayer(player('a'));
      await repo.createPlayer(player('b'));
      const rec = (id: string, at: number) => ({ id, at, attackerId: 'a', attackerName: 'A', defenderId: 'b', seed: 1, army: {}, levels: {}, base: baseAt(1), deployments: [], result: { stars: 1, destruction: 50, loot: {}, used: {}, ticks: 10, hallDestroyed: false, endReason: 'time' as const, hash: 'h' }, attackerTrophies: 5, defenderTrophies: -5 });
      await repo.addAttack(rec('x1', T + 1));
      await repo.addAttack(rec('x2', T + 2));
      await repo.addAttack(rec('x3', T + 3));
      expect((await repo.defensesFor('b', T + 1, 10)).map((a) => a.id)).toEqual(['x2', 'x3']);
      expect((await repo.defensesFor('b', 0, 2)).map((a) => a.id)).toEqual(['x2', 'x3']);
      expect(await repo.recentTargets('a', T + 2)).toEqual(['b']);
      expect(await repo.recentTargets('a', T + 3)).toEqual([]);
    });

    it('stores each base version once, and prunes old replays, stale tickets and unreferenced bases', async () => {
      await fresh();
      await repo.createPlayer(player('a'));
      await repo.createPlayer(player('b'));
      const A = baseAt(1, 3);
      const B = baseAt(2, 4);
      const attack = (id: string, at: number, base = A): AttackRecord => ({ id, at, attackerId: 'a', attackerName: 'A', defenderId: 'b', seed: 1, army: {}, levels: {}, base, deployments: [], result: { stars: 0, destruction: 0, loot: {}, used: {}, ticks: 1, hallDestroyed: false, endReason: 'time', hash: 'h' }, attackerTrophies: 0, defenderTrophies: 0 });
      // Three tickets and an old attack share base A; one ticket has base B.
      await repo.createTicket(ticket('old', 'a', 'b', { base: A, createdAt: T - 40 * DAY, expiresAt: T - 40 * DAY + 3_600_000 }));
      await repo.createTicket(ticket('used', 'a', 'b', { base: A, createdAt: T - 2 * DAY, expiresAt: T - 2 * DAY + 3_600_000 }));
      await repo.useTicket('old', { answer: 1 });
      await repo.useTicket('used', { answer: 2 });
      await repo.createTicket(ticket('stale', 'a', 'b', { base: B, createdAt: T - 2 * DAY, expiresAt: T - 2 * DAY + 3_600_000 }));
      await repo.createTicket(ticket('fresh', 'a', 'b', { base: A, createdAt: T, expiresAt: T + 3_600_000 }));
      await repo.addAttack(attack('x-old', T - 40 * DAY));
      await repo.addAttack(attack('x-new', T - DAY, B));
      // Every read gets the whole base back.
      expect((await repo.getTicket('fresh'))!.base).toEqual(A);
      expect((await repo.getTicket('stale'))!.base).toEqual(B);
      expect((await repo.defensesFor('b', 0, 10)).map((x) => x.base)).toEqual([A, B]);
      const r = await repo.prune({ recordsBefore: T - 30 * DAY, staleBefore: T - DAY });
      // 'old' is past retention, 'stale' expired unused; 'used' keeps its answer for retries.
      expect(r).toEqual({ attacks: 1, tickets: 2, bases: 0 , reports: 0, commands: 0 }); // A and B are both still referred to
      expect(await repo.getTicket('old')).toBeNull();
      expect(await repo.getTicket('stale')).toBeNull();
      expect(await repo.getTicket('used')).toMatchObject({ base: A, used: true, response: { answer: 2 } });
      expect((await repo.defensesFor('b', 0, 10)).map((x) => x.id)).toEqual(['x-new']);
      // Once nothing refers to them, both versions go (each was stored once).
      expect(await repo.prune({ recordsBefore: T + 1, staleBefore: T + 1 })).toEqual({ attacks: 1, tickets: 2, bases: 2 , reports: 0, commands: 0 });
      expect(await repo.prune({ recordsBefore: T + 1, staleBefore: T + 1 })).toEqual({ attacks: 0, tickets: 0, bases: 0 , reports: 0, commands: 0 });
    });

    it('keeps a base version that was used again recently, even when nothing refers to it yet', async () => {
      await fresh();
      await repo.createPlayer(player('a'));
      const A = baseAt(1, 3);
      await repo.createTicket(ticket('t1', 'a', null, { base: A, createdAt: T - 3 * DAY, expiresAt: T - 3 * DAY + 3_600_000 }));
      await repo.createTicket(ticket('t2', 'a', null, { base: A, createdAt: T, expiresAt: T + 3_600_000 }));
      expect(await repo.prune({ recordsBefore: T - 30 * DAY, staleBefore: T - DAY })).toEqual({ attacks: 0, tickets: 1, bases: 0 , reports: 0, commands: 0 });
      expect((await repo.getTicket('t2'))!.base).toEqual(A);
    });

    it('keeps server-owned villages with a revision check, an append-only ledger and a command log', async () => {
      await fresh();
      await repo.createPlayer(player('a'));
      const v = { playerId: 'a', file: { version: 12, savedAt: T, village: { note: 'v1' } }, revision: 1, seq: 0, at: T, stateHash: 'h1', createdAt: T, updatedAt: T };
      expect(await repo.createVillage(v)).toBe(true);
      expect(await repo.createVillage(v)).toBe(false); // one per player
      expect(await repo.createVillage({ ...v, playerId: 'nobody' })).toBe(false); // players only
      expect(await repo.getVillage('a')).toEqual(v);
      const next = { ...v, file: { version: 12, savedAt: T + 5, village: { note: 'v2' } }, revision: 2, seq: 3, at: T + 5, stateHash: 'h2', updatedAt: T + 5 };
      const led = [
        { playerId: 'a', at: T + 5, resource: 'acorns', delta: -100, balance: 900, reason: 'command:upgrade', ref: '1' },
        { playerId: 'a', at: T + 5, resource: 'dew', delta: 50, balance: 550, reason: 'command:collect', ref: '2' },
      ];
      const cmds = [1, 2, 3].map((seq) => ({ playerId: 'a', seq, at: T + seq, clientAt: T + seq, type: 'collect', command: { type: 'collect', id: 'b1' }, ok: seq !== 3, error: seq === 3 ? 'NOTHING_TO_COLLECT' : null }));
      expect(await repo.saveVillage(next, 1, led, cmds)).toBe(true);
      // A writer that read revision 1 is too late now, and writes nothing at all.
      expect(await repo.saveVillage({ ...next, revision: 2, stateHash: 'stale' }, 1, led, [])).toBe(false);
      expect(await repo.getVillage('a')).toEqual(next);
      expect((await repo.ledgerOf('a', 10)).map((l) => l.reason)).toEqual(['command:collect', 'command:upgrade']);
      expect((await repo.commandsOf('a', 1, 10)).map((c) => [c.seq, c.ok, c.error])).toEqual([
        [2, true, null],
        [3, false, 'NOTHING_TO_COLLECT'],
      ]);
      expect((await repo.prune({ recordsBefore: 0, staleBefore: 0, commandsBefore: T + 2 })).commands).toBe(1);
      await repo.deletePlayer('a', 'a', T + 9);
      expect(await repo.getVillage('a')).toBeNull();
      expect(await repo.ledgerOf('a', 10)).toEqual([]);
      expect(await repo.commandsOf('a', 0, 10)).toEqual([]);
    });

    it('runs transactions all or nothing, a failed nested one undoing only its own writes', async () => {
      await fresh();
      await expect(
        repo.transaction(async (tx) => {
          await tx.createPlayer(player('x'));
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
      expect(await repo.getPlayer('x')).toBeNull();
      await repo.transaction(async (tx) => {
        await tx.createPlayer(player('y'));
        await tx
          .transaction(async (inner) => {
            await inner.createPlayer(player('z'));
            throw new Error('inner');
          })
          .catch(() => undefined);
        await tx.updatePlayer('y', { trophies: 7 });
      });
      expect((await repo.getPlayer('y'))!.trophies).toBe(7);
      expect(await repo.getPlayer('z')).toBeNull();
    });

    it('lists Groves with member counts and activity, and manages members', async () => {
      await fresh();
      await repo.createPlayer(player('a', { trophies: 100, lastSeenAt: T + 10 }));
      await repo.createPlayer(player('b', { trophies: 300, lastSeenAt: T + 20 }));
      await repo.createGrove({ id: 'g1', name: 'Mossy Hollow', color: '#fff', createdAt: T });
      await repo.createGrove({ id: 'g2', name: 'Empty', color: '#fff', createdAt: T });
      await repo.addMember({ groveId: 'g1', playerId: 'a', role: 'Leader', joinedAt: T, xp: 0 });
      await repo.addMember({ groveId: 'g1', playerId: 'b', role: 'Member', joinedAt: T + 1, xp: 0 });
      const list = await repo.listGroves('', 10);
      expect(list).toHaveLength(1); // empty Groves are not listed
      expect(list[0]).toMatchObject({ id: 'g1', members: 2, averageTrophies: 200, lastActiveAt: T + 20 });
      expect(await repo.listGroves('HOLLOW', 10)).toHaveLength(1);
      expect(await repo.listGroves('%', 10)).toHaveLength(0);
      expect(await repo.addMember({ groveId: 'g2', playerId: 'a', role: 'Member', joinedAt: T, xp: 0 })).toBe(false); // one Grove per player
      await repo.updateMember('g1', 'b', { role: 'Elder', xp: 40 });
      expect(await repo.getMembership('b')).toMatchObject({ groveId: 'g1', role: 'Elder', xp: 40 });
      expect((await repo.members('g1')).map((m) => m.playerId)).toEqual(['a', 'b']);
      await repo.removeMember('g1', 'b');
      expect(await repo.getMembership('b')).toBeNull();
    });

    it('pages chat by increasing cursor and counts recent messages', async () => {
      await fresh();
      await repo.createGrove({ id: 'g', name: 'G', color: '#fff', createdAt: T });
      await repo.createGrove({ id: 'h', name: 'H', color: '#fff', createdAt: T });
      const rows = [];
      for (let i = 0; i < 5; i++) rows.push(await repo.addChat({ id: `c${i}`, groveId: i === 2 ? 'h' : 'g', at: T + i, playerId: 'p', name: 'P', text: `m${i}`, kind: i === 4 ? 'system' : 'chat' }));
      expect(rows.map((r) => r.seq)).toEqual([...rows.map((r) => r.seq)].sort((a, b) => a - b));
      expect((await repo.chatAfter('g', 0, 100)).map((r) => r.text)).toEqual(['m0', 'm1', 'm3', 'm4']);
      expect((await repo.chatAfter('g', rows[1].seq, 100)).map((r) => r.text)).toEqual(['m3', 'm4']);
      expect((await repo.chatAfter('g', 0, 2)).map((r) => r.text)).toEqual(['m3', 'm4']); // newest page
      expect(await repo.recentChatCount('p', T + 1)).toBe(2); // m2, m3 ('system' does not count)
    });

    it('fills troop requests atomically and delivers donations once', async () => {
      await fresh();
      await repo.createPlayer(player('a'));
      await repo.createGrove({ id: 'g', name: 'G', color: '#fff', createdAt: T });
      await repo.addRequest({ id: 'r', groveId: 'g', playerId: 'a', name: 'A', at: T, size: 10, filled: 0, open: true });
      await repo.addRequest({ id: 'old', groveId: 'g', playerId: 'a', name: 'A', at: T - 10, size: 5, filled: 0, open: true });
      expect(await repo.lastRequestAt('a')).toBe(T);
      expect((await repo.openRequests('g', T - 5)).map((r) => r.id)).toEqual(['r']);
      const fills = await Promise.all([repo.fillRequest('r', 6), repo.fillRequest('r', 6)]);
      expect(fills.filter(Boolean)).toHaveLength(1); // never over-filled
      const done = await repo.fillRequest('r', 4);
      expect(done).toMatchObject({ filled: 10, open: false });
      expect(await repo.fillRequest('r', 1)).toBeNull();
      await repo.closeRequestsOf('a');
      expect(await repo.openRequests('g', 0)).toEqual([]);
      const don = { requestId: 'r', groveId: 'g', fromId: 'b', fromName: 'B', toId: 'a', troop: 'hedgehog_roller', count: 2, level: 1, at: T, delivered: false };
      await repo.addDonation({ ...don, id: 'd1' });
      await repo.addDonation({ ...don, id: 'd2' });
      await repo.markDelivered('someone-else', ['d1']);
      expect((await repo.undelivered('a')).map((d) => d.id)).toEqual(['d1', 'd2']);
      await repo.markDelivered('a', ['d1']);
      expect((await repo.undelivered('a')).map((d) => d.id)).toEqual(['d2']);
    });

    it('pairs Groves once per week and records raid attacks and single claims', async () => {
      await fresh();
      await repo.createPlayer(player('a', { lastSeenAt: T }));
      await repo.createPlayer(player('b', { lastSeenAt: T - 1_000_000 }));
      for (const [g, p] of [['g1', 'a'], ['g2', 'b']]) {
        await repo.createGrove({ id: g, name: g, color: '#fff', createdAt: T });
        expect(await repo.addMember({ groveId: g, playerId: p, role: 'Leader', joinedAt: T, xp: 0 })).toBe(true);
      }
      expect((await repo.unpairedGroves(3, T - 10, 10)).map((g) => g.id)).toEqual(['g1']); // g2 inactive
      const pairing = (g: string, o: string | null) => ({ week: 3, groveId: g, opponentGroveId: o, opponentName: 'x', botSeed: 7, roster: [{ index: 0, name: 'n', hallLevel: 1, trophies: 0, base: baseAt(1), playerId: null }], ourSize: 1, ourHall: 1, createdAt: T });
      expect(await repo.createPairings([pairing('g1', 'g2'), pairing('g2', 'g1')])).toBe(true);
      expect(await repo.createPairings([pairing('g1', null)])).toBe(false);
      expect(await repo.getPairing(3, 'g1')).toMatchObject({ opponentGroveId: 'g2', botSeed: 7, ourSize: 1 });
      expect((await repo.getPairing(3, 'g1'))!.roster[0].base.buildings.length).toBeGreaterThan(0);
      expect(await repo.unpairedGroves(3, 0, 10)).toEqual([]);
      expect((await repo.unpairedGroves(4, 0, 10)).length).toBe(2);
      await repo.addRaidAttack({ id: 'ra', week: 3, groveId: 'g1', attackerId: 'a', target: 0, stars: 2, destruction: 61.5, at: T });
      expect(await repo.raidAttacks(3, 'g1')).toEqual([{ id: 'ra', week: 3, groveId: 'g1', attackerId: 'a', target: 0, stars: 2, destruction: 61.5, at: T }]);
      expect(await repo.raidAttacks(3, 'g2')).toEqual([]);
      const claim = { week: 3, playerId: 'a', groveId: 'g1', outcome: 'win' as const, at: T };
      const claims = await Promise.all([repo.addClaim(claim), repo.addClaim(claim)]);
      expect(claims.filter(Boolean)).toHaveLength(1);
      expect(await repo.getClaim(3, 'a')).toMatchObject({ outcome: 'win' });
      expect(await repo.getClaim(4, 'a')).toBeNull();
    });
  });
}

describe.skipIf(!repoFactories.some(([l]) => l === 'postgres'))('PgRepo: rows from before base versions', () => {
  it('still reads tickets and attacks that carry their own copy of the base', async () => {
    const repo = (await repoFactories.find(([l]) => l === 'postgres')![1]()) as PgRepo;
    const pool = (repo as unknown as { pool: import('pg').Pool }).pool;
    await repo.createPlayer(player('a'));
    await repo.createPlayer(player('b'));
    const A = baseAt(1, 3);
    await pool.query(`insert into tickets (id, kind, attacker_id, defender_id, defender_name, base, defender_trophies, created_at, expires_at, used) values ('legacy', 'pvp', 'a', 'b', 'x', $1, 0, $2, $3, false)`, [JSON.stringify(A), T, T + 3_600_000]);
    const rec = { id: 'old', at: T, attackerId: 'a', attackerName: 'A', defenderId: 'b', seed: 1, army: {}, levels: {}, base: A, deployments: [], result: { stars: 0, destruction: 0, loot: {}, used: {}, ticks: 1, hallDestroyed: false, endReason: 'time', hash: 'h' }, attackerTrophies: 0, defenderTrophies: 0 };
    await pool.query(`insert into attacks (id, at, attacker_id, defender_id, record) values ('old', $1, 'a', 'b', $2)`, [T, JSON.stringify(rec)]);
    expect((await repo.getTicket('legacy'))!.base).toEqual(A);
    expect((await repo.defensesFor('b', 0, 10))[0].base).toEqual(A);
    // Retention removes them like any other row.
    expect(await repo.prune({ recordsBefore: T + 1, staleBefore: T + 1 })).toEqual({ attacks: 1, tickets: 1, bases: 0 , reports: 0, commands: 0 });
  });

  it('stores a base once in base_versions however many tickets use it', async () => {
    const repo = (await repoFactories.find(([l]) => l === 'postgres')![1]()) as PgRepo;
    const pool = (repo as unknown as { pool: import('pg').Pool }).pool;
    await repo.createPlayer(player('a'));
    for (let i = 0; i < 5; i++) await repo.createTicket(ticket(`t${i}`, 'a', null, { base: baseAt(1, 3), createdAt: T + i }));
    expect(Number((await pool.query('select count(*) as n from base_versions')).rows[0].n)).toBe(1);
    expect((await pool.query('select base from tickets where base is not null')).rows).toHaveLength(0);
  });
});

describe.skipIf(!repoFactories.some(([l]) => l === 'postgres'))('PgRepo: the ledger', () => {
  it('refuses to change a ledger row', async () => {
    const repo = (await repoFactories.find(([l]) => l === 'postgres')![1]()) as PgRepo;
    const pool = (repo as unknown as { pool: import('pg').Pool }).pool;
    await repo.createPlayer(player('a'));
    await repo.createVillage({ playerId: 'a', file: {}, revision: 1, seq: 0, at: T, stateHash: 'h', createdAt: T, updatedAt: T });
    await repo.saveVillage({ playerId: 'a', file: {}, revision: 2, seq: 0, at: T, stateHash: 'h', createdAt: T, updatedAt: T }, 1, [{ playerId: 'a', at: T, resource: 'acorns', delta: 5, balance: 5, reason: 'test', ref: null }], []);
    await expect(pool.query('update ledger set delta = 500')).rejects.toThrow(/append-only/);
  });
});
