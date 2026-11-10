import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ToolUse, TurnRequest } from '../src/llm.js';
import { MockLlm, type Responder } from '../src/mock.js';
import { EMPTY_BRIEF, RunStore } from '../src/runStore.js';
import { changedFiles, stripFactoryBlocks } from '../src/build/materialize.js';
import { enforceLane, runBuild, shellAllowed } from '../src/build/runBuild.js';
import { buildOrders, type WorkOrder } from '../src/build/workOrders.js';
import { runSkeleton } from '../src/skeleton/pipeline.js';
import type { Decisions } from '../src/skeleton/schemas.js';
import { indexTemplate } from '../src/template/index.js';
import { takeSnapshot } from '../src/template/snapshot.js';
import { makeFixture, sh, type Fixture } from './helpers.js';

const call = (name: string, input: unknown, id = name): ToolUse => ({ type: 'tool_use', id, name, input }) as ToolUse;
const report = (summary: string, status = 'done') => call('report', { status, summary, verified: ['read the file back'], unverified: ['no phone was used'], requests: [] });

/** How many tool results the session has had so far: the scripted sessions below act by step. */
const step = (req: TurnRequest): number => req.messages.filter((m) => Array.isArray(m.content) && m.content.some((b) => b.type === 'tool_result')).length;
const lastUserText = (req: TurnRequest): string => JSON.stringify(req.messages.filter((m) => m.role === 'user').at(-1));

/** A designed and approved run on the tiny template. `mock: false` so the build behaves as a real one, with a scripted Llm. */
async function approvedRun(fx: Fixture): Promise<RunStore> {
  const store = RunStore.create(EMPTY_BRIEF, true, fx.runs);
  await runSkeleton(store, fx.config, new MockLlm());
  store.state.mock = false;
  store.state.status = 'approved';
  store.save();
  return store;
}

describe('the build', () => {
  it('will not start before the owner approves', async () => {
    const fx = makeFixture();
    const store = RunStore.create(EMPTY_BRIEF, true, fx.runs);
    await runSkeleton(store, fx.config, new MockLlm());
    await expect(runBuild(store, fx.config, new MockLlm(), { checks: false })).rejects.toThrow(/not approved yet/);
    expect(existsSync(fx.games)).toBe(false);
  });

  it('by default lets sessions run commands only on a disposable machine', async () => {
    const fx = makeFixture();
    const store = await approvedRun(fx);
    const config = { ...fx.config, build: { ...fx.config.build, shell: 'ci-only' as const } };
    const saved = { ci: process.env.CI, allow: process.env.FACTORY_ALLOW_SHELL };
    delete process.env.CI;
    delete process.env.FACTORY_ALLOW_SHELL;
    try {
      expect(shellAllowed(config)).toBe(false);
      await expect(runBuild(store, config, new MockLlm(), { checks: true })).rejects.toThrow(/FACTORY_ALLOW_SHELL=1/);
      expect(existsSync(fx.games)).toBe(false); // nothing was copied or spent
      process.env.FACTORY_ALLOW_SHELL = '1';
      expect(shellAllowed(config)).toBe(true);
      expect(shellAllowed({ ...config, build: { ...config.build, shell: 'off' } })).toBe(false);
    } finally {
      if (saved.ci !== undefined) process.env.CI = saved.ci;
      if (saved.allow === undefined) delete process.env.FACTORY_ALLOW_SHELL;
      else process.env.FACTORY_ALLOW_SHELL = saved.allow;
    }
  });

  it('copies the template into its own repository, without the factory, with the game bible', async () => {
    const fx = makeFixture();
    const store = await approvedRun(fx);
    await runBuild(store, fx.config, new MockLlm(), { checks: false, only: ['no-such-order'] });
    const dir = store.state.build.dir!;
    expect(dir).toBe(join(fx.games, 'mock-game'));
    expect(existsSync(join(dir, 'factory'))).toBe(false);
    expect(existsSync(join(dir, 'src/art/sprite.txt'))).toBe(true);
    for (const doc of ['GAME_BIBLE.md', 'ID_MAP.md', 'BUILD_PLAN.md', 'OWNER_TASKS.md', 'README.md']) expect(existsSync(join(dir, 'docs/factory', doc)), doc).toBe(true);
    // The pointer to the factory in the template's brief does not travel into the new game.
    const brief = readFileSync(join(dir, 'CLAUDE.md'), 'utf8');
    expect(brief).not.toContain('factory');
    expect(brief).toContain('Invariants: ids never change.');
    expect(sh(dir, 'log', '--format=%s')).toContain('Template snapshot');
    // The template itself was only read.
    expect(sh(fx.template, 'status', '--porcelain')).toBe('');
  });

  it('strips factory pointers cleanly', () => {
    expect(stripFactoryBlocks('a\n\n<!-- factory:start -->\nx\n<!-- factory:end -->\n\nb\n')).toBe('a\n\nb\n');
    expect(stripFactoryBlocks('a\n\n<!-- factory:start -->\nx\n<!-- factory:end -->\n')).toBe('a\n');
    expect(stripFactoryBlocks('no markers\n')).toBe('no markers\n');
  });

  it('runs each order in its lane, checks the work itself, hands failures back, and commits', async () => {
    const fx = makeFixture();
    const store = await approvedRun(fx);

    // The art session: tries to write outside its lane (refused), slips a file out through the shell,
    // does half the job, reports done. The harness's check fails; the fix round finishes the job.
    const art: Responder = (req) => {
      if (!req.label.startsWith('build/art')) return undefined;
      if (req.label.includes('/fix-')) {
        const sinceFailure = step(req) - 4;
        if (sinceFailure === 0) return [call('edit_file', { path: 'src/art/sprite.txt', old_text: 'half done', new_text: 'fixed sprite' })];
        if (sinceFailure === 1) return [report('Repainted the sprite; the check passes now.')];
        return 'Finished.';
      }
      switch (step(req)) {
        case 0:
          return [call('write_file', { path: 'server/main.txt', content: 'art was here' })];
        case 1:
          return [call('shell', { command: 'node -e "require(\'fs\').writeFileSync(\'server/sneaky.txt\', \'x\'); require(\'fs\').appendFileSync(\'server/main.txt\', \'tampered\')"' })];
        case 2:
          return [call('write_file', { path: 'src/art/sprite.txt', content: 'half done\n' })];
        case 3:
          return [report('Repainted the sprite.')];
        default:
          return 'Finished.';
      }
    };
    const llm = new MockLlm([art]);
    await runBuild(store, fx.config, llm, { checks: true });
    const dir = store.state.build.dir!;

    const state = store.state.build.orders.art;
    expect(state.status).toBe('done');
    expect(state.checks).toEqual([{ name: 'tests', ok: true }]);
    expect(state.laneReverts.sort()).toEqual(['server/main.txt', 'server/sneaky.txt']);
    expect(readFileSync(join(dir, 'src/art/sprite.txt'), 'utf8')).toBe('fixed sprite\n');
    expect(readFileSync(join(dir, 'server/main.txt'), 'utf8')).toBe('server\n'); // put back
    expect(existsSync(join(dir, 'server/sneaky.txt'))).toBe(false); // removed

    // The refused write told the session where requests go.
    const afterRefusal = llm.calls.find((c) => c.label === 'build/art#2')!;
    expect(lastUserText(afterRefusal)).toContain('outside your lane');
    expect(lastUserText(afterRefusal)).toContain('docs/REQUESTS.md');
    // The fix round was given the failing output, not a summary of it.
    const fix = llm.calls.find((c) => c.label === 'build/art/fix-1#1')!;
    expect(lastUserText(fix)).toContain('sprite is not fixed');

    // One commit for the order, carrying the report's summary; only lane files in it.
    const commit = sh(dir, 'show', '--stat', '--format=%s%n%b', state.commit!);
    expect(commit).toContain('art: Mock art');
    expect(commit).toContain('the check passes now');
    expect(commit).toContain('src/art/sprite.txt');
    expect(commit).not.toContain('server/');

    // The record keeps the harness's verdict apart from the session's word.
    const record = store.read('build/05-art.md');
    expect(record).toContain('passed: tests');
    expect(record).toContain('no phone was used');
    expect(record).toContain('server/sneaky.txt');
    expect(store.state.status).toBe('built');
    expect(readFileSync(join(dir, 'docs/factory/BUILD_REPORT.md'), 'utf8')).toContain('not a released game');
    expect(changedFiles(dir)).toEqual([]);
  });

  it('reports an order as partial when its checks still fail, and never calls that done', async () => {
    const fx = makeFixture();
    fx.config.build.maxFixRounds = 1;
    const store = await approvedRun(fx);
    await runBuild(store, fx.config, new MockLlm(), { checks: true, only: ['art'] }); // the mock session changes nothing, so the check keeps failing
    const state = store.state.build.orders.art;
    expect(state.status).toBe('partial');
    expect(state.checks).toEqual([{ name: 'tests', ok: false }]);
    expect(store.read('build/05-art.md')).toContain('**FAILED**: tests');
    expect(store.read('build/BUILD_REPORT.md')).toContain('0 of 1 passed');
  });

  it('carries on after a stop: finished orders are skipped, the interrupted one is told to look first', async () => {
    const fx = makeFixture();
    const store = await approvedRun(fx);
    const dying: Responder = (req) => {
      if (req.label.startsWith('build/rules')) throw new Error('laptop lid closed');
      return undefined;
    };
    await expect(runBuild(store, fx.config, new MockLlm([dying]), { checks: false })).rejects.toThrow('laptop lid closed');
    expect(store.state.build.orders.identity.status).toBe('done');
    expect(store.state.build.orders.rules.status).toBe('pending');

    const llm = new MockLlm();
    await runBuild(RunStore.open(store.state.id, fx.runs), fx.config, llm, { checks: false });
    const labels = llm.calls.map((c) => c.label);
    expect(labels.some((l) => l.startsWith('build/identity'))).toBe(false);
    expect(labels.some((l) => l.startsWith('build/names'))).toBe(false);
    const resumed = llm.calls.find((c) => c.label === 'build/rules#1')!;
    expect(lastUserText(resumed)).toContain('interrupted');
    expect(RunStore.open(store.state.id, fx.runs).state.status).toBe('built');
  });

  it('gives every session the same cached system and game bible, and its own lane', async () => {
    const fx = makeFixture();
    const store = await approvedRun(fx);
    const llm = new MockLlm();
    await runBuild(store, fx.config, llm, { checks: false });
    const first = llm.calls.filter((c) => /^build\/[a-z-]+#1$/.test(c.label));
    expect(first.length).toBeGreaterThan(5);
    const system = JSON.stringify(first[0].system);
    const bible = JSON.stringify((first[0].messages[0].content as unknown[])[0]);
    const tools = JSON.stringify(first[0].tools);
    for (const c of first) {
      expect(JSON.stringify(c.system), c.label).toBe(system);
      expect(JSON.stringify((c.messages[0].content as unknown[])[0]), c.label).toBe(bible);
      expect(JSON.stringify(c.tools), c.label).toBe(tools);
      expect(c.autoCache).toBe(true);
    }
    expect(system).toContain('Never skip, delete or weaken a test');
    expect(lastUserText(llm.calls.find((c) => c.label === 'build/art#1')!)).toContain('You may write: src/art/**');
  });
});

describe('work orders', () => {
  const plan = (fx: Fixture, decisions: Decisions): WorkOrder[] => buildOrders(fx.config, decisions, indexTemplate(takeSnapshot(fx.config), fx.config));

  it('keep the standard sequence, place extras after what they depend on, add translations and the final order', async () => {
    const fx = makeFixture();
    const store = RunStore.create(EMPTY_BRIEF, true, fx.runs);
    const { decisions } = await runSkeleton(store, fx.config, new MockLlm());
    decisions.plan!.orders.unshift({ id: 'weather', title: 'Weather layer', lane: 'gui', brief: 'Add rain.', acceptance: [], dependsOn: ['art'] });
    decisions.languages!.buildNow = ['es', 'xx', 'en'];
    const orders = plan(fx, decisions);
    const ids = orders.map((o) => o.id);
    expect(ids).toEqual(['identity', 'names', 'rules', 'text', 'art', 'interface', 'store', 'glossary', 'weather', 'translate-es', 'finish']);
    const es = orders.find((o) => o.id === 'translate-es')!;
    expect(es).toMatchObject({ lane: 'translation', code: 'es', dependsOn: ['glossary'], model: fx.config.models.translator });
    expect(orders.at(-1)!.brief).toContain('ninja'); // the leftover hunt is given the template's theme words
  });

  it('a translation session may only write its own language', async () => {
    const fx = makeFixture();
    const store = await approvedRun(fx);
    const decisions = store.readJson<Decisions>('skeleton/decisions.json');
    decisions.languages!.buildNow = ['es'];
    store.writeJson('skeleton/orders.json', plan(fx, decisions));

    const translator: Responder = (req) => {
      if (!req.label.startsWith('build/translate-es')) return undefined;
      switch (step(req)) {
        case 0:
          return [call('write_file', { path: 'locales/ja/data.json', content: '{"wrong":"language"}' })];
        case 1:
          return [call('write_file', { path: 'locales/es/data.json', content: '{"units.scout.name":"Farolero"}' })];
        case 2:
          return [report('Translated Spanish.')];
        default:
          return 'Finished.';
      }
    };
    const llm = new MockLlm([translator]);
    await runBuild(store, fx.config, llm, { checks: true, only: ['translate-es'] });
    const dir = store.state.build.dir!;
    expect(existsSync(join(dir, 'locales/ja/data.json'))).toBe(false);
    expect(readFileSync(join(dir, 'locales/es/data.json'), 'utf8')).toContain('Farolero');
    // The lane's own check ran, not the template-wide ones.
    expect(store.state.build.orders['translate-es'].checks).toEqual([{ name: 'node -e "process.exit(0)"', ok: true }]);
  });

  it('lane enforcement puts back tracked files and removes new ones', () => {
    const fx = makeFixture();
    writeFileSync(join(fx.template, 'server/main.txt'), 'changed');
    writeFileSync(join(fx.template, 'server/new.txt'), 'new');
    writeFileSync(join(fx.template, 'src/art/sprite.txt'), 'mine');
    const reverted = enforceLane(fx.template, { owns: ['src/art/**'], generated: [], requests: null });
    expect(reverted.sort()).toEqual(['server/main.txt', 'server/new.txt']);
    expect(changedFiles(fx.template)).toEqual([{ path: 'src/art/sprite.txt', untracked: false }]);
  });
});
