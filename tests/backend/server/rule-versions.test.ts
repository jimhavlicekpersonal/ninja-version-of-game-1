/**
 * Surviving game updates (roadmap steps 72-75): tickets remember the battle
 * rules and data version they were issued under and reports must match; the
 * server keeps released rule versions (generated snapshots, never edited) and
 * re-simulates each battle with its ticket's; one recorded battle per kept
 * version replays to its recorded hash; /v1/hello lists the rules it keeps
 * and the oldest game version allowed, and a game outside them pauses online
 * play with "Update Kagemura".
 *
 * Recording a version's battle (once, when the version is added):
 *   RECORD_RULE_BATTLES=1 npx vitest run tests/backend/server/rule-versions.test.ts
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildServer } from '../../../server/app';
import { PromMetrics } from '../../../server/observability';
import { MemoryRepo } from '../../../server/repo';
import { ruleSet, supportedRules } from '../../../server/rules';
import { InProcessServerAdapter } from '../../../server/inProcess';
import { buildOlderThan, buildParts, updateReason } from '../../../src/backend/net/clientVersion';
import { Connection, type GameLink, type KeyValue } from '../../../src/backend/net/connection';
import { Routes } from '../../../src/backend/net/protocol';
import { createBattle, runBattle, SIM_RULES } from '../../../src/gameplay/sim/battle/battle';
import { generateOpponent } from '../../../src/gameplay/sim/battle/basegen';
import type { BattleSetup, Deployment } from '../../../src/gameplay/sim/battle/types';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { botDeployments } from '../../../src/gameplay/sim/defense';
import { botArmy } from '../../../src/gameplay/sim/matchmaking';
import { troopLevelCapAt } from '../../../src/gameplay/sim/research';
import { createRng } from '../../../src/gameplay/sim/rng';
import type { VillageState } from '../../../src/gameplay/sim/types';
import { dataVersion } from '../../../src/gameplay/sim/version';
import { applyCommand, createNewVillage, type Command } from '../../../src/gameplay/sim/village';
import { baseAt, rush, world } from './harness';

const ROOT = resolve(__dirname, '../../..');
const FIXTURES = join(ROOT, 'tests/backend/fixtures/rules');

interface Recorded {
  rules: number;
  battles: { name: string; setup: BattleSetup; deployments: Deployment[]; hash: string; stars: number; destruction: number }[];
}

/** A full late-ish army against a generated base, deployed the way bots do (deterministic). */
function battle(keep: number, i: number): { setup: BattleSetup; deployments: Deployment[] } {
  const base = generateOpponent(keep * 37 + i, keep, data);
  const army = botArmy(keep, 1, data);
  const levels: Record<string, number> = {};
  for (const t of Object.keys(army)) levels[t] = Math.max(1, Math.min(troopLevelCapAt(keep, data, t), data.troops[t].levels.length));
  const setup: BattleSetup = { seed: 7000 + i, base, army, levels, infiltration: true };
  const probe = createBattle(setup, data);
  return { setup, deployments: botDeployments(probe.deployable, probe.grid.size, army, createRng(i), data, levels, probe.entry) };
}

function record(rules: number): Recorded {
  const set = ruleSet(rules, data)!;
  const battles = [battle(5, 1), battle(9, 2)].map((b, i) => ({ name: `keep ${i ? 9 : 5}`, ...b }));
  if (rules >= 3) {
    // A relay strike: the second battle starts from the first one's damage.
    const first = set.resim(battles[0]);
    battles.push({ name: 'relay strike', setup: { ...battles[0].setup, seed: 7100, startDamage: first.damage }, deployments: battles[0].deployments });
  }
  return { rules, battles: battles.map((b) => ({ ...b, ...(({ hash, stars, destruction }) => ({ hash, stars, destruction }))(set.resim(b).result) })) };
}

function memoryKv(): KeyValue {
  const map = new Map<string, string>();
  return { get: (k) => map.get(k) ?? null, set: (k, v) => (v === null ? map.delete(k) : map.set(k, v)) };
}

function village(w: ReturnType<typeof world>): GameLink & { state: VillageState } {
  const state = createNewVillage(w.now(), w.data);
  state.army = { hedgehog_roller: 20 };
  const g = {
    data: w.data,
    state,
    now: () => w.now(),
    dispatch(cmd: Command) {
      const r = applyCommand(g.state, cmd, g.now(), w.data);
      if (r.ok) g.state = r.state;
      return r;
    },
  };
  return g;
}

describe('kept battle-rules versions (roadmap step 73)', () => {
  it('serves the live rules and the snapshots, newest first', () => {
    expect(supportedRules()[0]).toBe(SIM_RULES);
    expect(supportedRules()).toContain(2);
    expect(supportedRules().length).toBeLessThanOrEqual(3);
    expect(ruleSet(1, data)).toBeNull();
    expect(ruleSet(undefined, data)!.rules).toBe(SIM_RULES);
  });

  it('snapshots are exactly what the tool generated (never edited by hand)', () => {
    for (const r of supportedRules().filter((x) => x !== SIM_RULES)) {
      const dir = join(ROOT, 'server/rules', `v${r}`);
      const manifest = JSON.parse(readFileSync(join(dir, 'MANIFEST.json'), 'utf8')) as { rules: number; source: string; files: Record<string, string> };
      expect(manifest.rules).toBe(r);
      for (const [file, sum] of Object.entries(manifest.files)) expect(createHash('sha256').update(readFileSync(join(dir, file))).digest('hex'), `server/rules/v${r}/${file} was edited`).toBe(sum);
    }
  });

  it('replays one recorded battle per kept version to its recorded hash', () => {
    for (const r of supportedRules()) {
      const file = join(FIXTURES, `v${r}.json`);
      if (process.env.RECORD_RULE_BATTLES && !existsSync(file)) {
        mkdirSync(FIXTURES, { recursive: true });
        writeFileSync(file, JSON.stringify(record(r)) + '\n');
      }
      expect(existsSync(file), `record rules ${r}'s battles: RECORD_RULE_BATTLES=1`).toBe(true);
      const rec = JSON.parse(readFileSync(file, 'utf8')) as Recorded;
      const set = ruleSet(r, data)!;
      for (const b of rec.battles) {
        const out = set.resim(b).result;
        expect(out.hash, `rules ${r}, ${b.name}`).toBe(b.hash);
        expect([out.stars, out.destruction]).toEqual([b.stars, b.destruction]);
      }
    }
  });

  it('rules 3 changed only relay strikes: a rules 2 battle runs the same under the live code', () => {
    const rec = JSON.parse(readFileSync(join(FIXTURES, 'v2.json'), 'utf8')) as Recorded;
    for (const b of rec.battles) expect(runBattle(b.setup, b.deployments, data).result.hash).toBe(b.hash);
  });
});

describe('tickets remember the game version (roadmap step 72)', () => {
  it('stores rules and data version on the ticket; a report from another version is refused', async () => {
    const w = world();
    const dv = dataVersion(data);
    await w.player('Bea', baseAt(1, 3));
    w.pastShields();
    const a = await w.player('Ann', baseAt(1, 4));
    const ann = new InProcessServerAdapter(w.core, a.credentials, { rules: SIM_RULES, dataVersion: dv, build: '0.1.0+web' });
    const m = (await ann.match())!;
    const t = await w.repo.getTicket(m.ticket);
    expect(t).toMatchObject({ rules: SIM_RULES, dataVersion: dv });
    await expect(ann.submitAttack({ ticket: m.ticket, seed: m.seed, ...rush(5), rules: SIM_RULES - 1 })).rejects.toMatchObject({ code: 'bad_request', message: expect.stringMatching(/Update Kagemura/) });
    await expect(ann.submitAttack({ ticket: m.ticket, seed: m.seed, ...rush(5), dataVersion: 'other-data' })).rejects.toMatchObject({ code: 'bad_request' });
    // The same report from the version it was issued to goes through.
    expect((await ann.submitAttack({ ticket: m.ticket, seed: m.seed, ...rush(5), rules: SIM_RULES, dataVersion: dv })).result).toBeDefined();
  });

  it('re-simulates an older game\'s battle with the rules it played, and refuses rules the server no longer keeps', async () => {
    const metrics = new PromMetrics();
    const w = world({ shared: { metrics } });
    await w.player('Bea', baseAt(1, 3));
    w.pastShields();
    const a = await w.player('Ann', baseAt(1, 4));
    const old = new InProcessServerAdapter(w.core, a.credentials, { rules: 2 });
    const m = (await old.match())!;
    expect((await w.repo.getTicket(m.ticket))!.rules).toBe(2);
    const r = await old.submitAttack({ ticket: m.ticket, seed: m.seed, ...rush(5) });
    const v2 = ruleSet(2, data)!.resim({ setup: { seed: m.seed, base: m.base, army: rush(5).army, levels: {}, infiltration: true }, deployments: rush(5).deployments });
    expect(r.result.hash).toBe(v2.result.hash);
    expect(metrics.value('tk_battles_total', { kind: 'pvp', rules: '2' })).toBe(1);
    const ancient = new InProcessServerAdapter(w.core, a.credentials, { rules: 1 });
    await expect(ancient.match()).rejects.toMatchObject({ code: 'version_mismatch' });
    // A base uploaded by a game remembers its rules (matchmaking re-checks it for other versions).
    await old.uploadBase({ base: baseAt(1, 4) });
    expect((await w.repo.getPlayer(a.id))!.baseRules).toBe(2);
  });
});

describe('friendly forced update (roadmap step 75)', () => {
  it('compares game versions and says why an update is needed', () => {
    expect(buildParts('0.12.3+ios')).toEqual([0, 12, 3]);
    expect(buildOlderThan('0.9.0+web', '0.10.0')).toBe(true);
    expect(buildOlderThan('0.10.0+web', '0.10.0')).toBe(false);
    expect(buildOlderThan('unknown', '0.10.0')).toBe(false);
    expect(updateReason({ supportedRules: [SIM_RULES, 2] }, SIM_RULES, '0.1.0+web')).toBeNull();
    expect(updateReason({ supportedRules: [SIM_RULES + 1] }, SIM_RULES, '0.1.0+web')).toMatch(/Update Kagemura/);
    expect(updateReason({ minClientBuild: '0.2.0' }, SIM_RULES, '0.1.0+web')).toMatch(/0\.2\.0/);
    expect(updateReason({}, SIM_RULES, '0.1.0+web')).toBeNull();
  });

  it('pauses online play when the server no longer keeps the game\'s rules; nothing is registered', async () => {
    const w = world();
    class NewerServer extends InProcessServerAdapter {
      override async hello() {
        return { ...(await super.hello()), supportedRules: [SIM_RULES + 1] };
      }
    }
    const port = new NewerServer(w.core);
    const game = village(w);
    const conn = new Connection({ game, builtInUrl: 'test.server', kv: memoryKv(), makePort: () => port, build: '0.1.0+web', log: () => undefined });
    await conn.sync();
    expect(conn.status).toBe('incompatible');
    expect(conn.lastError).toMatch(/Update Kagemura/);
    expect(port.hasIdentity()).toBe(false);
  });

  it('lists the kept rules and the oldest game version in hello, and turns older games away over HTTP', async () => {
    const app = buildServer({ repo: new MemoryRepo(), data, now: () => Date.UTC(2026, 2, 1), minClientBuild: '0.2.0' });
    const call = async (url: string, headers: Record<string, string> = {}, method: 'GET' | 'POST' = 'GET', payload?: object) => {
      const r = await app.inject({ method, url, headers, payload });
      return { status: r.statusCode, body: r.body ? JSON.parse(r.body) : null };
    };
    const hello = await call(Routes.hello, { 'x-client-build': '0.1.0+web' });
    expect(hello.status).toBe(200);
    expect(hello.body).toMatchObject({ protocol: 8, minProtocol: 7, supportedRules: supportedRules(), minClientBuild: '0.2.0' });
    const reg = await call(Routes.players, { 'x-client-build': '0.1.0+web' }, 'POST', { name: 'Ann' });
    expect(reg.status).toBe(426);
    expect(reg.body).toMatchObject({ error: 'version_mismatch' });
    expect((await call(Routes.players, { 'x-client-build': '0.2.0+web' }, 'POST', { name: 'Ann' })).status).toBe(201);
  });
});
