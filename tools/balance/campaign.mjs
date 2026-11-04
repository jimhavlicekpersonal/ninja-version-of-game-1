// Writes docs/game-theory/CAMPAIGN.md: long model-player campaigns to Keep 15.
// Run: npm run balance:campaign (several minutes).
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const m = await server.ssrLoadModule('/tools/balance/campaign.ts');
  const results = [
    m.runCampaign('Regular (4 sessions a day, raid bots\' army mix)', { raidsPerSession: 2 }, false, 220),
    m.runCampaign('Casual (one visit a day, explorer: newest warrior of each family, Trials and tasks)', { raidsPerSession: 2, policy: 'explorer', engaged: true }, true, 400),
  ];
  mkdirSync('docs/game-theory', { recursive: true });
  writeFileSync('docs/game-theory/CAMPAIGN.md', m.campaignMarkdown(results));
  console.log('wrote CAMPAIGN.md');
} finally {
  await server.close();
}
