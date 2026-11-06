// npm run status: rewrite docs/STATUS.md from the code (tools/status/status.ts).
import { writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { statusMarkdown } = await server.ssrLoadModule('/tools/status/status.ts');
  writeFileSync('docs/STATUS.md', statusMarkdown());
  console.log('Wrote docs/STATUS.md');
} finally {
  await server.close();
}
