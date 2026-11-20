/** P6-09 (PLY-07): no internal id on screen ("Warriors used: 1 shadow_captain"). */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { unitName } from '../../../src/presentation/ui/unitName';

describe('one unit-name lookup (P6-09)', () => {
  it('names warriors, the hero and abilities, never by a snake_case id', () => {
    expect(unitName('hedgehog_roller', data)).toBe(data.troops.hedgehog_roller.name);
    expect(unitName('shadow_captain', data)).toBe(data.battle.heroes!.shadow_captain.name);
    expect(unitName('smoke_bomb', data)).toBe(data.battle.abilities.smoke_bomb.name);
    for (const id of ['shadow_captain', 'smoke_bomb', ...Object.keys(data.troops)]) expect(unitName(id, data)).not.toMatch(/_/);
  });

  it('no interface file falls back to an id after a troops lookup', () => {
    const dir = join(__dirname, '../../../src/presentation/ui');
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
      expect(readFileSync(join(dir, f), 'utf8'), f).not.toMatch(/\.troops\[([\w.]+)\]\?\.name \?\? \1\b/);
    }
  });
});
