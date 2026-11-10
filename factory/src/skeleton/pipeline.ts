/**
 * GO: from nothing to a skeleton the owner can approve. Reads the template slot, has Claude survey
 * it, runs the ten stages in order, names everything, and writes the skeleton. Safe to run again:
 * finished steps are read back from the run folder.
 */
import type { Config } from '../config.js';
import { Ledger } from '../ledger.js';
import type { Llm, Session } from '../llm.js';
import { loadPortfolio, systemBlocks, type Shared } from '../prompts.js';
import type { RunStore } from '../runStore.js';
import { indexTemplate, loadFiles } from '../template/index.js';
import { takeSnapshot } from '../template/snapshot.js';
import { surveyTemplate } from '../template/survey.js';
import { buildOrders } from '../build/workOrders.js';
import { writeSkeleton } from './assemble.js';
import { nameEverything, runStage, type StageRun } from './runStage.js';
import type { Blueprint, Brand, Decisions, IdMapEntry } from './schemas.js';
import { STAGES } from './stages.js';

export interface SkeletonResult {
  decisions: Decisions;
  idMap: IdMapEntry[];
  ledger: Ledger;
}

export async function prepare(store: RunStore, config: Config, llm: Llm): Promise<{ session: Session; shared: Shared; ledger: Ledger }> {
  const ledger = new Ledger(config, store.ledgerFile);
  const session: Session = { llm, ledger, recorder: store.recorder() };

  const snapshot = takeSnapshot(config);
  const index = indexTemplate(snapshot, config);
  const was = store.state.template;
  if (was && was.key !== snapshot.key) {
    store.log(`note: the template changed since this run began (${was.sha.slice(0, 10)} -> ${snapshot.sha.slice(0, 10)}). Finished stages keep their decisions; start a new run to redo them against the new template.`);
  }
  store.state.template = { source: snapshot.source, sha: snapshot.sha, key: snapshot.key, dirty: snapshot.dirty };
  store.save();
  store.log(`template: ${snapshot.source} at ${snapshot.sha.slice(0, 12)}${snapshot.dirty ? ' (uncommitted changes)' : ''}, ${snapshot.files.length} files, ${index.entities.length} named things, ${index.languages.length} languages`);

  let blueprint: Shared['blueprint'] = null;
  if (store.exists('template', 'blueprint.json')) {
    blueprint = { record: store.readJson<Blueprint>('template/blueprint.json'), text: store.read('template/BLUEPRINT.md') };
  } else if (config.template.survey) {
    store.log('survey: Claude is reading the template');
    const survey = await surveyTemplate(session, config, index, (line) => store.log(line), !store.state.mock);
    store.log(survey.fromCache ? '  blueprint reused (the template has not changed since it was surveyed)' : '  blueprint written');
    store.write('template/BLUEPRINT.md', survey.text);
    store.writeJson('template/blueprint.json', survey.record);
    blueprint = { record: survey.record, text: survey.text };
    for (const drift of survey.record.configDrift) store.log(`  settings drift: ${drift}`);
  }

  const shared: Shared = { config, index, blueprint, brief: store.state.brief, portfolio: loadPortfolio(), missing: [] };
  const { missing } = loadFiles(index, config.template.shared);
  if (missing.length) store.log(`not in the template (skipped): ${missing.join(', ')}`);
  return { session, shared, ledger };
}

export async function runSkeleton(store: RunStore, config: Config, llm: Llm): Promise<SkeletonResult> {
  const { session, shared, ledger } = await prepare(store, config, llm);
  const run: StageRun = { session, shared, store, system: systemBlocks(shared), decisions: {}, idMap: null };

  const stages = config.skeleton.stages;
  for (let i = 0; i < stages.length; i++) {
    const def = STAGES[stages[i]];
    store.log(`stage ${i + 1} of ${stages.length}: ${def.title}`);
    const record = await runStage(run, def, i + 1);
    (run.decisions as Record<string, unknown>)[def.id] = record;
    if (def.id === 'brand') {
      const brand = record as Brand;
      store.state.game = { name: brand.name, slug: brand.slug };
    }
    if (def.id === 'economy') run.idMap = await nameEverything(run, i + 1);
    if (!store.state.stagesDone.includes(def.id)) store.state.stagesDone.push(def.id);
    store.save();
    store.log(`  done (${ledger.summary()})`);
  }

  const idMap = run.idMap ?? [];
  const orders = run.decisions.plan ? buildOrders(config, run.decisions, shared.index) : [];
  writeSkeleton(store, config, run.decisions, idMap, orders, ledger);
  if (store.state.status === 'designing') store.state.status = 'awaiting-approval';
  store.save();
  return { decisions: run.decisions, idMap, ledger };
}
