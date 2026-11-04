/** A re-simulation worker thread (roadmap step 57; see server/resim.ts). Built to dist-server/resimWorker.js. */
import { parentPort } from 'node:worker_threads';
import { defaultData } from '../src/gameplay/sim/data';
import { resimOnce, type ResimJob } from './resim';

parentPort!.on('message', (job: ResimJob) => {
  try {
    parentPort!.postMessage({ out: resimOnce(job, defaultData) });
  } catch (e) {
    parentPort!.postMessage({ error: (e as Error).message });
  }
});
