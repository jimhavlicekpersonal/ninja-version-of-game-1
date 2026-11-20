/**
 * Security audit 2026-11-20 (docs/store/WORLDWIDE_AUDIT.md "2026-11-20 security audit"): the server's
 * web surface. Each test reproduces a finding against the code before the fix.
 *
 * A1-A3: the router decodes percent-escapes before it matches, so `/%61dmin/…` reached the `/admin/…`
 * routes and `/%761/…` the `/v1/…` routes, while the hooks checked the raw URL.
 * A4: /readyz named internal hosts in its answer and skipped every rate limit.
 * A5: wrong /metrics tokens were never counted or limited.
 */
import { describe, expect, it } from 'vitest';
import { Routes } from '../../../src/backend/net/protocol';
import { checkConfig } from '../../../server/config';
import { MemoryRepo } from '../../../server/repo';
import { setup as http } from './httpHarness';

const STAFF = 'S'.repeat(32);
const OUTSIDE = '203.0.113.9';

describe('security audit 2026-11-20: percent-encoded paths (A1-A3)', () => {
  it('A1: ADMIN_ALLOW_IPS holds for every spelling of /admin', async () => {
    const s = http({ adminTokens: { alice: STAFF }, adminAllowIps: ['10.0.0.0/8'] });
    for (const url of ['/admin/v1/actions', '/%61dmin/v1/actions', '/a%64min/v1/actions', '/%61dmin', '/%61dmin/app.js', '/admin%2Fv1/actions']) {
      const r = await s.app.inject({ method: 'GET', url, remoteAddress: OUTSIDE, headers: { authorization: `Bearer ${STAFF}` } });
      expect(r.statusCode, url).toBe(404);
    }
    expect((await s.call('GET', '/admin/v1/actions', STAFF, undefined, { ip: '10.1.2.3' })).status).toBe(200);
  });

  it('A2: UNDER13_MODE=offline refuses every spelling of /v1', async () => {
    const s = http({ shared: { policy: { under13Mode: 'offline' } } });
    const kid = await s.register('Small One');
    await s.call('PUT', Routes.meAge, kid.token, { band: 'under13' });
    for (const [method, url] of [['GET', '/v1/me'], ['GET', '/%761/me'], ['GET', '/v%31/friends'], ['POST', '/%761/village']] as const) {
      const r = await s.call(method, url, kid.token);
      expect(r.status, url).toBe(403);
      expect((r.body as { error: string }).error).toBe('age_restricted');
    }
  });

  it('A3: a per-player limit is one bucket whatever the path spelling', async () => {
    const s = http({ rateLimits: { lookup: { limit: 3, windowMs: 60_000 }, lookupDay: { limit: 3, windowMs: 86_400_000 } } });
    const me = await s.register('Scraper');
    await s.register('Target One');
    const codes: number[] = [];
    for (const url of ['/v1/players/lookup', '/v1/players/lookup', '/%761/players/lookup', '/v%31/players/lookup', '/v1/players/lookup']) {
      codes.push((await s.call('GET', `${url}?name=Target%20One`, me.token)).status);
    }
    expect(codes).toEqual([200, 200, 200, 429, 429]);
  });
});

describe('security audit 2026-11-20: probes and metrics (A4, A5)', () => {
  it('A4: /readyz says only ok/down and counts against the address limit', async () => {
    const repo = new MemoryRepo();
    (repo as unknown as { ping: () => Promise<void> }).ping = async () => {
      throw new Error('getaddrinfo ENOTFOUND db-primary.internal.example:5432 (user kagemura_app)');
    };
    const s = http({ repo, rateLimits: { ip: { limit: 3, windowMs: 60_000 } } });
    const r = await s.app.inject({ method: 'GET', url: '/readyz', remoteAddress: '198.51.100.1' });
    expect(r.statusCode).toBe(503);
    expect(r.body).not.toContain('internal.example');
    expect(r.json().checks.db).toBe('down');
    const codes: number[] = [];
    for (let i = 0; i < 4; i++) codes.push((await s.app.inject({ method: 'GET', url: '/readyz', remoteAddress: '198.51.100.1' })).statusCode);
    expect(codes.at(-1)).toBe(429);
    // liveness stays outside the limit (load balancers)
    expect((await s.app.inject({ method: 'GET', url: '/healthz', remoteAddress: '198.51.100.1' })).statusCode).toBe(200);
  });

  it('A5: wrong /metrics tokens are limited per address like staff tokens', async () => {
    const s = http({ metricsToken: 'm'.repeat(32), rateLimits: { staffAuth: { limit: 5, windowMs: 60_000 } } });
    const codes: number[] = [];
    for (let i = 0; i < 8; i++) codes.push((await s.app.inject({ method: 'GET', url: '/metrics', remoteAddress: '198.51.100.2', headers: { authorization: `Bearer guess${i}` } })).statusCode);
    expect(codes.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(codes.at(-1)).toBe(429);
  });

  it('A5: production refuses a short METRICS_TOKEN', () => {
    const r = checkConfig({ DEPLOY_ENV: 'production', METRICS_TOKEN: 'short-token' });
    expect(r.errors.some((e) => e.includes('METRICS_TOKEN'))).toBe(true);
  });
});
