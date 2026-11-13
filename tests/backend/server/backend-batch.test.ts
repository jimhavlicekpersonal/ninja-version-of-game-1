/**
 * Backend batch 2026-11-13 (docs/audit/areas/06-backend-server.md): the HTTP adapter's limits,
 * idempotency, logs and request ids (A7, A8, A12, A13, A28, A30, A31, A33).
 */
import { describe, expect, it } from 'vitest';
import { buildServer, clientRequestId, redactUrl, requestFingerprint, type ServerOptions } from '../../../server/app';
import { DEFAULT_RATE_LIMITS, MemoryRateLimiter, shareOf } from '../../../server/rateLimit';
import { MemoryRepo } from '../../../server/repo';
import { RedisRateLimiter } from '../../../server/shared';
import { Routes } from '../../../src/backend/net/protocol';
import { defaultData as data } from '../../../src/gameplay/sim/data';

const MIN = 60_000;
const STAFF = 'staff-token-0123456789-abcdefgh';

export function setup(opts: Partial<ServerOptions> = {}) {
  let t = Date.UTC(2026, 10, 13);
  const repo = (opts.repo as MemoryRepo | undefined) ?? new MemoryRepo();
  const app = buildServer({ repo, data, now: () => t, ...opts });
  const call = async (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, token?: string, payload?: unknown, extra: { ip?: string; headers?: Record<string, string> } = {}) => {
    const r = await app.inject({ method, url, payload: payload as object, remoteAddress: extra.ip, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra.headers } });
    return { status: r.statusCode, body: r.body ? JSON.parse(r.body) : null, headers: r.headers };
  };
  const register = async (name: string, ip?: string) => (await call('POST', Routes.players, undefined, { name }, { ip })).body as { playerId: string; token: string };
  return { app, repo, call, register, advance: (ms: number) => (t += ms), now: () => t };
}

describe('A7: per-player limits count the player, not the token', () => {
  it('a second device token shares the first one’s budget', async () => {
    const s = setup({ rateLimits: { player: { limit: 5, windowMs: MIN } } });
    const a = await s.register('Ann');
    const second = 'second-device-token-abcdefghijkl';
    await s.repo.addToken(a.playerId, await s.app.core.ctx.hash(second), s.now(), 'phone', 'apple');
    const codes: number[] = [];
    for (let i = 0; i < 4; i++) codes.push((await s.call('GET', Routes.me, a.token)).status);
    for (let i = 0; i < 4; i++) codes.push((await s.call('GET', Routes.me, second)).status);
    expect(codes.filter((c) => c === 200)).toHaveLength(5);
    expect(codes.filter((c) => c === 429)).toHaveLength(3);
  });
});

describe('A8: limits counted per instance are divided between instances', () => {
  it('shareOf divides every rule, rounding up and never below 1', () => {
    const s = shareOf(DEFAULT_RATE_LIMITS, 3);
    expect(s.player.limit).toBe(Math.ceil(DEFAULT_RATE_LIMITS.player.limit / 3));
    expect(s.deletionRequest.limit).toBe(2);
    expect(shareOf({ ...DEFAULT_RATE_LIMITS, battleCommands: { limit: 1, windowMs: MIN } }, 4).battleCommands.limit).toBe(1);
    expect(shareOf(DEFAULT_RATE_LIMITS, 1)).toBe(DEFAULT_RATE_LIMITS);
  });

  it('the Redis limiter falls back to the divided share while Redis is down', async () => {
    const down = { command: async () => Promise.reject(new Error('down')) };
    const l = new RedisRateLimiter(down as never, DEFAULT_RATE_LIMITS, undefined, undefined, new MemoryRateLimiter(shareOf(DEFAULT_RATE_LIMITS, 2)));
    let ok = 0;
    for (let i = 0; i < DEFAULT_RATE_LIMITS.deletionRequest.limit; i++) if ((await l.hit('deletionRequest', 'ip:1.2.3.4', 0)).ok) ok++;
    expect(ok).toBe(Math.ceil(DEFAULT_RATE_LIMITS.deletionRequest.limit / 2));
  });
});

describe('A13: an Idempotency-Key answers only the request it was made for', () => {
  it('replays the same request, refuses another route or another body with 422', async () => {
    const s = setup();
    const a = await s.register('Ann');
    const key = { 'idempotency-key': 'k-1' };
    const first = await s.call('PUT', Routes.privacy, a.token, { findable: 'friends_of_friends' }, { headers: key });
    expect(first.status).toBeLessThan(300);
    const again = await s.call('PUT', Routes.privacy, a.token, { findable: 'friends_of_friends' }, { headers: key });
    expect(again.headers['idempotent-replay']).toBe('true');
    const otherBody = await s.call('PUT', Routes.privacy, a.token, { findable: 'nobody' }, { headers: key });
    expect(otherBody.status).toBe(422);
    expect(otherBody.body.error).toBe('idempotency_mismatch');
    const otherRoute = await s.call('POST', Routes.village, a.token, {}, { headers: key });
    expect(otherRoute.status).toBe(422);
  });

  it('fingerprints differ by method, route and body', () => {
    expect(requestFingerprint('POST', '/a', { x: 1 })).not.toBe(requestFingerprint('PUT', '/a', { x: 1 }));
    expect(requestFingerprint('POST', '/a', { x: 1 })).not.toBe(requestFingerprint('POST', '/b', { x: 1 }));
    expect(requestFingerprint('POST', '/a', { x: 1 })).not.toBe(requestFingerprint('POST', '/a', { x: 2 }));
    expect(requestFingerprint('POST', '/a', { x: 1 })).toBe(requestFingerprint('post', '/a', { x: 1 }));
  });
});

describe('A12: a village answer is remembered without the village', () => {
  it('stores no file, and a replay reads the village again', async () => {
    const s = setup();
    const a = await s.register('Ann');
    const first = await s.call('POST', Routes.village, a.token, {}, { headers: { 'idempotency-key': 'start-1' } });
    expect(first.body.file).toBeDefined();
    const stored = [...s.repo.idempotencyRows.values()][0]!;
    expect(JSON.stringify(stored.body)).not.toContain('"file"');
    expect(stored.body).toMatchObject({ $refetch: 'village', revision: first.body.revision });
    const replay = await s.call('POST', Routes.village, a.token, {}, { headers: { 'idempotency-key': 'start-1' } });
    expect(replay.headers['idempotent-replay']).toBe('true');
    expect(replay.body.file).toEqual(first.body.file);
    expect(replay.body.$refetch).toBeUndefined();
  });

  it('signing out a token forgets what it was answered', async () => {
    const repo = new MemoryRepo();
    await repo.putIdempotent('aaa', 'k', 200, {}, 0);
    await repo.putIdempotent('bbb', 'k', 200, {}, 0);
    expect(await repo.dropIdempotentScopes(['aaa'])).toBe(1);
    expect(repo.idempotencyRows.size).toBe(1);
  });
});

describe('A28: wrong staff tokens are counted and limited', () => {
  it('counts every refusal and answers 429 after 10 a minute from one address', async () => {
    const s = setup({ adminTokens: { ann: STAFF } });
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) codes.push((await s.call('GET', '/admin/v1/actions', `wrong-${i}-xxxxxxxxxxxxxxxxxxxxxxxx`)).status);
    expect(codes.slice(0, 10).every((c) => c === 401)).toBe(true);
    expect(codes.slice(10)).toEqual([429, 429]);
    expect(s.app.metrics.render()).toMatch(/tk_staff_auth_failures_total\{reason="wrong_token"\} 12/);
    expect((await s.call('GET', '/admin/v1/actions', STAFF)).status).toBe(200);
  });
});

describe('A30: names and friend codes stay out of request logs', () => {
  it('redacts friend codes in the path and names, codes and search text in the query', () => {
    expect(redactUrl('/v1/players/code/KAGE-1234')).toBe('/v1/players/code/[redacted]');
    expect(redactUrl('/v1/players/lookup?name=Ann%20Lee')).toBe('/v1/players/lookup?name=[redacted]');
    expect(redactUrl('/admin/v1/players?q=ann&x=1')).toBe('/admin/v1/players?q=[redacted]&x=1');
    expect(redactUrl('/v1/grove/chat?after=12')).toBe('/v1/grove/chat?after=12');
    expect(redactUrl('/v1/stats?install=abc')).toBe('/v1/stats?install=[redacted]');
  });

  it('the request log line carries the redacted URL', async () => {
    const lines: string[] = [];
    const app = buildServer({ repo: new MemoryRepo(), data, logger: 'info', logStream: { write: (l) => void lines.push(l) } });
    const reg = (await app.inject({ method: 'POST', url: Routes.players, payload: { name: 'Ann' } })).json();
    await app.inject({ method: 'GET', url: '/v1/players/lookup?name=Secret%20Name', headers: { authorization: `Bearer ${reg.token}` } });
    await app.inject({ method: 'GET', url: '/v1/players/code/KAGE-SECRET', headers: { authorization: `Bearer ${reg.token}` } });
    const text = lines.join('');
    expect(text).toContain('/v1/players/lookup?name=[redacted]');
    expect(text).not.toContain('Secret');
    expect(text).not.toContain('KAGE-SECRET');
  });
});

describe('A31: the address the server sees, for TRUST_PROXY checks', () => {
  it('staff and the metrics token can read it; nobody else', async () => {
    const s = setup({ adminTokens: { ann: STAFF }, metricsToken: 'metrics-token-123456', trustProxy: 1 });
    const r = await s.call('GET', '/admin/v1/ip', STAFF, undefined, { ip: '10.0.0.2', headers: { 'x-forwarded-for': '203.0.113.9' } });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ip: '203.0.113.9', rateKey: '203.0.113.9', forwardedFor: '203.0.113.9', socket: '10.0.0.2', trustProxy: 1 });
    expect((await s.call('GET', '/metrics/ip', 'metrics-token-123456')).status).toBe(200);
    expect((await s.call('GET', '/metrics/ip', 'nope')).status).toBe(401);
    expect((await s.call('GET', '/admin/v1/ip', 'nope-nope-nope-nope-nope-nope')).status).toBe(401);
  });
});

describe('A33: the server makes its own request ids', () => {
  it('never takes the caller’s as its own, echoes it separately', async () => {
    const s = setup();
    const r = await s.call('GET', Routes.hello, undefined, undefined, { headers: { 'x-request-id': 'trace-12345678' } });
    expect(String(r.headers['x-request-id'])).toMatch(/^[0-9a-f-]{36}$/);
    expect(r.headers['x-client-request-id']).toBe('trace-12345678');
    expect(clientRequestId('bad id!')).toBeNull();
  });
});
