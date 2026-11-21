/** Beast Mode 2026-11-21 OPS-02 / STB-02: hidden source maps uploaded privately, never shipped; a release per build. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildEnvelope, parseDsn, parseStack } from '../../src/backend/analytics/sentryEnvelope';

const read = (f: string) => readFileSync(resolve(__dirname, '../..', f), 'utf8');

describe('OPS-02 / STB-02: source maps and release ids', () => {
  it('vite builds hidden source maps and a build id', () => {
    const cfg = read('vite.config.ts');
    expect(cfg).toMatch(/sourcemap: 'hidden'/);
    expect(cfg).toMatch(/__BUILD_ID__: JSON\.stringify\(\(process\.env\.GITHUB_SHA \?\? ''\)\.slice\(0, 12\) \|\| 'local'\)/);
    expect(read('src/main.ts')).toMatch(/release: `kagemura@\$\{__APP_VERSION__\}\+\$\{__BUILD_ID__\}`/);
  });

  it('every workflow that ships dist deletes *.map first (Pages upload, cap sync)', () => {
    for (const wf of ['deploy.yml', 'android.yml', 'ios-testflight.yml']) {
      const text = read(`.github/workflows/${wf}`);
      const ships = [...text.matchAll(/npx cap sync|upload-pages-artifact/g)].map((m) => m.index!);
      expect(ships.length).toBeGreaterThan(0);
      for (const at of ships) {
        const before = text.slice(0, at);
        expect(before.lastIndexOf("find dist -name '*.map' -delete")).toBeGreaterThan(before.lastIndexOf('npm run build'));
      }
    }
  });

  it('frames carry abs_path without a query string, and the event carries dist', () => {
    const frames = parseStack('Error: x\n    at f (https://game.example/assets/index-abc.js?v=1:1:200)');
    expect(frames[0]).toMatchObject({ abs_path: 'https://game.example/assets/index-abc.js', filename: 'https://game.example/assets/index-abc.js' });
    const env = buildEnvelope(parseDsn('https://k@o1.ingest.sentry.io/1')!, { error: new Error('x'), platform: 'javascript', release: 'kagemura@0.1.0+abc', dist: 'web', environment: 'web' }, 'a'.repeat(32), 0);
    expect(JSON.parse(env.split('\n')[2])).toMatchObject({ release: 'kagemura@0.1.0+abc', dist: 'web' });
  });
});
