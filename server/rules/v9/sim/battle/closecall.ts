/**
 * Close calls: honest "so close" notes after an attack. Every note is read
 * from the finished simulation and appears only when it is true (thresholds
 * in battle.json `closeCall`). Nothing here changes an outcome, and nothing
 * is shown for random rewards: a chest only ever shows what it gave.
 */
import type { GameData } from '../types';
import { destruction, type BattleSim } from './battle';

export interface CloseCall {
  kind: 'star' | 'hall' | 'perfect';
  /** English, kept for compatibility; the interface can word it from `kind` + `params` (GUI request, step 9). */
  text: string;
  /** star: `short` points below the `threshold`% star; hall: the Keep's `hpPercent` left; perfect: `left` buildings. */
  params: Record<string, number>;
}

export function closeCalls(sim: BattleSim, data: GameData): CloseCall[] {
  if (!sim.ended) return [];
  const cfg = data.battle.closeCall;
  const t = data.battle.starThresholds;
  const d = destruction(sim);
  const out: CloseCall[] = [];
  if (d < t.destruction && t.destruction - d <= cfg.starMargin) {
    out.push({ kind: 'star', text: `Just ${t.destruction - d}% short of the ${t.destruction}% star.`, params: { short: t.destruction - d, threshold: t.destruction } });
  }
  const hall = sim.buildings.find((b) => b.kind === 'hall');
  if (hall && !hall.destroyed && hall.hp / hall.maxHp <= cfg.hallHpFraction) {
    const hpPercent = Math.max(1, Math.round((hall.hp / hall.maxHp) * 100));
    out.push({ kind: 'hall', text: `The Clan Keep had only ${hpPercent}% of its health left.`, params: { hpPercent } });
  }
  const left = sim.countable - sim.destroyedCount;
  if (left > 0 && left <= cfg.buildingsLeft && d < t.full && d >= cfg.perfectMinDestruction) {
    out.push({ kind: 'perfect', text: left === 1 ? 'One building stood between you and 3 stars.' : `Only ${left} buildings stood between you and 3 stars.`, params: { left } });
  }
  return out;
}
