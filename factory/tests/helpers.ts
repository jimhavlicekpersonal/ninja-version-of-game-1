/**
 * A tiny stand-in template (a git repository in a temp folder) and a config that points at it, so the
 * whole factory can be exercised in seconds with a scripted Llm and no network.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { loadConfig, type Config } from '../src/config.js';

export const sh = (cwd: string, ...args: string[]): string => execFileSync('git', args, { cwd, encoding: 'utf8' });

export interface Fixture {
  template: string;
  runs: string;
  games: string;
  config: Config;
}

const FILES: Record<string, string> = {
  'CLAUDE.md': '# Tiny template\n\nA base-builder used by the tests.\n\n<!-- factory:start -->\nThe factory lives in factory/.\n<!-- factory:end -->\n\nInvariants: ids never change.\n',
  'AGENTS.md': '# Sessions\n\nOne lane per session.\n',
  'package.json': JSON.stringify({ name: 'tiny-template', scripts: { test: 'node check.js' } }, null, 2),
  '.gitignore': 'node_modules/\n',
  // The one "test" of the tiny template: it fails until someone writes the word fixed into src/art/sprite.txt.
  'check.js': "const t = require('fs').readFileSync('src/art/sprite.txt', 'utf8'); if (!t.includes('fixed')) { console.error('sprite is not fixed'); process.exit(1); } console.log('ok');\n",
  'src/art/CLAUDE.md': '# Art lane\n',
  'src/art/sprite.txt': 'old sprite\n',
  'src/gameplay/CLAUDE.md': '# Gameplay lane\n',
  'src/gameplay/data/units.json': JSON.stringify({ scout: { name: 'Ninja Scout' } }),
  'server/main.txt': 'server\n',
  'locales/CLAUDE.md': '# Translators\n',
  'locales/languages.json': JSON.stringify({ languages: [{ code: 'en', name: 'English', wave: 0 }, { code: 'es', name: 'Spanish', wave: 1 }, { code: 'ja', name: 'Japanese', wave: 1 }] }),
  'locales/en/data.json': JSON.stringify({ 'units.scout.name': 'Ninja Scout', 'units.scout.description': 'Fast and quiet.', 'units.guard.name': 'Gate Guard', 'economy.resourceNames.gold': 'Coins', 'units.scout.text': 'not a name' }, null, 1),
  'locales/es/data.json': '{}',
  'factory/secret.txt': 'the factory itself must never be copied into a game\n',
};

export function makeFixture(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'factory-test-'));
  const template = join(root, 'template');
  for (const [path, text] of Object.entries(FILES)) {
    mkdirSync(dirname(join(template, path)), { recursive: true });
    writeFileSync(join(template, path), text);
  }
  sh(template, 'init', '--quiet', '--initial-branch=main');
  sh(template, 'add', '-A');
  sh(template, '-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--quiet', '-m', 'tiny template');

  // Start from the real settings so the tests exercise the shipped file, then point it at the fixture.
  const config = loadConfig();
  config.template = {
    ...config.template,
    path: template,
    git: null,
    ref: null,
    exclude: ['factory/**', 'node_modules/**'],
    survey: false,
    shared: ['CLAUDE.md', 'AGENTS.md', 'does/not/exist.md'],
    stages: { economy: ['locales/en/data.json'] },
    themeLexicon: ['ninja'],
    lanes: {
      integration: { agent: 'INTEGRATION', brief: 'AGENTS.md', owns: ['**'], generated: [], requests: null },
      gameplay: { agent: 'GAME THEORY AI', brief: 'src/gameplay/CLAUDE.md', owns: ['src/gameplay/**'], generated: ['locales/**'], requests: 'docs/REQUESTS.md' },
      art: { agent: 'ART AI', brief: 'src/art/CLAUDE.md', owns: ['src/art/**'], generated: [], requests: 'docs/REQUESTS.md' },
      gui: { agent: 'GUI AI', brief: 'AGENTS.md', owns: ['src/ui/**'], generated: [], requests: null },
      backend: { agent: 'BACKEND AI', brief: 'AGENTS.md', owns: ['server/**'], generated: [], requests: null },
      translation: { agent: 'TRANSLATION AI', brief: 'locales/CLAUDE.md', owns: ['locales/{code}/**'], generated: [], requests: null, checks: ['node -e "process.exit(0)"'] },
    },
    install: 'node -e "process.exit(0)"',
    checks: [{ name: 'tests', command: 'npm test' }],
  };
  config.build = { ...config.build, outputDir: join(root, 'games'), shell: 'allow', maxTurnsPerOrder: 12, maxFixRounds: 2, languages: 'plan' };
  config.budget = { skeletonUsd: 1000, buildUsd: 1000 };
  return { template, runs: join(root, 'runs'), games: join(root, 'games'), config };
}
