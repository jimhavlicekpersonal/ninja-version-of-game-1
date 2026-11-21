// @vitest-environment happy-dom
/** Beast Mode 2026-11-21 GT-10: the stake picker shows the player's own recent 2★ and 3★ hit rate. */
import { afterEach, describe, expect, it } from 'vitest';
import { BattleSession } from '../../../src/gameplay/control/battleSession';
import { generateOpponent } from '../../../src/gameplay/sim/battle/basegen';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { recentStarHits } from '../../../src/gameplay/sim/pass';
import { createNewVillage } from '../../../src/gameplay/sim/village';
import type { BattleRecord } from '../../../src/gameplay/sim/battle/types';
import { BattleHud } from '../../../src/presentation/ui/battleHud';

let hud: BattleHud | null = null;
afterEach(() => {
  hud?.destroy();
  hud = null;
});

const raid = (stars: number) => ({ kind: 'attack', result: { stars, destruction: stars * 30, loot: {}, used: {} } }) as unknown as BattleRecord;

describe('recent hit rate on the stake picker (GT-10)', () => {
  it('counts the player\'s own recent raids (not wars, Trials or drills), and nothing below the minimum', () => {
    const s = createNewVillage(0, data);
    s.battleLog = [raid(1), raid(2)];
    expect(recentStarHits(s, data)).toBeNull();
    s.battleLog = [raid(1), raid(2), raid(3), raid(0), { ...raid(3), trial: 4 } as BattleRecord, { ...raid(3), war: true } as unknown as BattleRecord];
    expect(recentStarHits(s, data)).toEqual({ raids: 4, two: 2, three: 1 });
  });

  it('is shown under the stake chips at scouting', () => {
    document.body.innerHTML = '<div id="battle-hud"></div>';
    const session = new BattleSession({ seed: 3, base: generateOpponent(77, 5, data), army: { beetle_brute: 5 }, levels: { beetle_brute: 1 }, infiltration: true }, data, 'scout');
    hud = new BattleHud({ root: document.getElementById('battle-hud')!, session, myTrophies: 400, troopThumb: () => null, scoutFee: 0, canPayFee: () => true, onHome: () => undefined, onNext: () => undefined, onAttack: () => true, onReplay: () => undefined, onFinished: () => null, stakes: true, recentHits: { raids: 10, two: 6, three: 1 } });
    (hud as unknown as { renderScout(): void }).renderScout();
    expect(document.querySelector('[data-id="stake-rate"]')?.textContent).toBe('Your last 10 raids: 2★ or more in 6, 3★ in 1.');
  });
});
