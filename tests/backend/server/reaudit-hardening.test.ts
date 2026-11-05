/**
 * Server re-audit (November 2026), operations and abuse findings: backdated
 * commands, battle commands per minute, refused commands filling the
 * database, legacy batches after device numbering, idempotency before auth,
 * spoofable / CGNAT-hostile IP limits, the purchase rate rule, Postgres pool
 * and TLS settings, Redis outages, per-staff admin tokens and response
 * compression. Village tests run on memory and (with TEST_DATABASE_URL) Postgres.
 */
import { createServer, type Server } from 'node:net';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { describe, expect, it, onTestFinished } from 'vitest';
import { buildServer, pickEncoding, type ServerOptions } from '../../../server/app';
import { checkConfig, parseAdminTokens, parseTrustProxy, pgPoolSettings, pgTls } from '../../../server/config';
import { MAX_BACKDATE_MS, MAX_COMMAND_BYTES } from '../../../server/core/village';
import { BATTLE_COMMANDS_PER_MINUTE, DEFAULT_RATE_LIMITS, ipAllowList, ipKey, MemoryRateLimiter, type RateLimiter } from '../../../server/rateLimit';
import { RedisClient, type RedisCommander } from '../../../server/redis';
import { MemoryRepo, type Player } from '../../../server/repo';
import { RedisLeaderboard, RedisLocks, RedisRateLimiter } from '../../../server/shared';
import { ServerError } from '../../../src/backend/net/ports';
import { Routes, type VillageCommand } from '../../../src/backend/net/protocol';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { deserialize } from '../../../src/gameplay/sim/save';
import { HOUR, world } from './harness';
import { repoFactories } from './pg';

const MIN = 60_000;
const DAY = 24 * HOUR;

for (const [label, makeRepo] of repoFactories) {
  describe(`village commands on ${label} storage (re-audit)`, () => {
    async function scene() {
      const w = world({ repo: await makeRepo() });
      const ann = await w.player('Ann');
      await ann.startVillage();
      return { w, ann };
    }

    it('dates a command at most MAX_BACKDATE_MS before the server clock', async () => {
      const { w, ann } = await scene();
      const t0 = w.now();
      w.advance(3 * DAY);
      const v = deserialize((await ann.getVillage())!.file, w.data);
      const keep = v.buildings.find((b) => b.type === 'elder_toadstool')!;
      // Dated almost three days back, right after the village's last change: before, it counted then.
      const r = await ann.sendCommands({ device: 'device-backdate', stateHash: '', commands: [{ seq: 1, t: t0 + HOUR, command: { type: 'upgrade', id: keep.id } }] });
      expect(r.results).toEqual([{ seq: 1, ok: true }]);
      expect(r.corrections).toBeDefined();
      const [logged] = await w.repo.commandsOf(ann.id, 0, 10);
      expect(logged.at).toBe(w.now() - MAX_BACKDATE_MS);
      expect(logged.clientAt).toBe(t0 + HOUR);
      const after = deserialize((await ann.getVillage())!.file, w.data);
      expect(after.buildings.find((b) => b.id === keep.id)!.upgrade?.startedAt ?? w.now() - MAX_BACKDATE_MS).toBe(w.now() - MAX_BACKDATE_MS);
      // A command inside the bound keeps its own time.
      const inside = w.now() - HOUR;
      await ann.sendCommands({ device: 'device-backdate', stateHash: '', commands: [{ seq: 2, t: inside, command: { type: 'collect', id: 'nothing' } }] });
      expect((await w.repo.commandsOf(ann.id, 1, 10))[0].at).toBe(inside);
    });

    it('logs only the type of a refused command and rewrites nothing when a whole batch is refused', async () => {
      const { w, ann } = await scene();
      const before = (await ann.getVillage())!;
      const baseBefore = (await w.repo.getPlayer(ann.id))!.updatedAt;
      // Count full village writes on the class (Postgres runs them on a transaction's own handle).
      let saves = 0;
      const proto = Object.getPrototypeOf(w.repo) as { saveVillage: (...a: unknown[]) => Promise<boolean> };
      const save = proto.saveVillage;
      proto.saveVillage = function (this: unknown, ...a: unknown[]) {
        saves++;
        return save.apply(this, a);
      };
      onTestFinished(() => void (proto.saveVillage = save));
      w.advance(MIN);
      const pad = 'x'.repeat(1200);
      const junk = (seq: number) => ({ seq, t: w.now(), command: { type: `nope-${'y'.repeat(80)}`, pad } as never });
      const r = await ann.sendCommands({ device: 'device-junk-01', stateHash: '', commands: [1, 2, 3].map(junk) });
      expect(r.results.map((x) => x.error)).toEqual(['NOT_ALLOWED', 'NOT_ALLOWED', 'NOT_ALLOWED']);
      expect(r.ackSeq).toBe(3);
      expect(r.revision).toBe(before.revision + 1);
      expect(saves).toBe(0); // the village file was not rewritten
      expect((await w.repo.getPlayer(ann.id))!.updatedAt).toBe(baseBefore); // nor the raid base
      const row = (await ann.getVillage())!;
      expect(row).toMatchObject({ revision: before.revision + 1, seq: 3, at: before.at, stateHash: before.stateHash });
      const log = await w.repo.commandsOf(ann.id, 0, 10);
      expect(log).toHaveLength(3);
      for (const l of log) {
        expect(l.ok).toBe(false);
        expect(l.error).toBe('NOT_ALLOWED');
        expect(l.type.length).toBeLessThanOrEqual(40);
        expect(l.command).toEqual({ type: l.type });
      }
      // A retried batch changes nothing; the numbers were remembered.
      const again = await ann.sendCommands({ device: 'device-junk-01', stateHash: '', commands: [1, 2, 3].map(junk) });
      expect(again).toMatchObject({ ackSeq: 3, results: [], revision: before.revision + 1 });
      // A real command afterwards is applied and saved as usual (the revision check still holds).
      const ok = await ann.sendCommands({ device: 'device-junk-01', stateHash: '', commands: [{ seq: 4, t: w.now(), command: { type: 'setProfile', under18: null } as never }] });
      expect(ok.results[0].ok).toBe(true);
      expect(saves).toBe(1);
      expect((await w.repo.commandsOf(ann.id, 3, 10))[0].command).toEqual({ type: 'setProfile', under18: null });
    });

    it('refuses a command larger than MAX_COMMAND_BYTES as TOO_LARGE', async () => {
      const { w, ann } = await scene();
      const big = { type: 'collect', id: 'b1', pad: 'z'.repeat(MAX_COMMAND_BYTES) } as never;
      const r = await ann.sendCommands({ device: 'device-large-1', stateHash: '', commands: [{ seq: 1, t: w.now(), command: big }] });
      expect(r.results).toEqual([{ seq: 1, ok: false, error: 'TOO_LARGE' }]);
      expect((await w.repo.commandsOf(ann.id, 0, 1))[0].command).toEqual({ type: 'collect' });
    });

    it('refuses a batch without a device id once device-numbered queues write to the village (426, update the game)', async () => {
      const { w, ann } = await scene();
      const cmd = (seq: number): VillageCommand => ({ seq, t: w.now(), command: { type: 'setProfile', under18: null } as never });
      // Before any device batch an old game still works as it did.
      expect((await ann.sendCommands({ stateHash: '', commands: [cmd(1)] })).ackSeq).toBe(1);
      await ann.sendCommands({ device: 'phone-new-0001', stateHash: '', commands: [cmd(1), cmd(2)] });
      const old = ann.sendCommands({ stateHash: '', commands: [cmd(2), cmd(3)] });
      await expect(old).rejects.toBeInstanceOf(ServerError);
      await expect(old).rejects.toMatchObject({ status: 426, code: 'version_mismatch' });
      // Nothing from the old game was acknowledged or logged.
      expect((await ann.getVillage())!.seq).toBe(3);
    });

    it(`caps battle commands at ${BATTLE_COMMANDS_PER_MINUTE} a minute per player, across batches`, async () => {
      const { w, ann } = await scene();
      let seq = 0;
      const trial = () => ({ seq: ++seq, t: w.now(), command: { type: 'trialEnd', tier: 1, record: {} } as never });
      const send = async (n: number) => (await ann.sendCommands({ device: 'device-battles', stateHash: '', commands: Array.from({ length: n }, trial) })).results.map((r) => r.error);
      const first = [...(await send(3)), ...(await send(3))];
      expect(first).not.toContain('TOO_MANY_BATTLES');
      expect(await send(1)).toEqual(['TOO_MANY_BATTLES']);
      w.advance(MIN + 1);
      expect(await send(1)).not.toContain('TOO_MANY_BATTLES');
    });
  });
}

// ------------------------------------------------------------------ HTTP adapter

function setup(opts: Partial<ServerOptions> = {}) {
  let t = Date.UTC(2026, 10, 5);
  const repo = (opts.repo as MemoryRepo | undefined) ?? new MemoryRepo();
  const app = buildServer({ repo, data, now: () => t, ...opts });
  const call = async (method: 'GET' | 'POST' | 'PUT', url: string, token?: string, payload?: unknown, extra: { ip?: string; headers?: Record<string, string> } = {}) => {
    const r = await app.inject({ method, url, payload: payload as object, remoteAddress: extra.ip, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra.headers } });
    return { status: r.statusCode, raw: r.rawPayload, body: r.headers['content-encoding'] ? null : r.body ? JSON.parse(r.body) : null, headers: r.headers };
  };
  const register = async (name: string, ip?: string) => (await call('POST', Routes.players, undefined, { name }, { ip })).body as { playerId: string; token: string };
  return { app, repo, call, register, advance: (ms: number) => (t += ms), now: () => t };
}

describe('idempotency after the rate limits and the token check', () => {
  it('never looks up junk tokens, and a banned token gets no stored answer replayed', async () => {
    const repo = new MemoryRepo();
    let lookups = 0;
    const get = repo.getIdempotent.bind(repo);
    repo.getIdempotent = async (...a) => {
      lookups++;
      return get(...a);
    };
    const s = setup({ repo, rateLimits: { ip: { limit: 10, windowMs: MIN } } });
    const codes: number[] = [];
    for (let i = 0; i < 30; i++) codes.push((await s.call('POST', Routes.attacks, `junk${i}`, {}, { headers: { 'idempotency-key': `k${i}` } })).status);
    expect(codes.filter((c) => c === 429)).toHaveLength(20);
    expect(lookups).toBe(0); // was 30: one database read per junk request, before the limiter

    const s2 = setup({ repo });
    const a = await s2.register('Ann');
    const first = await s2.call('POST', Routes.village, a.token, {}, { headers: { 'idempotency-key': 'start-1' } });
    expect(first.status).toBe(200);
    const replay = await s2.call('POST', Routes.village, a.token, {}, { headers: { 'idempotency-key': 'start-1' } });
    expect(replay.headers['idempotent-replay']).toBe('true');
    await repo.updatePlayer(a.playerId, { bannedUntil: s2.now() + HOUR });
    const banned = await s2.call('POST', Routes.village, a.token, {}, { headers: { 'idempotency-key': 'start-1' } });
    expect(banned.status).toBe(403);
    expect(banned.headers['idempotent-replay']).toBeUndefined();
  });
});

describe('IP limits: proxies, IPv6 and carrier-grade NAT', () => {
  it('counts IPv6 per /64 and IPv4-mapped addresses as IPv4', () => {
    expect(ipKey('2001:db8:1:2:aaaa::1')).toBe('2001:db8:1:2::/64');
    expect(ipKey('2001:db8:1:2:ffff:ffff:ffff:ffff')).toBe('2001:db8:1:2::/64');
    expect(ipKey('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(ipKey('::1')).toBe('0:0:0:0::/64');
    expect(ipKey('::ffff:203.0.113.9')).toBe('203.0.113.9');
    expect(ipKey('203.0.113.9')).toBe('203.0.113.9');
  });

  it('shares one budget per IPv6 /64, and loose defaults for shared IPv4 addresses', async () => {
    expect(DEFAULT_RATE_LIMITS.register.limit).toBeGreaterThanOrEqual(300);
    expect(DEFAULT_RATE_LIMITS.ip.limit).toBeGreaterThanOrEqual(3000);
    const s = setup({ rateLimits: { register: { limit: 2, windowMs: HOUR } } });
    const reg = async (name: string, ip: string) => (await s.call('POST', Routes.players, undefined, { name }, { ip })).status;
    expect(await reg('Ann', '2001:db8:1:2::a')).toBe(201);
    expect(await reg('Ben', '2001:db8:1:2::b')).toBe(201);
    expect(await reg('Cat', '2001:db8:1:2:9::c')).toBe(429); // same /64, new address: same budget
    expect(await reg('Dot', '2001:db8:1:3::a')).toBe(201); // another subscriber
  });

  it('with a hop count, a client cannot choose its address through X-Forwarded-For (TRUST_PROXY=true could)', async () => {
    const run = async (trustProxy: boolean | number) => {
      const s = setup({ trustProxy, rateLimits: { register: { limit: 3, windowMs: HOUR } } });
      let created = 0;
      for (let i = 0; i < 6; i++) {
        // The load balancer (10.0.0.1) appends the real client after whatever the client sent.
        const r = await s.app.inject({ method: 'POST', url: Routes.players, payload: { name: `P${i}x` }, remoteAddress: '10.0.0.1', headers: { 'x-forwarded-for': `203.0.113.${i}, 198.51.100.7` } });
        if (r.statusCode === 201) created++;
      }
      return created;
    };
    expect(await run(1)).toBe(3);
    expect(await run(true)).toBe(6);
  });

  it('production refuses TRUST_PROXY=true and an unset TRUST_PROXY', () => {
    const prod = { DEPLOY_ENV: 'production', DATABASE_URL: 'postgres://db.internal/kagemura', ADMIN_TOKENS: `ann:${'a'.repeat(32)}`, CORS_ORIGIN: 'https://game.example' };
    expect(checkConfig(prod).errors.join('\n')).toMatch(/TRUST_PROXY must be set/);
    expect(checkConfig({ ...prod, TRUST_PROXY: 'true' }).errors.join('\n')).toMatch(/X-Forwarded-For/);
    for (const ok of ['1', '2', 'false', '10.0.0.0/8,fd00::/8', 'loopback']) expect(checkConfig({ ...prod, TRUST_PROXY: ok }).errors).toEqual([]);
    expect(checkConfig({ ...prod, TRUST_PROXY: 'my-lb' }).errors.join('\n')).toMatch(/TRUST_PROXY/);
    expect(checkConfig({ DEPLOY_ENV: 'staging', TRUST_PROXY: 'true' }).warnings.join('\n')).toMatch(/TRUST_PROXY=true/);
    expect(parseTrustProxy(undefined)).toBe(false);
    expect(parseTrustProxy('1')).toBe(1);
    expect(parseTrustProxy('10.0.0.0/8, 192.168.1.1')).toBe('10.0.0.0/8,192.168.1.1');
  });
});

describe('purchases have their own rate rule', () => {
  it('a player who used up the moderation budget can still buy', async () => {
    const s = setup({ rateLimits: { moderation: { limit: 1, windowMs: HOUR }, purchase: { limit: 2, windowMs: HOUR } } });
    const a = await s.register('Ann');
    const b = await s.register('Ben');
    expect((await s.call('POST', Routes.blocks, a.token, { playerId: b.playerId })).status).not.toBe(429);
    expect((await s.call('POST', Routes.blocks, a.token, { playerId: b.playerId })).status).toBe(429);
    const intent = () => s.call('POST', Routes.purchaseIntent, a.token, { store: 'apple', productId: 'jade_pouch' });
    expect((await intent()).status).not.toBe(429);
    expect((await s.call('GET', Routes.purchases, a.token)).status).not.toBe(429);
    expect((await intent()).status).toBe(429);
    expect(DEFAULT_RATE_LIMITS.purchase.limit).toBeGreaterThan(DEFAULT_RATE_LIMITS.moderation.limit);
  });
});

describe('the core uses the adapter’s shared limiter', () => {
  it('counts battle commands in the limiter given to buildServer (Redis when shared)', async () => {
    const hits: string[] = [];
    const inner = new MemoryRateLimiter();
    const limiter: RateLimiter = { hit: (rule, key, now) => (hits.push(rule), inner.hit(rule, key, now)) };
    const s = setup({ rateLimiter: limiter });
    const a = await s.register('Ann');
    await s.call('POST', Routes.village, a.token, {});
    const r = await s.call('POST', Routes.villageCommands, a.token, { device: 'device-battles', stateHash: '', commands: [{ seq: 1, t: s.now(), command: { type: 'abandonBattle', record: {} } }] });
    expect(r.status).toBe(200);
    expect(hits).toContain('battleCommands');
  });
});

describe('response compression', () => {
  it('picks br, then gzip, as the caller accepts', () => {
    expect(pickEncoding('gzip, deflate, br')).toBe('br');
    expect(pickEncoding('gzip, br;q=0')).toBe('gzip');
    expect(pickEncoding('identity')).toBeNull();
    expect(pickEncoding(undefined)).toBeNull();
    expect(pickEncoding('*')).toBe('br');
    expect(pickEncoding('*, br;q=0, gzip;q=0')).toBeNull();
  });

  it('compresses large JSON answers, leaves small ones and callers that do not accept it alone', async () => {
    const s = setup();
    const a = await s.register('Ann');
    const plain = await s.call('POST', Routes.village, a.token, {});
    expect(plain.headers['content-encoding']).toBeUndefined();
    const size = plain.raw.length;
    expect(size).toBeGreaterThan(1024);
    const gz = await s.call('GET', Routes.village, a.token, undefined, { headers: { 'accept-encoding': 'gzip' } });
    expect(gz.headers['content-encoding']).toBe('gzip');
    expect(String(gz.headers.vary)).toMatch(/Accept-Encoding/);
    expect(gz.raw.length).toBeLessThan(size / 2);
    expect(JSON.parse(gunzipSync(gz.raw).toString())).toEqual(plain.body);
    const br = await s.call('GET', Routes.village, a.token, undefined, { headers: { 'accept-encoding': 'gzip, br' } });
    expect(br.headers['content-encoding']).toBe('br');
    expect(JSON.parse(brotliDecompressSync(br.raw).toString())).toEqual(plain.body);
    const small = await s.call('GET', Routes.me, a.token, undefined, { headers: { 'accept-encoding': 'gzip' } });
    expect(small.headers['content-encoding']).toBeUndefined();
    // An idempotent answer is stored as JSON and replayed (compressed again) the same.
    const first = await s.call('POST', Routes.village, a.token, {}, { headers: { 'accept-encoding': 'gzip', 'idempotency-key': 'k-start' } });
    const again = await s.call('POST', Routes.village, a.token, {}, { headers: { 'accept-encoding': 'gzip', 'idempotency-key': 'k-start' } });
    expect(again.headers['idempotent-replay']).toBe('true');
    expect(JSON.parse(gunzipSync(again.raw).toString())).toEqual(JSON.parse(gunzipSync(first.raw).toString()));
  });
});

describe('staff tokens', () => {
  const ANN = 'ann-staff-token-0123456789abcdef';
  const BEN = 'ben-staff-token-0123456789abcdef';
  const LEGACY = 'legacy-shared-token-0123456789ab';

  it('names the holder of a per-staff token in the staff log and ignores x-staff-name', async () => {
    const s = setup({ adminTokens: { Ann: ANN, Ben: BEN }, adminToken: LEGACY });
    const p = await s.register('Pia');
    const ban = (token: string, name: string) => s.call('POST', `/admin/v1/players/${p.playerId}/ban`, token, { hours: 1, reason: 'test' }, { headers: { 'x-staff-name': name } });
    expect((await ban(ANN, 'Somebody Else')).status).toBe(200);
    expect((await ban(LEGACY, 'Sam')).status).toBe(200);
    expect((await ban('nope-nope-nope-nope-nope-nope', 'Ann')).status).toBe(401);
    const actions = (await s.call('GET', '/admin/v1/actions', BEN)).body;
    const actors = (actions.actions ?? actions.staffActions ?? actions).map((x: { actor: string }) => x.actor);
    expect(actors).toEqual(expect.arrayContaining(['Ann', 'Sam']));
    expect(actors).not.toContain('Somebody Else');
  });

  it('refuses short or malformed ADMIN_TOKENS', () => {
    expect(() => buildServer({ repo: new MemoryRepo(), data, adminTokens: { Ann: 'short' } })).toThrow(/24 characters/);
    expect(parseAdminTokens(`Ann Lee:${ANN}, ben:${BEN}`)).toEqual({ 'Ann Lee': ANN, ben: BEN });
    expect(() => parseAdminTokens(`ann:${ANN},ann:${BEN}`)).toThrow(/twice/);
    expect(() => parseAdminTokens(`ann:${ANN},ben:${ANN}`)).toThrow(/own token/);
    expect(() => parseAdminTokens(ANN)).toThrow(/name:token/);
    expect(() => parseAdminTokens('ann:short')).toThrow(/24/);
    const prod = { DEPLOY_ENV: 'production', DATABASE_URL: 'postgres://db.internal/k', CORS_ORIGIN: 'https://game.example', TRUST_PROXY: '1' };
    expect(checkConfig(prod).errors.join('\n')).toMatch(/ADMIN_TOKENS/);
    expect(checkConfig({ ...prod, ADMIN_TOKENS: `ann:${ANN}` }).errors).toEqual([]);
    expect(checkConfig({ ...prod, ADMIN_TOKEN: LEGACY }).warnings.join('\n')).toMatch(/ADMIN_TOKENS/);
    expect(checkConfig({ ...prod, ADMIN_TOKENS: 'ann:short' }).errors.join('\n')).toMatch(/24/);
  });

  it('serves /admin… only to ADMIN_ALLOW_IPS', async () => {
    const s = setup({ adminTokens: { Ann: ANN }, adminAllowIps: ['192.0.2.0/24', '2001:db8:aa::/48'] });
    expect((await s.call('GET', '/admin/v1/actions', ANN, undefined, { ip: '192.0.2.44' })).status).toBe(200);
    expect((await s.call('GET', '/admin/v1/actions', ANN, undefined, { ip: '::ffff:192.0.2.44' })).status).toBe(200);
    expect((await s.call('GET', '/admin/v1/actions', ANN, undefined, { ip: '2001:db8:aa:1::5' })).status).toBe(200);
    expect((await s.call('GET', '/admin/v1/actions', ANN, undefined, { ip: '198.51.100.1' })).status).toBe(404);
    expect((await s.call('GET', '/admin', undefined, undefined, { ip: '198.51.100.1' })).status).toBe(404);
    expect((await s.call('GET', Routes.hello, undefined, undefined, { ip: '198.51.100.1' })).status).toBe(200);
    const allow = ipAllowList(['10.0.0.0/8']);
    expect([allow('10.1.2.3'), allow('11.0.0.1'), allow('not an ip')]).toEqual([true, false, false]);
    expect(() => ipAllowList(['10.0.0.0/33'])).toThrow();
    expect(checkConfig({ ADMIN_ALLOW_IPS: '10.0.0.0/8, office' }).errors.join('\n')).toMatch(/ADMIN_ALLOW_IPS/);
  });
});

describe('Postgres pool and TLS settings', () => {
  const PEM = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n';

  it('bounds the pool and sets statement and idle-transaction timeouts (none for migrations)', () => {
    expect(pgPoolSettings({})).toEqual({ max: 10, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30_000, statement_timeout: 30_000, idle_in_transaction_session_timeout: 60_000 });
    expect(pgPoolSettings({ PG_POOL_MAX: '25', PG_STATEMENT_TIMEOUT_MS: '0' })).toMatchObject({ max: 25 });
    expect(pgPoolSettings({ PG_STATEMENT_TIMEOUT_MS: '0' }).statement_timeout).toBeUndefined();
    expect(pgPoolSettings({}, { migrations: true }).statement_timeout).toBeUndefined();
    expect(() => pgPoolSettings({ PG_POOL_MAX: 'lots' })).toThrow(/PG_POOL_MAX/);
  });

  it('verifies the server unless unverified TLS is asked for explicitly', () => {
    const read = (p: string) => (p === '/etc/ca.pem' ? PEM : '');
    const plain = pgTls('postgres://u:p@db.internal:5432/k', {});
    expect(plain).toMatchObject({ ssl: false, mode: 'none' });
    const withCa = pgTls('postgres://u:p@db.example.com/k?sslmode=require', { PG_CA_CERT: '/etc/ca.pem' }, read);
    expect(withCa).toMatchObject({ verified: true, ssl: { ca: PEM, rejectUnauthorized: true } });
    // The TLS parameters leave the URL, so pg cannot override the ssl settings with them.
    expect(withCa.connectionString).toBe('postgres://u:p@db.example.com/k');
    expect(pgTls('postgres://h/k?sslmode=verify-full', {})).toMatchObject({ verified: true, ssl: { rejectUnauthorized: true } });
    expect(pgTls('postgres://h/k?sslmode=require', {})).toMatchObject({ verified: true, ssl: { rejectUnauthorized: true } });
    expect(pgTls('postgres://h/k?sslmode=require', { PG_SSL_ALLOW_UNVERIFIED: '1' })).toMatchObject({ verified: false, ssl: { rejectUnauthorized: false } });
    expect(pgTls('postgres://h/k?sslmode=verify-ca', { PG_CA_CERT: PEM }).ssl).toMatchObject({ ca: PEM, checkServerIdentity: expect.any(Function) });
    const prod = { DEPLOY_ENV: 'production', ADMIN_TOKENS: `ann:${'a'.repeat(32)}`, CORS_ORIGIN: 'https://game.example', TRUST_PROXY: '1' };
    expect(checkConfig({ ...prod, DATABASE_URL: 'postgres://h/k?sslmode=no-verify' }).errors.join('\n')).toMatch(/unverified/);
    expect(checkConfig({ ...prod, DATABASE_URL: 'postgres://h/k?sslmode=no-verify', PG_SSL_ALLOW_UNVERIFIED: '1' }).errors).toEqual([]);
    expect(checkConfig({ ...prod, DATABASE_URL: 'postgres://h/k?sslmode=require', PG_SSL_ALLOW_UNVERIFIED: '1' }).warnings.join('\n')).toMatch(/not checked/);
    expect(checkConfig({ ...prod, DATABASE_URL: 'postgres://h/k?sslmode=require', PG_CA_CERT: '/no/such/file.pem' }).errors.join('\n')).toMatch(/PG_CA_CERT/);
  });
});

describe('a Redis outage degrades instead of failing requests', () => {
  const down: RedisCommander = {
    available: false,
    command: async () => {
      throw new Error('Redis is unavailable');
    },
    close: async () => undefined,
  };

  it('rate limits fail open, the leaderboard reads the database, locks fall back to tickets', async () => {
    const errors: string[] = [];
    const onError = (use: string) => void errors.push(use);
    expect(await new RedisRateLimiter(down, DEFAULT_RATE_LIMITS, 'x:', onError).hit('ip', 'k', 0)).toEqual({ ok: true, retryAfterMs: 0 });
    const repo = new MemoryRepo();
    const T = Date.UTC(2026, 10, 5);
    const p = (id: string, trophies: number): Player => ({ id, name: id, tokenHash: id, trophies, hallLevel: 1, shieldUntil: 0, base: { name: id, hallLevel: 1, buildings: [] }, groveId: null, createdAt: T, updatedAt: T, lastSeenAt: T });
    await repo.createPlayer(p('a', 100));
    await repo.createPlayer(p('b', 300));
    const board = new RedisLeaderboard(down, 'b', { repo, onError });
    await board.set('a', 120, T); // no throw
    expect((await board.top(5)).map((e) => e.id)).toEqual(['b', 'a']);
    expect(await board.rankOf(200)).toBe(2);
    const locks = new RedisLocks(down, 'l:', onError);
    expect(locks.external).toBe(false); // matchmaking skips defenders with open tickets again
    expect(await locks.lockedAmong(['a'])).toEqual(new Set());
    expect(await locks.acquire('a', 'b', 1000)).toBe(true);
    await locks.release('a', 'b');
    expect(errors).toEqual(expect.arrayContaining(['rateLimit', 'leaderboard', 'locks']));
    // Without a fallback the old behaviour stays (errors reach the caller).
    await expect(new RedisLeaderboard(down, 'b').top(1)).rejects.toThrow();
  });

  it('a Redis that stops answering costs one short timeout, then fails fast', async () => {
    // Accepts connections and never answers (a hung or overloaded Redis).
    const sockets: import('node:net').Socket[] = [];
    const server: Server = createServer((s) => void sockets.push(s));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as { port: number }).port;
    const c = new RedisClient({ host: '127.0.0.1', port, timeoutMs: 200, retryMs: 5_000 });
    let t = Date.now();
    await expect(c.command('PING')).rejects.toThrow(/in time/);
    expect(Date.now() - t).toBeLessThan(1000);
    expect(c.available).toBe(false);
    t = Date.now();
    await expect(c.command('PING')).rejects.toThrow(/unavailable/);
    expect(Date.now() - t).toBeLessThan(50);
    // Nothing listening at all: the connection failure trips the breaker too.
    const closed = new RedisClient({ host: '127.0.0.1', port: 1, retryMs: 5_000 });
    await expect(closed.command('PING')).rejects.toThrow();
    expect(closed.available).toBe(false);
    for (const s of sockets) s.destroy();
    await new Promise((r) => server.close(r));
    await c.close();
    await closed.close();
  });
});
