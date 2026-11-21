/** Beast Mode 2026-11-21 GT-12: the rating's power term reads a server-held village's research, not its bare Keep. */
import { describe, expect, it } from 'vitest';
import { attackPower } from '../../../server/core/pvp';
import { baseAt, world } from './harness';

describe('attack power for ratings (GT-12)', () => {
  it('a device village counts at its Keep; a server-held village at what its research is worth (never above its Keep)', async () => {
    const w = world();
    const dev = await w.player('Dev', baseAt(3));
    await w.repo.updatePlayer(dev.id, { hallLevel: 6 });
    expect(await attackPower(w.repo, (await w.repo.getPlayer(dev.id))!, w.data)).toBe(6);

    const ann = await w.player('Ann');
    await ann.startVillage();
    // A Keep 10 account whose village is a fresh one (level-1 research): rated as the army it can field.
    await w.repo.updatePlayer(ann.id, { hallLevel: 10 });
    const power = await attackPower(w.repo, (await w.repo.getPlayer(ann.id))!, w.data);
    expect(power).toBeLessThan(10);
    expect(power).toBeGreaterThanOrEqual(1);
  });
});
