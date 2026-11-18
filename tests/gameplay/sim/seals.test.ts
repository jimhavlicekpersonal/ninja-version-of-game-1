/** P5-08 (PAC-11): Keep seals. */
import { describe, expect, it } from 'vitest';
import { sealProgress } from '../../../src/gameplay/sim/seals';
import { PLAYER_COMMANDS } from '../../../src/gameplay/sim/serverEconomy';
import { validateVillage } from '../../../src/gameplay/sim/save';
import type { Building, VillageState } from '../../../src/gameplay/sim/types';
import { applyCommand } from '../../../src/gameplay/sim/village';
import { data, newGame } from './helpers';

/** A village whose Keep is `keep` with every building that Keep allows at its cap (positions are not checked here). */
function full(keep: number): VillageState {
  const { state } = newGame();
  const limits = data.hall.levels[keep - 1].limits;
  const hall = state.buildings.find((b) => data.buildings[b.type].category === 'hall')!;
  const out: Building[] = [{ ...hall, level: keep }];
  let n = 0;
  for (const [type, lim] of Object.entries(limits)) {
    const def = data.buildings[type];
    if (!def || ['hall', 'obstacle', 'decor'].includes(def.category) || !lim.count) continue;
    for (let i = 0; i < lim.count; i++) out.push({ id: `s${n++}`, type, level: Math.min(lim.maxLevel ?? 1, def.levels.length), x: 0, y: 0, upgrade: null, collector: null });
  }
  return { ...state, buildings: out };
}

describe('Keep seals (P5-08)', () => {
  it('a full Keep can claim its seal once; the reward is Keep-scaled and the mark is kept', () => {
    const s = full(4);
    const p = sealProgress(s, data)!;
    expect(p).toMatchObject({ keep: 4, ready: true, sealed: false });
    expect(p.done).toBe(p.total);
    const r = applyCommand(s, { type: 'claimKeepSeal' }, 0, data);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.seals).toEqual([4]);
    expect(sealProgress(r.state, data)).toMatchObject({ sealed: true, ready: false });
    expect(applyCommand(r.state, { type: 'claimKeepSeal' }, 0, data)).toMatchObject({ ok: false, code: 'ALREADY_CLAIMED' });
    expect(validateVillage(r.state, data)).not.toContain('bad seals');
  });

  it('one building below the cap (or missing) and there is no seal yet', () => {
    const s = full(6);
    const lower = { ...s, buildings: s.buildings.map((b, i) => (i === 1 ? { ...b, level: b.level - 1 } : b)) };
    const p = sealProgress(lower, data)!;
    expect(p.ready).toBe(false);
    expect(p.done).toBe(p.total - 1);
    expect(applyCommand(lower, { type: 'claimKeepSeal' }, 0, data)).toMatchObject({ ok: false, code: 'NOT_AVAILABLE' });
  });

  it('is a player command the server replays', () => {
    expect(PLAYER_COMMANDS.has('claimKeepSeal')).toBe(true);
  });
});
