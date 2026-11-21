/**
 * Beast Mode 2026-11-21 STB-07: paint a battle's new building looks and ruins in short slices before the battle
 * scene starts, so battle open has no long task and the first destruction paints nothing.
 */
import type Phaser from 'phaser';
import { Keys, buildingTexture, holdBuildingTextures } from './assets';
import { battleTextureKeys } from './battleKeys';
import { ruinTextureOn } from './fx';

/** Held from painting until the battle scene holds them itself (`BattleScene.create` releases it). */
export const PREP_OWNER = 'battle-prep';

/**
 * The paint jobs still needed for these buildings (empty when everything exists: the caller starts at once).
 * Real art for a level or its tier wins, as in `buildingTexture`.
 */
export function battlePaintJobs(textures: Phaser.Textures.TextureManager, buildings: readonly { type: string; level: number; size: number; kind: string }[]): (() => void)[] {
  const plan = battleTextureKeys(buildings);
  const jobs: (() => void)[] = [];
  const held: string[] = [];
  for (const l of plan.levels) {
    if (textures.exists(l.key) || textures.exists(Keys.building(l.type, l.level))) {
      if (textures.exists(l.key)) held.push(l.key);
      continue;
    }
    // Real tier art is checked inside `buildingTexture` (then the job paints nothing).
    jobs.push(() => {
      const key = buildingTexture(textures, l.type, l.level, l.size);
      held.push(key);
      holdBuildingTextures(textures, PREP_OWNER, held);
    });
  }
  for (const r of plan.ruins) if (!textures.exists(r.key)) jobs.push(() => void ruinTextureOn(textures, r.size, r.family));
  // Looks already painted stay until the scene holds them (a shut-down battle releases its own).
  if (held.length) holdBuildingTextures(textures, PREP_OWNER, held);
  return jobs;
}

/** Run jobs in slices of `sliceMs`, yielding between slices; `cancelled()` stops early. */
export async function runSliced(jobs: (() => void)[], sliceMs = 8, cancelled: () => boolean = () => false): Promise<void> {
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  let i = 0;
  while (i < jobs.length && !cancelled()) {
    const start = now();
    do jobs[i++]();
    while (i < jobs.length && now() - start < sliceMs);
    if (i < jobs.length) await new Promise<void>((r) => setTimeout(r, 0));
  }
}
