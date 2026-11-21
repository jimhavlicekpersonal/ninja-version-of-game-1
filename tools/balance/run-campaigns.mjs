// Writes docs/game-theory/CAMPAIGN.md and campaign.json: long model-player campaigns to Keep 15.
// Run: npm run balance:campaign (about 12 minutes on 4 cores; each campaign run plays in its own process).
// Beast Mode GT-11: every campaign is played CAMPAIGN_REPS times (campaign.ts; the environment variable
// CAMPAIGN_REPS overrides it, 8 for a release run) and pooled.
// `node tools/balance/run-campaigns.mjs <id> [rep]` plays one campaign run and prints its result as JSON.
import { execFile } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

async function withModule(fn) {
  // configFile: false: the project's vite.config.ts rebuilds public/lang on load, and many campaign processes doing that
  // at once raced each other (one deleted a pack another was reading). The campaigns need none of it.
  const server = await createServer({ configFile: false, root: process.cwd(), server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  try {
    return await fn(await server.ssrLoadModule('/tools/balance/campaign.ts'));
  } finally {
    await server.close();
  }
}

const one = process.argv[2];
if (one) {
  await withModule((m) => {
    const spec = m.CAMPAIGNS.find((c) => c.id === one);
    if (!spec) throw new Error(`unknown campaign ${one}`);
    process.stdout.write(JSON.stringify(m.runCampaign(spec, undefined, Number(process.argv[3] ?? 0))));
  });
} else {
  const script = fileURLToPath(import.meta.url);
  await withModule(async (m) => {
    const reps = Number(process.env.CAMPAIGN_REPS ?? m.CAMPAIGN_REPS);
    if (!(reps >= 1)) throw new Error('CAMPAIGN_REPS must be a positive number');
    // One process per (campaign, run), at most one per core at a time.
    // CAMPAIGN_ONLY=a,b plays only those campaigns and writes CAMPAIGN_OUT (default a scratch file), never the committed
    // results: a quick look while tuning. The gates always read a full run.
    const only = (process.env.CAMPAIGN_ONLY ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    const specs = only.length ? m.CAMPAIGNS.filter((c) => only.includes(c.id)) : m.CAMPAIGNS;
    const jobs = specs.flatMap((c) => Array.from({ length: reps }, (_, rep) => ({ id: c.id, rep })));
    const out = new Map();
    let next = 0;
    const worker = async () => {
      while (next < jobs.length) {
        const job = jobs[next++];
        const r = await new Promise((resolve, reject) => {
          execFile(process.execPath, [script, job.id, String(job.rep)], { maxBuffer: 64 << 20 }, (err, stdout) => (err ? reject(err) : resolve(JSON.parse(stdout))));
        });
        out.set(`${job.id}:${job.rep}`, r);
        console.log(`  ${job.id} run ${job.rep + 1}/${reps}: Keep 15 on day ${r.reached[15] ?? '–'}`);
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, availableParallelism()) }, worker));
    const results = specs.map((c) => m.poolCampaign(Array.from({ length: reps }, (_, rep) => out.get(`${c.id}:${rep}`))));
    if (only.length) {
      const file = process.env.CAMPAIGN_OUT ?? 'campaign-subset.json';
      writeFileSync(file, JSON.stringify({ fingerprint: m.campaignFingerprint(), results }, null, 1) + '\n');
      writeFileSync(file.replace(/\.json$/, '.md'), m.campaignMarkdown(results));
      console.log(`wrote ${file} (subset: not the committed results)`);
      return;
    }
    mkdirSync('docs/game-theory', { recursive: true });
    writeFileSync('docs/game-theory/CAMPAIGN.md', m.campaignMarkdown(results));
    writeFileSync('docs/game-theory/campaign.json', JSON.stringify({ $generated: 'npm run balance:campaign (tools/balance/run-campaigns.mjs); do not edit', fingerprint: m.campaignFingerprint(), results }, null, 1) + '\n');
    console.log('wrote CAMPAIGN.md and campaign.json');
  });
}
