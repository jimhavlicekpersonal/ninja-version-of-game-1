/** Beast Mode 2026-11-21 SEC-06 (S5 open part): look-alike names in other scripts passed the uniqueness check. */
import { describe, expect, it } from 'vitest';
import { nameSkeleton } from '../../../src/backend/net/names';
import { world } from './harness';

describe('SEC-06: name skeletons', () => {
  it('a Cyrillic look-alike shares a skeleton with the Latin name; Indic and CJK names keep their marks', () => {
    expect(nameSkeleton('Јоhn')).toBe(nameSkeleton('John'));
    expect(nameSkeleton('J0hn')).toBe(nameSkeleton('John'));
    expect(nameSkeleton('कमल')).not.toBe(nameSkeleton('कमला'));
    expect(nameSkeleton('किरण')).not.toBe(nameSkeleton('करण'));
    expect(nameSkeleton('山田')).toBe('山田');
  });

  it('a rename to the Cyrillic look-alike of a taken name is refused; a distinct Indic name is allowed', async () => {
    const w = world();
    const pop = await w.player('Popeye');
    expect((await w.repo.getPlayer(pop.id))!.name).toBe('Popeye');
    const other = await w.player('Someone Else');
    w.advance(30 * 86_400_000);
    // Wholly Cyrillic: Р о р е у е.
    await expect(other.rename('\u0420\u043e\u0440\u0435\u0443\u0435')).rejects.toMatchObject({ code: 'name_taken' });
    await expect(other.rename('किरण')).resolves.toMatchObject({ name: 'किरण' });
  });
});
