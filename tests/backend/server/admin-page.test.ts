/**
 * The staff page's script (roadmap step 48). Remnant audit (2026-11-06): it showed internal ids
 * (`moonstones`, `moonstones_1`) where support tickets say "Jade" and "Pouch of Jade".
 */
import { expect, it } from 'vitest';
import { adminScript } from '../../../server/adminPage';

it('is valid JavaScript and names resources and products the way players do, ids alongside', () => {
  const src = adminScript();
  expect(() => new Function(src)).not.toThrow();
  const names = JSON.parse(/const NAMES = (\{.*\});/.exec(src)![1]) as { res: Record<string, string>; products: Record<string, string> };
  expect(names.res.moonstones).toBe('Jade');
  expect(names.res.acorns).toBe('Coins');
  expect(names.products.moonstones_1).toBe('Pouch of Jade (store id jade_pouch)');
  expect(names.products.lantern_pass).toMatch(/^Season Scroll/);
  expect(src).toContain("map((k) => el('option', { value: k }, resName(k)))");
});
