/**
 * Regression: the one-time "What is shared" dialog (main.ts) passed the English STATS_EXPLAINER straight to
 * hud.confirm, so it was English in every language while Settings showed the translation.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import de from '../../../locales/compiled/de.json';
import { installCatalog } from '../../../locales/runtime';
import { useLanguage } from '../../../src/presentation/ui/i18n';
import { STATS_EXPLAINER, statsExplainer } from '../../../src/presentation/ui/statsText';

const ROOT = join(__dirname, '../../..');
afterEach(() => useLanguage('en'));

describe('the play statistics explainer', () => {
  it('is translated wherever it is shown', async () => {
    installCatalog('de', de);
    await useLanguage('de');
    const text = statsExplainer();
    expect(text).not.toBe(STATS_EXPLAINER);
    expect(text.length).toBeGreaterThan(100);
    await useLanguage('en');
    expect(statsExplainer()).toBe(STATS_EXPLAINER);
  });

  it('is never passed raw to a dialog or paragraph', () => {
    for (const file of ['src/main.ts', 'src/presentation/ui/hud.ts']) {
      const src = readFileSync(join(ROOT, file), 'utf8');
      // Only the re-export may name it; every display goes through statsExplainer().
      expect(src.replace(/export \{ STATS_EXPLAINER[^}]*\}/, '')).not.toMatch(/STATS_EXPLAINER/);
    }
  });
});
