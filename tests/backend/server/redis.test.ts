/**
 * Shared server state in Redis (roadmap step 16): the RESP client, and the
 * leaderboard, match locks and rate limits on it. The protocol parser always
 * runs; the rest needs a Redis server: set TEST_REDIS_URL
 * (e.g. redis://localhost:6379/15), as TEST_DATABASE_URL does for Postgres.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { encodeCommand, parseRedisUrl, RedisClient, RedisError, RespParser } from '../../../server/redis';
import { MemoryRepo, type Player } from '../../../server/repo';
import { boardScore, RedisLeaderboard, RedisLocks, RedisRateLimiter, RepoLeaderboard } from '../../../server/shared';
import { baseAt, world, startSeed } from './harness';

const url = process.env.TEST_REDIS_URL;
const clients: RedisClient[] = [];
afterAll(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()));
});
const redis = () => {
  const c = RedisClient.fromUrl(url!);
  clients.push(c);
  return c;
};
/** A key prefix of our own, so parallel test files never share keys. */
const ns = () => `test:${process.pid}:${Math.random().toString(36).slice(2)}:`;

describe('RESP protocol', () => {
  it('encodes commands as arrays of bulk strings', () => {
    expect(encodeCommand(['SET', 'k', 'héllo', 5]).toString()).toBe('*4\r\n$3\r\nSET\r\n$1\r\nk\r\n$6\r\nhéllo\r\n$1\r\n5\r\n');
  });

  it('parses every reply type, also when replies arrive split across chunks', () => {
    const p = new RespParser();
    const wire = '+OK\r\n:42\r\n$5\r\nhello\r\n$-1\r\n*3\r\n$1\r\na\r\n:7\r\n*1\r\n+x\r\n*-1\r\n-ERR wrong type\r\n';
    const out: unknown[] = [];
    for (let i = 0; i < wire.length; i += 3) out.push(...p.push(Buffer.from(wire.slice(i, i + 3))));
    expect(out.slice(0, 6)).toEqual(['OK', 42, 'hello', null, ['a', 7, ['x']], null]);
    expect(out[6]).toBeInstanceOf(RedisError);
    expect((out[6] as Error).message).toBe('ERR wrong type');
  });

  it('reads redis:// and rediss:// URLs with credentials and a database', () => {
    expect(parseRedisUrl('rediss://default:p%40ss@eu1.upstash.io:6380/2')).toEqual({ host: 'eu1.upstash.io', port: 6380, tls: true, username: 'default', password: 'p@ss', db: 2 });
    expect(parseRedisUrl('redis://localhost')).toMatchObject({ host: 'localhost', port: 6379, tls: false, db: 0 });
    expect(() => parseRedisUrl('http://x')).toThrow(/redis:\/\//);
  });

  it('ranks equal honor by account age, and honor always first', () => {
    expect(boardScore(100, 1_000)).toBeGreaterThan(boardScore(100, 2_000));
    expect(boardScore(101, Date.UTC(2099, 0))).toBeGreaterThan(boardScore(100, 0));
  });
});

describe.skipIf(!url)('Redis client and shared stores', () => {
  it('pipelines commands in order, rejects error replies, and reconnects after a drop', async () => {
    const c = redis();
    const k = ns();
    expect(await c.command('PING')).toBe('PONG');
    const n = await Promise.all(Array.from({ length: 50 }, () => c.command('INCR', `${k}n`)));
    expect(n).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
    await expect(c.command('HGET', `${k}n`, 'x')).rejects.toThrow(/WRONGTYPE/);
    (c as unknown as { socket: { destroy(): void } }).socket.destroy();
    await new Promise((r) => setTimeout(r, 20));
    expect(await c.command('GET', `${k}n`)).toBe('50');
    await c.command('DEL', `${k}n`);
  });

  it('the Redis leaderboard ranks exactly like the database, and rebuilds itself from it', async () => {
    const repo = new MemoryRepo();
    const T = Date.UTC(2026, 5, 1);
    const mk = (id: string, trophies: number, createdAt: number, base = true): Player => ({ id, name: id, tokenHash: id, trophies, hallLevel: 1, shieldUntil: 0, base: base ? baseAt(1) : null, groveId: null, createdAt, updatedAt: T, lastSeenAt: T });
    for (const p of [mk('a', 300, T), mk('b', 200, T + 1), mk('c', 200, T + 2), mk('d', 999, T, false), mk('e', 0, T + 3), mk('f', 1200, T + 4)]) await repo.createPlayer(p);
    const db = new RepoLeaderboard(repo);
    const board = new RedisLeaderboard(redis(), `${ns()}board`);
    expect(await board.rebuildIfMissing(repo)).toBe(5); // 'd' has no base: not ranked
    expect(await board.rebuildIfMissing(repo)).toBe(0); // only when missing
    expect(await board.top(10)).toEqual(await db.top(10));
    expect((await board.top(10)).map((e) => e.id)).toEqual(['f', 'a', 'b', 'c', 'e']);
    for (const t of [0, 199, 200, 201, 300, 1200, 5000]) expect(await board.rankOf(t)).toBe(await db.rankOf(t));
    await board.set('e', 250, T + 3);
    await board.remove('f');
    expect((await board.top(3)).map((e) => [e.id, e.trophies])).toEqual([
      ['a', 300],
      ['e', 250],
      ['b', 200],
    ]);
  });

  it('match locks: one holder at a time, released only by the holder, and they expire', async () => {
    const locks = new RedisLocks(redis(), ns());
    expect(await locks.acquire('def', 'ann', 60_000)).toBe(true);
    expect(await locks.acquire('def', 'ben', 60_000)).toBe(false);
    expect([...(await locks.lockedAmong(['def', 'other']))]).toEqual(['def']);
    await locks.release('def', 'ben'); // not Ben's lock
    expect(await locks.acquire('def', 'ben', 60_000)).toBe(false);
    await locks.release('def', 'ann');
    expect(await locks.acquire('def', 'ben', 30)).toBe(true);
    await new Promise((r) => setTimeout(r, 60));
    expect(await locks.acquire('def', 'cat', 60_000)).toBe(true);
  });

  it('rate limits are shared by every instance using the same Redis', async () => {
    const prefix = ns();
    const limits = { ip: { limit: 3, windowMs: 60_000 }, player: { limit: 3, windowMs: 60_000 }, register: { limit: 3, windowMs: 60_000 }, match: { limit: 3, windowMs: 60_000 }, battle: { limit: 3, windowMs: 60_000 }, moderation: { limit: 3, windowMs: 60_000 }, deletionRequest: { limit: 3, windowMs: 60_000 }, commands: { limit: 3, windowMs: 60_000 }, lookup: { limit: 3, windowMs: 60_000 }, lookupDay: { limit: 3, windowMs: 60_000 }, battleCommands: { limit: 3, windowMs: 60_000 }, purchase: { limit: 3, windowMs: 60_000 }, villageImport: { limit: 3, windowMs: 60_000 } };
    const one = new RedisRateLimiter(redis(), limits, prefix);
    const two = new RedisRateLimiter(redis(), limits, prefix);
    expect((await one.hit('battle', 'p1')).ok).toBe(true);
    expect((await two.hit('battle', 'p1')).ok).toBe(true);
    expect((await one.hit('battle', 'p1')).ok).toBe(true);
    const no = await two.hit('battle', 'p1');
    expect(no.ok).toBe(false);
    expect(no.retryAfterMs).toBeGreaterThan(50_000);
    expect((await two.hit('battle', 'p2')).ok).toBe(true);
  });

  it('two attackers searching at once never get the same defender', async () => {
    const c = redis();
    const w = world({ shared: { board: new RedisLeaderboard(c, `${ns()}board`), locks: new RedisLocks(c, ns()) } });
    const [a, b] = [await w.player('Ann', baseAt(1)), await w.player('Ben', baseAt(1, 5))];
    await w.player('Dot', baseAt(1, 77));
    w.pastShields();
    // Ann and Ben share an Alliance, so the only real opponent for both is Dot.
    const g = await a.createGrove('Moss');
    await b.joinGrove(g.id);
    const [ma, mb] = await Promise.all([a.match(), b.match()]);
    expect([ma!.opponent.kind, mb!.opponent.kind].sort()).toEqual(['bot', 'player']);
    // Reporting the attack frees Dot for the next attacker.
    const winner = ma!.opponent.kind === 'player' ? { c: a, m: ma! } : { c: b, m: mb! };
    await winner.c.submitAttack({ ticket: winner.m.ticket, seed: await startSeed(winner.c, winner.m.ticket), army: {}, deployments: [], endTick: 1 });
    const loser = winner.c === a ? b : a;
    w.advance(3_600_001);
    expect((await loser.match())!.opponent.name).toBe('Dot');
    // The leaderboard comes from the Redis set.
    const lb = await a.leaderboard(10);
    expect(lb.players.map((p) => p.name).sort()).toEqual(['Ann', 'Ben', 'Dot']);
    expect(lb.me).toMatchObject({ rank: expect.any(Number) });
  });
});
