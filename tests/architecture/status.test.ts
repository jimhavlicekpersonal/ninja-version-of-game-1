/**
 * Report section 5 step 10 (quality 9, 11): docs/STATUS.md is generated from the code and must stay current.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { statusMarkdown } from '../../tools/status/status';

describe('docs/STATUS.md', () => {
  it('matches the code (run npm run status)', () => {
    expect(readFileSync(join(__dirname, '../../docs/STATUS.md'), 'utf8')).toBe(statusMarkdown());
  });
});
