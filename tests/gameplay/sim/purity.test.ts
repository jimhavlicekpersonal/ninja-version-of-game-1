import { describe, expect, it } from 'vitest';

const simSources = import.meta.glob('../../../src/gameplay/sim/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('architecture rules', () => {
  it('src/sim never imports Phaser or touches the DOM', () => {
    const files = Object.entries(simSources);
    expect(files.length).toBeGreaterThan(3);
    for (const [path, src] of files) {
      expect(src, path).not.toMatch(/from ['"]phaser['"]/);
      expect(src, path).not.toMatch(/\b(window|document|localStorage|indexedDB)\./);
      expect(src, path).not.toMatch(/Math\.random\(/);
    }
  });

  it('only the SystemClock reads the real time', () => {
    for (const [path, src] of Object.entries(simSources)) {
      if (path.endsWith('clock.ts')) continue;
      expect(src, path).not.toMatch(/Date\.now\(/);
    }
  });
});
