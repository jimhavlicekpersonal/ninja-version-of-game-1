/**
 * Two API instances behind a load balancer (roadmap step 44): one Postgres
 * and one Redis, two servers. A player can use either; a write repeated on
 * the other instance gets the first answer (Idempotency-Key); the leaderboard,
 * match locks and rate limits are shared. Runs with TEST_DATABASE_URL and
 * TEST_REDIS_URL.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { buildServer } from '../../../server/app';
import { RedisClient } from '../../../server/redis';
import { RedisLeaderboard, RedisLocks, RedisRateLimiter } from '../../../server/shared';
import { DEFAULT_RATE_LIMITS } from '../../../server/rateLimit';
import { ClientHeaders, Routes } from '../../../src/backend/net/protocol';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { baseAt } from './harness';
import { freshPgRepo } from './pg';

const redisUrl = process.env.TEST_REDIS_URL;
const clients: RedisClient[] = [];
afterAll(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()));
});

describe.skipIf(!process.env.TEST_DATABASE_URL || !redisUrl)('two instances, one database and one Redis', () => {
  it('serve the same players and share answers, the leaderboard and limits', async () => {
    const repo = await freshPgRepo();
    const prefix = `inst-${Date.now().toString(36)}`;
    const make = () => {
      const redis = RedisClient.fromUrl(redisUrl!);
      clients.push(redis);
      const limits = { ...DEFAULT_RATE_LIMITS, register: { limit: 3, windowMs: 3_600_000 } };
      return buildServer({ repo, data, shared: { board: new RedisLeaderboard(redis, `${prefix}:board`), locks: new RedisLocks(redis, `${prefix}:lock`) }, rateLimiter: new RedisRateLimiter(redis, limits, `${prefix}:rl`) });
    };
    const [a, b] = [make(), make()];
    const call = async (app: typeof a, method: 'GET' | 'POST' | 'PUT', url: string, token?: string, payload?: unknown, headers: Record<string, string> = {}) => {
      const r = await app.inject({ method, url, payload: payload as object, remoteAddress: '10.0.0.9', headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers } });
      return { status: r.statusCode, body: r.body ? JSON.parse(r.body) : null };
    };
    // Registered on A, playing on B.
    const ann = (await call(a, 'POST', Routes.players, undefined, { name: 'Ann' })).body;
    expect((await call(b, 'GET', Routes.me, ann.token)).body.name).toBe('Ann');
    await call(b, 'PUT', Routes.base, ann.token, { base: baseAt(1) });
    // A rename retried on the other instance with the same key gets the first answer.
    const key = { [ClientHeaders.idempotencyKey]: 'rename-1', [ClientHeaders.protocol]: '7' };
    const first = await call(a, 'PUT', Routes.me, ann.token, { name: 'Annie' }, key);
    const again = await call(b, 'PUT', Routes.me, ann.token, { name: 'Other' }, key);
    expect(again.body).toEqual(first.body);
    // One leaderboard.
    expect((await call(a, 'GET', `${Routes.leaderboard}?limit=5`, ann.token)).body.players.map((p: { name: string }) => p.name)).toEqual(['Annie']);
    // One rate limit across both (3 registrations an hour from one address; Ann was the first).
    expect((await call(b, 'POST', Routes.players, undefined, { name: 'Bob' })).status).toBe(201);
    expect((await call(a, 'POST', Routes.players, undefined, { name: 'Cy' })).status).toBe(201);
    expect((await call(b, 'POST', Routes.players, undefined, { name: 'Dee' })).status).toBe(429);
    await a.close();
    await b.close();
  });
});
