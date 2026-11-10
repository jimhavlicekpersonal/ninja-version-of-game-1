import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FACTORY_ROOT, loadConfig, STAGE_IDS } from '../src/config.js';
import type { TurnRequest } from '../src/llm.js';
import { MockLlm, placeholder, type Responder } from '../src/mock.js';
import { EMPTY_BRIEF, RunStore } from '../src/runStore.js';
import { STANDARD_ORDERS } from '../src/build/workOrders.js';
import { runSkeleton } from '../src/skeleton/pipeline.js';
import { MarketSchema, type IdMapEntry, type Market } from '../src/skeleton/schemas.js';
import { STAGES } from '../src/skeleton/stages.js';
import { indexTemplate, loadFiles } from '../src/template/index.js';
import { takeSnapshot } from '../src/template/snapshot.js';
import { makeFixture, sh } from './helpers.js';

const textOfBlock = (b: unknown): string => (b as { text?: string }).text ?? '';
const userBlocks = (req: TurnRequest): string[] => {
  const first = req.messages[0];
  return Array.isArray(first.content) ? first.content.map(textOfBlock) : [String(first.content)];
};

describe('the shipped settings', () => {
  const config = loadConfig();

  it('load, and give every stage a chapter in the playbook', () => {
    expect(config.skeleton.stages).toEqual([...STAGE_IDS]);
    for (const id of STAGE_IDS) expect(existsSync(join(FACTORY_ROOT, 'playbook', STAGES[id].chapter)), STAGES[id].chapter).toBe(true);
    for (const file of ['00-DOCTRINE.md', 'LESSONS.md']) expect(existsSync(join(FACTORY_ROOT, 'playbook', file))).toBe(true);
  });

  it('keep the owner\'s order: market first, interface last, then the plan', () => {
    expect(config.skeleton.stages).toEqual(['market', 'brand', 'monetization', 'compliance', 'languages', 'economy', 'engine', 'art', 'gui', 'plan']);
  });

  it('still match the template in this repository (lanes, briefs, listed files, the name catalogue)', () => {
    const index = indexTemplate(takeSnapshot(config), config);
    for (const [id, lane] of Object.entries(config.template.lanes)) expect(index.snapshot.files, `lane ${id}`).toContain(lane.brief);
    expect(loadFiles(index, config.template.shared).missing).toEqual([]);
    for (const id of STAGE_IDS) expect(loadFiles(index, config.template.stages[id] ?? []).missing, id).toEqual([]);
    expect(index.entities.length).toBeGreaterThan(100);
    expect(index.languages.length).toBeGreaterThan(10);
    expect(index.snapshot.files.some((f) => f.startsWith('factory/'))).toBe(false);
    for (const order of STANDARD_ORDERS) expect(Object.keys(config.template.lanes), order.id).toContain(order.lane);
  });
});

describe('GO', () => {
  it('reads whatever is in the template slot, and sees a new version when one is pushed', () => {
    const fx = makeFixture();
    const before = takeSnapshot(fx.config);
    expect(before.files).toContain('locales/en/data.json');
    expect(before.files.some((f) => f.startsWith('factory/'))).toBe(false);
    expect(before.dirty).toBe(false);
    const index = indexTemplate(before, fx.config);
    expect(index.entities.map((e) => e.key)).toEqual(['units.scout.name', 'units.guard.name', 'economy.resourceNames.gold']);
    expect(index.entities[0].about).toBe('Fast and quiet.');

    writeFileSync(join(fx.template, 'src/gameplay/data/new-system.json'), '{}');
    const dirty = takeSnapshot(fx.config);
    expect(dirty.dirty).toBe(true);
    expect(dirty.key).not.toBe(before.key);

    sh(fx.template, 'add', '-A');
    sh(fx.template, '-c', 'user.name=T', '-c', 'user.email=t@example.com', 'commit', '--quiet', '-m', 'version 2');
    const after = takeSnapshot(fx.config);
    expect(after.sha).not.toBe(before.sha);
    expect(after.files).toContain('src/gameplay/data/new-system.json');

    // An older version can still be pinned without touching the working tree.
    const pinned = takeSnapshot({ ...fx.config, template: { ...fx.config.template, ref: before.sha } });
    expect(pinned.sha).toBe(before.sha);
    expect(pinned.files).not.toContain('src/gameplay/data/new-system.json');
    expect(existsSync(join(fx.template, 'src/gameplay/data/new-system.json'))).toBe(true);
  });

  it('runs the ten stages in order, names everything, writes the skeleton and stops for approval', async () => {
    const fx = makeFixture();
    const llm = new MockLlm();
    const store = RunStore.create({ ...EMPTY_BRIEF, idea: 'a game about lighthouse keepers' }, true, fx.runs);
    const { decisions, idMap } = await runSkeleton(store, fx.config, llm);

    // Stage order, as first seen in the call log.
    const seen: string[] = [];
    for (const call of llm.calls) {
      const stage = call.label.split('/')[0];
      if (!seen.includes(stage)) seen.push(stage);
    }
    expect(seen).toEqual([...STAGE_IDS]);
    expect(Object.keys(decisions)).toEqual([...STAGE_IDS]);

    // Every named thing in the template's catalogue got a new name; keys are untouched.
    expect(idMap.map((e) => e.key)).toEqual(['units.scout.name', 'units.guard.name', 'economy.resourceNames.gold']);
    expect(idMap[0]).toMatchObject({ was: 'Ninja Scout', name: 'New Ninja Scout' });

    expect(store.state.status).toBe('awaiting-approval');
    expect(store.state.game).toEqual({ name: 'Mock name 1', slug: 'mock-game' });
    for (const file of ['SKELETON.md', 'skeleton/GAME_BIBLE.md', 'skeleton/ID_MAP.md', 'skeleton/BUILD_PLAN.md', 'skeleton/OWNER_TASKS.md', 'skeleton/STORE_LISTING.md', 'skeleton/orders.json', 'skeleton/decisions.json', 'stages/01-market/decision.json', 'stages/02-brand/research-name-conflicts.md', 'stages/10-plan/decision.json']) {
      expect(store.exists(file), file).toBe(true);
    }
    const page = store.read('SKELETON.md');
    expect(page).toContain('mock run');
    expect(page).toContain('npm run approve');
    expect(store.read('skeleton/ID_MAP.md')).toContain('| `units.scout.name` | Ninja Scout | New Ninja Scout |');

    // The owner's brief reaches every stage.
    expect(userBlocks(llm.calls.find((c) => c.label === 'gui/decision')!)[0]).toContain('lighthouse keepers');
    // A glob that matches nothing is reported, never invented.
    expect(store.read('run.log')).toContain('does/not/exist.md');
  });

  it('lays requests out so the expensive prefix is cached: one system for all, decisions only ever appended', async () => {
    const fx = makeFixture();
    const llm = new MockLlm();
    await runSkeleton(RunStore.create(EMPTY_BRIEF, true, fx.runs), fx.config, llm);

    const system = JSON.stringify(llm.calls[0].system);
    for (const call of llm.calls) expect(JSON.stringify(call.system), call.label).toBe(system);
    expect(llm.calls[0].system.at(-1)?.cache_control).toEqual({ type: 'ephemeral', ttl: fx.config.api.cacheTtl });
    expect(system).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/); // no timestamps in the cached part

    const decisionCalls = STAGE_IDS.map((id) => llm.calls.find((c) => c.label === `${id}/decision`)!);
    for (let i = 1; i < decisionCalls.length; i++) {
      const prev = userBlocks(decisionCalls[i - 1]);
      const next = userBlocks(decisionCalls[i]);
      // brief + i earlier decisions, byte for byte what the stage before sent, plus one more decision.
      const shared = prev.slice(0, 1 + (i - 1));
      const nextPrefix = next.slice(0, shared.length);
      if (STAGE_IDS[i - 1] === 'economy' || i - 1 > STAGE_IDS.indexOf('economy')) {
        // After the economy stage its block also carries the ID map; everything before it is unchanged.
        expect(nextPrefix.slice(0, STAGE_IDS.indexOf('economy') + 1)).toEqual(shared.slice(0, STAGE_IDS.indexOf('economy') + 1));
      } else {
        expect(nextPrefix).toEqual(shared);
      }
      expect(next[shared.length]).toContain(`<decision stage="${STAGE_IDS[i - 1]}">`);
    }
    // Within a stage, the proposal, review and decision calls share everything but the last block.
    const market = llm.calls.filter((c) => c.label.startsWith('market/') && !c.label.includes('research'));
    const head = userBlocks(market[0]).slice(0, -1);
    for (const call of market) expect(userBlocks(call).slice(0, -1), call.label).toEqual(head);
  });

  it('does not pay twice: a second GO on a finished run makes no calls, and a stopped run carries on', async () => {
    const fx = makeFixture();
    const store = RunStore.create(EMPTY_BRIEF, true, fx.runs);

    // The first attempt dies in the middle of the brand stage.
    const dying: Responder = (req) => {
      if (req.label === 'brand/review') throw new Error('network down');
      return undefined;
    };
    await expect(runSkeleton(store, fx.config, new MockLlm([dying]))).rejects.toThrow('network down');
    expect(store.state.stagesDone).toEqual(['market']);
    expect(store.state.status).toBe('designing');

    const resumed = new MockLlm();
    await runSkeleton(RunStore.open(store.state.id, fx.runs), fx.config, resumed);
    const labels = resumed.calls.map((c) => c.label);
    expect(labels.some((l) => l.startsWith('market/'))).toBe(false); // finished stage: read back
    expect(labels).not.toContain('brand/proposal-1'); // finished step of the interrupted stage: read back
    expect(labels).toContain('brand/review');

    const again = new MockLlm();
    await runSkeleton(RunStore.open(store.state.id, fx.runs), fx.config, again);
    expect(again.calls).toHaveLength(0);
  });

  it('sends a record back once when code can see it is wrong', async () => {
    const fx = makeFixture();
    fx.config.skeleton.stages = ['market'];
    let asked = 0;
    const wrongThenRight: Responder = (req) => {
      if (!req.label.startsWith('market/decision')) return undefined;
      const record = placeholder(MarketSchema) as Market;
      return { ...record, chosen: asked++ === 0 ? 'no-such-thesis' : record.theses[1].id };
    };
    const llm = new MockLlm([wrongThenRight]);
    const store = RunStore.create(EMPTY_BRIEF, true, fx.runs);
    const { decisions } = await runSkeleton(store, fx.config, llm);
    expect(decisions.market?.chosen).toBe('mock-2');
    const fix = llm.calls.find((c) => c.label === 'market/decision-fix')!;
    expect(JSON.stringify(fix.messages.at(-1))).toContain('no thesis has that id');
  });

  it('asks again for names that are missing or still carry the old theme', async () => {
    const fx = makeFixture();
    fx.config.skeleton.stages = ['economy'];
    let round = 0;
    const lazy: Responder = (req) => {
      if (!req.label.startsWith('economy/names')) return undefined;
      round++;
      if (round === 1) return { entries: [{ key: 'units.scout.name', name: 'Ninja Lookout', note: 'still the old theme' }, { key: 'units.guard.name', name: 'Harbour Guard', note: '' }] };
      return { entries: [{ key: 'units.scout.name', name: 'Lamp Runner', note: '' }, { key: 'economy.resourceNames.gold', name: 'Oil', note: '' }] };
    };
    const store = RunStore.create(EMPTY_BRIEF, true, fx.runs);
    const { idMap } = await runSkeleton(store, fx.config, new MockLlm([lazy]));
    expect(Object.fromEntries(idMap.map((e: IdMapEntry) => [e.key, e.name]))).toEqual({ 'units.scout.name': 'Lamp Runner', 'units.guard.name': 'Harbour Guard', 'economy.resourceNames.gold': 'Oil' });
    expect(round).toBe(2);
  });

  it('quick depth is one call per stage; standard adds research, proposals and a review', async () => {
    const count = async (depth: 'quick' | 'standard' | 'deep') => {
      const fx = makeFixture();
      fx.config.skeleton.depth = depth;
      fx.config.skeleton.stages = ['market', 'brand'];
      const llm = new MockLlm();
      await runSkeleton(RunStore.create(EMPTY_BRIEF, true, fx.runs), fx.config, llm);
      return llm.calls.map((c) => c.label);
    };
    expect(await count('quick')).toEqual(['market/decision', 'brand/decision']);
    const standard = await count('standard');
    expect(standard.filter((l) => l.startsWith('market/research-'))).toHaveLength(5);
    expect(standard.filter((l) => l.startsWith('market/proposal-'))).toHaveLength(3);
    expect(standard.indexOf('brand/research-name-conflicts')).toBeGreaterThan(standard.indexOf('brand/proposal-2'));
    expect(standard.indexOf('brand/research-name-conflicts')).toBeLessThan(standard.indexOf('brand/review'));
    expect(await count('deep')).toContain('market/review-2');
  });

  it('research asks for live web tools, and carries on without them when the API refuses', async () => {
    const fx = makeFixture();
    fx.config.skeleton.stages = ['monetization'];
    const llm = new MockLlm();
    await runSkeleton(RunStore.create(EMPTY_BRIEF, true, fx.runs), fx.config, llm);
    const probe = llm.calls.find((c) => c.label === 'monetization/research-rules')!;
    expect(probe.tools?.map((t) => t.type)).toEqual(['web_search_20260209', 'web_fetch_20260209']);
    expect(llm.calls.find((c) => c.label === 'monetization/proposal-1')!.tools).toBeUndefined();

    fx.config.api.webSearch = false;
    const offline = new MockLlm();
    const store = RunStore.create(EMPTY_BRIEF, true, fx.runs);
    await runSkeleton(store, fx.config, offline);
    const quiet = offline.calls.find((c) => c.label === 'monetization/research-rules')!;
    expect(quiet.tools).toBeUndefined();
    expect(JSON.stringify(quiet.messages)).toContain('model knowledge, unverified');
    expect(readFileSync(store.path('stages/01-monetization/research-rules.md'), 'utf8')).toContain('Mock answer');
  });
});
