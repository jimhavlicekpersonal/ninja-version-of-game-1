// Writes docs/game-theory/CAMPAIGN.md and campaign.json: long model-player campaigns to Keep 15.
// Run: npm run balance:campaign (several minutes; each campaign plays in its own process).
// `node tools/balance/run-campaigns.mjs <id>` plays one campaign and prints its result as JSON.
import { execFile } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

async function withModule(fn) {
  const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
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
    process.stdout.write(JSON.stringify(m.runCampaign(spec)));
  });
} else {
  const script = fileURLToPath(import.meta.url);
  await withModule(async (m) => {
    const results = await Promise.all(
      m.CAMPAIGNS.map(
        (c) =>
          new Promise((resolve, reject) => {
            execFile(process.execPath, [script, c.id], { maxBuffer: 64 << 20 }, (err, out) => (err ? reject(err) : resolve(JSON.parse(out))));
          }),
      ),
    );
    mkdirSync('docs/game-theory', { recursive: true });
    writeFileSync('docs/game-theory/CAMPAIGN.md', m.campaignMarkdown(results));
    writeFileSync('docs/game-theory/campaign.json', JSON.stringify({ $generated: 'npm run balance:campaign (tools/balance/run-campaigns.mjs); do not edit', fingerprint: m.campaignFingerprint(), results }, null, 1) + '\n');
    console.log('wrote CAMPAIGN.md and campaign.json');
  });
}
