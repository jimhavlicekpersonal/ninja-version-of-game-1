/**
 * A re-simulation worker thread (roadmap step 57), built to
 * dist-server/resimWorker.js. It has the same rule engines as the API
 * (today's rules with the server's live data, plus the archived snapshots) and
 * answers one battle at a time. See resim.ts.
 */
import { parentPort, workerData } from 'node:worker_threads';
import type { GameData } from '../../src/gameplay/sim/types';
import { ARCHIVED_ENGINES } from '../rules/archive';
import { liveEngine, RulesRegistry } from '../rules/registry';
import { simulate, type ResimJob, type ResimReply } from './resim';

const { data } = workerData as { data: GameData };
const rules = new RulesRegistry(liveEngine(data), { archived: ARCHIVED_ENGINES.map((e) => e()) });

parentPort!.on('message', (job: ResimJob) => {
  let reply: ResimReply;
  try {
    const engine = rules.forTicket(job.rules, job.dataVersion);
    if (!engine) reply = { id: job.id, ok: false, error: `no engine for rules ${job.rules}` };
    else reply = { id: job.id, ok: true, ...simulate(engine, job.setup, job.deployments, job.endTick), rules: engine.rules, dataVersion: engine.dataVersion };
  } catch (e) {
    reply = { id: job.id, ok: false, error: (e as Error).message };
  }
  parentPort!.postMessage(reply);
});
