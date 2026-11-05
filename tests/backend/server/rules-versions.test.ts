/**
 * Surviving game updates (roadmap Phase 1.5, steps 72, 73 and 75): the game
 * says which rules and data it plays with, the server keeps older rule
 * versions and checks each battle with the version its ticket was issued
 * under, and an old game is told to update instead of getting wrong results.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildServer } from '../../../server/app';
import { MemoryRepo } from '../../../server/repo';
import { ARCHIVED_ENGINES } from '../../../server/rules/archive';
import type { RulesFixture } from '../../../server/rules/fixture';
import { liveEngine, parseRetired, RulesRegistry, type RulesEngine } from '../../../server/rules/registry';
import { canonicalJson, combatFingerprintOf, compareBuilds, dataVersionOf } from '../../../src/backend/net/dataVersion';
import { ClientHeaders, PROTOCOL_VERSION, Routes } from '../../../src/backend/net/protocol';
import { updateNeeded } from '../../../src/backend/net/versionCheck';
import { SIM_RULES } from '../../../src/gameplay/sim/battle/battle';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import type { GameData } from '../../../src/gameplay/sim/types';
import { baseAt, rush } from './harness';

/** An "older release": rules 1, defenses hit three times as hard. */
function olderEngine(): RulesEngine & { calls: number } {
  const old = structuredClone(data) as GameData;
  for (const def of Object.values(old.buildings)) {
    if (def.category !== 'defense') continue;
    for (const l of def.levels as { damage?: number }[]) if (typeof l.damage === 'number') l.damage *= 3;
  }
  const e = liveEngine(old);
  const engine: RulesEngine & { calls: number } = { ...e, rules: SIM_RULES - 1, live: false, calls: 0, runBattle: (...a) => (engine.calls++, e.runBattle(...a)) };
  return engine;
}

describe('data versions (step 72)', () => {
  it('canonical JSON ignores key order; the data version follows every value', () => {
    expect(canonicalJson({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe(canonicalJson({ a: [2, { c: 4, d: 3 }], b: 1 }));
    const copy = structuredClone(data) as GameData;
    expect(dataVersionOf(copy)).toBe(dataVersionOf(data));
    const priced = structuredClone(data) as GameData;
    priced.economy.mapSize += 0;
    (priced.ranks as { startingTrophies: number }).startingTrophies += 1;
    expect(dataVersionOf(priced)).not.toBe(dataVersionOf(data));
    expect(dataVersionOf(data)).toMatch(/^[0-9a-f]{14}$/);
  });

  it('the combat fingerprint is the one the rules-version test guards', () => {
    const test = readFileSync('tests/gameplay/battle/rules-version.test.ts', 'utf8');
    const guarded = /fingerprint: '([0-9a-f]{8})'/.exec(test)?.[1];
    expect(combatFingerprintOf(data)).toBe(guarded);
  });

  it('compares builds by their numbers', () => {
    expect(compareBuilds('1.4.2+ios', '1.4.10')).toBeLessThan(0);
    expect(compareBuilds('2.0.0+web', '1.9.9')).toBeGreaterThan(0);
    expect(compareBuilds('1.2', '1.2.0')).toBe(0);
  });
});

describe('the rules registry (step 73)', () => {
  it('serves tools with the live engine, old games with theirs, and refuses rules it no longer has', () => {
    const old = olderEngine();
    const reg = new RulesRegistry(liveEngine(data), { archived: [old] });
    expect(reg.supportedRules()).toEqual([SIM_RULES, SIM_RULES - 1]);
    expect(reg.forClient(undefined)).toBe(reg.live);
    expect(reg.forClient({ rules: SIM_RULES })).toBe(reg.live);
    expect(reg.forClient({ rules: SIM_RULES - 1 })).toBe(old);
    expect(reg.forClient({ rules: SIM_RULES + 5 })).toBeNull();
    // Same rules, a data version the server never saw (prices or text changed): the newest engine with those rules.
    expect(reg.forClient({ rules: SIM_RULES, dataVersion: 'unknown' })).toBe(reg.live);
    expect(reg.forTicket(undefined, undefined)).toBe(reg.live);
    expect(reg.forTicket(SIM_RULES - 1, old.dataVersion)).toBe(old);
  });

  it('retires versions the operators list, never the live one', () => {
    const reg = new RulesRegistry(liveEngine(data), { archived: [olderEngine()], retired: parseRetired(`${SIM_RULES - 1}, ${SIM_RULES}`) });
    expect(reg.supportedRules()).toEqual([SIM_RULES]);
    expect(reg.forClient({ rules: SIM_RULES - 1 })).toBeNull();
  });

  it('has a recorded battle for today\'s rules, and every recorded version still replays exactly', () => {
    const dir = 'tests/backend/fixtures/rules';
    const files = readdirSync(dir).filter((f) => /^v\d+\.json$/.test(f));
    expect(files).toContain(`v${SIM_RULES}.json`);
    const reg = new RulesRegistry(liveEngine(data), { archived: ARCHIVED_ENGINES.map((e) => e()) });
    for (const f of files) {
      const fx = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) as RulesFixture;
      const engine = reg.forTicket(fx.rules, fx.dataVersion);
      if (!engine) continue; // retired: its snapshot was removed on purpose
      const { result } = engine.runBattle(fx.setup, fx.deployments, engine.data, fx.endTick);
      expect({ file: f, hash: result.hash }).toEqual({ file: f, hash: fx.hash });
    }
  });
});

describe('old games on a new server (steps 73, 75)', () => {
  function setup(reg: RulesRegistry) {
    let t = Date.UTC(2026, 2, 1);
    const app = buildServer({ repo: new MemoryRepo(), data, now: () => t, shared: { rules: reg } });
    const call = async (method: 'GET' | 'POST' | 'PUT', url: string, token?: string, payload?: unknown, headers: Record<string, string> = {}) => {
      const r = await app.inject({ method, url, payload: payload as object, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers } });
      return { status: r.statusCode, body: r.body ? JSON.parse(r.body) : null };
    };
    const register = async (name: string) => (await call('POST', Routes.players, undefined, { name })).body as { playerId: string; token: string };
    return { app, call, register, advance: (ms: number) => (t += ms) };
  }
  const game = (rules: number, build = '1.0.0+ios') => ({ [ClientHeaders.protocol]: String(PROTOCOL_VERSION), [ClientHeaders.simRules]: String(rules), [ClientHeaders.clientBuild]: build });

  it('hello lists the rule versions and the oldest build it serves', async () => {
    const s = setup(new RulesRegistry(liveEngine(data), { archived: [olderEngine()], minClientBuild: '1.2.0' }));
    const r = await s.call('GET', Routes.hello);
    expect(r.body).toMatchObject({ supportedRules: [SIM_RULES, SIM_RULES - 1], minClientBuild: '1.2.0', dataVersion: dataVersionOf(data) });
    expect(r.body.features).toContain('rules-versions');
  });

  it('checks an old game\'s battle with the old rules, and a new game\'s with today\'s', async () => {
    const old = olderEngine();
    const s = setup(new RulesRegistry(liveEngine(data), { archived: [old] }));
    const def = await s.register('Defender');
    await s.call('PUT', Routes.base, def.token, { base: baseAt(3) });
    s.advance(100 * 3_600_000);
    const { army, deployments } = rush(20);
    for (const [rules, engine] of [[SIM_RULES - 1, old], [SIM_RULES, liveEngine(data)]] as const) {
      const atk = await s.register(`Attacker ${rules}`);
      await s.call('PUT', Routes.base, atk.token, { base: baseAt(3, 5) });
      const m = await s.call('GET', Routes.match, atk.token, undefined, game(rules));
      expect(m.status).toBe(200);
      const r = await s.call('POST', Routes.attacks, atk.token, { ticket: m.body.ticket, seed: m.body.seed, army, deployments, rules }, game(rules));
      expect(r.status).toBe(200);
      expect(r.body.result.hash).toBe(engine.runBattle({ seed: m.body.seed, base: m.body.base, army, infiltration: true }, deployments, engine.data).result.hash);
      s.advance(2 * 3_600_000);
    }
    // The old game's battle went through the old engine (once on the server, once in this test's check), the new one's did not.
    expect(old.calls).toBe(2);
  });

  it('tells a game whose rules it no longer has, or whose build is too old, to update', async () => {
    const s = setup(new RulesRegistry(liveEngine(data), { minClientBuild: '1.2.0' }));
    const p = await s.register('Pat');
    await s.call('PUT', Routes.base, p.token, { base: baseAt(2) });
    const gone = await s.call('GET', Routes.match, p.token, undefined, game(1, '1.3.0+ios'));
    expect(gone.status).toBe(426);
    expect(gone.body).toMatchObject({ error: 'version_mismatch' });
    const oldBuild = await s.call('GET', Routes.me, p.token, undefined, game(SIM_RULES, '1.1.9+android'));
    expect(oldBuild.status).toBe(426);
    expect((await s.call('GET', Routes.me, p.token, undefined, game(SIM_RULES, '1.2.0+android'))).status).toBe(200);
  });

  it('refuses a report played with other rules than its ticket', async () => {
    const s = setup(new RulesRegistry(liveEngine(data), { archived: [olderEngine()] }));
    const def = await s.register('Defender');
    await s.call('PUT', Routes.base, def.token, { base: baseAt(3) });
    s.advance(100 * 3_600_000);
    const atk = await s.register('Switcher');
    await s.call('PUT', Routes.base, atk.token, { base: baseAt(3, 5) });
    const m = await s.call('GET', Routes.match, atk.token, undefined, game(SIM_RULES - 1));
    const { army, deployments } = rush(20);
    const r = await s.call('POST', Routes.attacks, atk.token, { ticket: m.body.ticket, seed: m.body.seed, army, deployments, rules: SIM_RULES }, game(SIM_RULES));
    expect(r.status).toBe(400);
  });
});

describe('the game asks to update (step 75)', () => {
  it('only when the server cannot check its rules or its build is too old', () => {
    expect(updateNeeded({}, SIM_RULES, '1.0.0+ios')).toBeNull();
    expect(updateNeeded({ supportedRules: [SIM_RULES, SIM_RULES - 1] }, SIM_RULES, '1.0.0+ios')).toBeNull();
    expect(updateNeeded({ supportedRules: [SIM_RULES + 1] }, SIM_RULES, '1.0.0+ios')).toMatch(/Update the game/);
    expect(updateNeeded({ minClientBuild: '1.2.0' }, SIM_RULES, '1.1.0+ios')).toMatch(/1\.1\.0.*1\.2\.0/);
    expect(updateNeeded({ minClientBuild: '1.2.0' }, SIM_RULES, 'unknown')).toBeNull();
  });
});
