/**
 * P7-14: the in-game "What's new" and the stores' release notes are the same text, for the current version.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WHATS_NEW } from '../../../src/presentation/ui/newsUi';

const ROOT = join(__dirname, '../../..');

describe("What's new (P7-14)", () => {
  it('names the package version and matches docs/store/RELEASE_NOTES.md', () => {
    expect(WHATS_NEW.version).toBe(JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version);
    const en = JSON.parse(readFileSync(join(ROOT, 'locales/en/ui.json'), 'utf8'))[WHATS_NEW.key] as string;
    expect(en).toBeTruthy();
    const notes = readFileSync(join(ROOT, 'docs/store/RELEASE_NOTES.md'), 'utf8');
    expect(notes).toContain(`## ${WHATS_NEW.version}\n\n${en}\n`);
  });
});
