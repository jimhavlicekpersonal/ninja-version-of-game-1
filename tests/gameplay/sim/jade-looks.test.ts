/** P5-11 (ECO-09): honest Jade sinks. More Keep looks for Jade at the existing price ladder; never power, never a product. */
import { describe, expect, it } from 'vitest';
import { data } from './helpers';

describe('Keep looks for Jade (P5-11)', () => {
  const sold = data.cosmetics.hallSkins.filter((k) => k.moonstones > 0);
  const ladder = new Set([200, 250, 300, 450, 650, 900]);

  it('at least twelve looks for Jade, all at the existing price ladder, spread over the Keeps', () => {
    expect(sold.length).toBeGreaterThanOrEqual(12);
    for (const k of sold) expect(ladder.has(k.moonstones), k.id).toBe(true);
    expect(new Set(sold.map((k) => k.minKeep ?? 1)).size).toBeGreaterThanOrEqual(8);
  });

  it('a look is two colours and a name, nothing else (no power), and no store product sells one', () => {
    for (const k of data.cosmetics.hallSkins) {
      expect(Object.keys(k).sort().filter((x) => !['id', 'name', 'moonstones', 'cap', 'spots', 'minKeep', 'passOnly', 'calendarOnly', 'earned'].includes(x))).toEqual([]);
    }
    const looks = new Set(data.cosmetics.hallSkins.map((k) => k.id));
    for (const p of data.store.packs) for (const g of Object.keys((p as unknown as { grants?: object }).grants ?? {})) expect(looks.has(g)).toBe(false);
  });
});
