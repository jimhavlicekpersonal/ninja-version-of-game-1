/**
 * Generated files (quality 5, docs/GENERATED.md). A session that hand-edits a generated file loses the
 * edit at the next regeneration, so the cheap generators are checked here: running them again must
 * change nothing (the status table has its own test, tests/architecture/status.test.ts). Every file
 * docs/GENERATED.md lists must exist, and every Markdown one must say it is generated.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { iconManifest, iconMarkdown, rosterMarkdown } from '../../tools/progression/report';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('generated files', () => {
  it('npm run docs:progression would not change ROSTER.md or the icon manifest', () => {
    const icons = iconManifest();
    expect(read('docs/game-theory/ROSTER.md')).toBe(rosterMarkdown());
    expect(read('docs/art/ICON_MANIFEST.md')).toBe(iconMarkdown(icons));
    expect(read('docs/art/ICON_MANIFEST.json')).toBe(JSON.stringify({ generated: 'npm run docs:progression', count: icons.length, icons }, null, 2) + '\n');
  });

  it('docs/GENERATED.md lists files that exist, and generated Markdown says so in its first lines', () => {
    const list = [...read('docs/GENERATED.md').matchAll(/^\| `([^`]+)` \|/gm)].map((m) => m[1]).filter((p) => !p.includes('*') && !p.includes('<'));
    expect(list.length).toBeGreaterThan(10);
    for (const p of list) {
      expect(existsSync(join(ROOT, p)), p).toBe(true);
      if (p.endsWith('.md')) expect(read(p).split('\n').slice(0, 4).join('\n'), p).toMatch(/generated/i);
    }
  });
});
