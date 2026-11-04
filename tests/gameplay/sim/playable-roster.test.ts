import { describe, expect, it } from 'vitest';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { WARRIORS, warriorLevelCap, warriorUnlockKeep } from '../../../src/gameplay/sim/progression';
import { applyCommand, trainQuote } from '../../../src/gameplay/sim/village';
import { finishTraining } from '../../../src/gameplay/sim/army';
import { finishResearch, researchQuote, troopLevelCapAt } from '../../../src/gameplay/sim/research';
import { deserialize, migrate, serialize, validateVillage } from '../../../src/gameplay/sim/save';
import { checkArmy, validLevels } from '../../../server/core/pvp';
import type { Player } from '../../../server/repo';
import type { BattleSubmission } from '../../../src/backend/net/protocol';
import { newGame } from './helpers';

function atKeep(keep: number) {
  const { state, clock } = newGame({ acorns: 1e9, dew: 1e9 });
  state.buildings[0].level = keep;
  const dojo = data.hall.levels[keep - 1].limits.burrow_barracks;
  state.buildings.push(
    { id: 'dojo', type: 'burrow_barracks', x: 3, y: 3, level: dojo.maxLevel, upgrade: null, collector: null },
    { id: 'camp', type: 'army_camp', x: 3, y: 8, level: data.hall.levels[keep - 1].limits.army_camp.maxLevel, upgrade: null, collector: null },
  );
  return { state, now: clock.now() };
}

describe('roster unlock, training, research and persistence', () => {
  it('has exactly fifty distinct playable catalog entries', () => {
    expect(Object.keys(data.troops)).toHaveLength(50);
    expect(new Set(WARRIORS.map((w) => w.liveTroop)).size).toBe(50);
    expect(WARRIORS.every((w) => data.troops[w.liveTroop!])).toBe(true);
  });
  it.each(WARRIORS)('$name is trainable at its unlock, researchable and survives a save round trip', (w) => {
    const troop = w.liveTroop!;
    const keep = warriorUnlockKeep(w, data);
    const { state, now } = atKeep(keep);
    expect(trainQuote(state, troop, now, data).ok).toBe(true);
    if (data.troops[troop].unlockKeep && keep > 1) {
      const before = atKeep(keep - 1);
      expect(trainQuote(before.state, troop, before.now, data)).toMatchObject({ ok: false, code: 'LOCKED' });
    }
    const trained = applyCommand(state, { type: 'train', troop }, now, data);
    expect(trained.ok).toBe(true);
    if (!trained.ok) return;
    finishTraining(trained.state, now + data.troops[troop].trainSeconds * 1000, data);
    expect(trained.state.army[troop]).toBe(1);
    expect(deserialize(serialize(trained.state, now), data).army[troop]).toBe(1);
    const endgame = atKeep(15);
    const quote = researchQuote(endgame.state, troop, 15, data);
    expect(quote.ok).toBe(true);
    const researched = applyCommand(endgame.state, { type: 'research', troop }, endgame.now, data);
    expect(researched.ok).toBe(true);
    if (!researched.ok) return;
    finishResearch(researched.state, Number.MAX_SAFE_INTEGER);
    expect(researched.state.research.levels[troop]).toBe(2);
    expect(validateVillage(researched.state, data)).toEqual([]);
  });
  it('uses tier-adjusted research caps at every Keep', () => {
    for (const w of WARRIORS) {
      for (let keep = warriorUnlockKeep(w, data); keep <= 15; keep++) {
        expect(Math.min(data.troops[w.liveTroop!].levels.length, troopLevelCapAt(keep, data, w.liveTroop))).toBe(warriorLevelCap(w, keep, data));
      }
    }
  });
  it('migrates v10 without losing inventory, training, research, or trial progress', () => {
    const { state, now } = atKeep(6);
    state.army = { hedgehog_roller: 7, saboteur: 2 };
    state.research.levels = { hedgehog_roller: 4 };
    state.training = [{ troop: 'frog_lobber', startedAt: now, endsAt: now + 25000, cost: { dew: 50 } }];
    state.trials.best = 17;
    expect(migrate({ ...serialize(state, now), version: 10 }, data).village).toEqual(state);
  });
});

describe('expanded progression remains reachable', () => {
  it('every troop unlock has a reachable Dojo level', () => {
    for (const w of WARRIORS) {
      const keep = warriorUnlockKeep(w, data);
      expect(data.troops[w.liveTroop!].barracksLevel).toBeLessThanOrEqual(data.hall.levels[keep - 1].limits.burrow_barracks.maxLevel);
    }
  });
  it('camp housing never shrinks and all Keep-indexed tables cover all fifteen levels', () => {
    const camps = data.buildings.army_camp.levels;
    for (let i = 1; i < camps.length; i++) expect(camps[i].housing!).toBeGreaterThan(camps[i - 1].housing!);
    for (const table of [data.battle.generatedLootByHall, data.battle.scoutFeeByHall, data.economy.rewardScaleByHall, data.raids.botArmyMix, data.raids.storageLootCapByHall]) expect(table).toHaveLength(15);
  });
  it('late-game building and research costs fit the available storage', () => {
    for (let keep = 7; keep <= 15; keep++) {
      const limits = data.hall.levels[keep - 1].limits;
      const cap: Record<string, number> = { acorns: 0, dew: 0, moonstones: Infinity };
      for (const [id, limit] of Object.entries(limits)) {
        for (const [resource, amount] of Object.entries(data.buildings[id].levels[limit.maxLevel - 1].storage ?? {})) cap[resource] = (cap[resource] ?? 0) + amount * limit.count;
      }
      for (const [id, limit] of Object.entries(limits)) {
        for (const [resource, cost] of Object.entries(data.buildings[id].levels[limit.maxLevel - 1].cost)) expect(cost, `${keep} ${id}`).toBeLessThanOrEqual(cap[resource]);
      }
      for (const w of WARRIORS.filter((w) => warriorUnlockKeep(w, data) <= keep)) {
        const level = warriorLevelCap(w, keep, data);
        const cost = data.troops[w.liveTroop!].levels[level - 1].research?.cost.dew ?? 0;
        expect(cost, `${keep} ${w.name}`).toBeLessThanOrEqual(cap.dew);
      }
    }
  });
});

describe('server roster validation', () => {
  it('rejects locked troops and excessive tier research while accepting the endgame roster', () => {
    const submission: BattleSubmission = { ticket: 'test-ticket', seed: 1, deployments: [], army: { eclipse_ninja: 1 }, levels: { eclipse_ninja: 1 } };
    expect(() => checkArmy(submission, { hallLevel: 6 } as Player, data)).toThrow('troop not unlocked');
    expect(validLevels({ eclipse_ninja: 13 }, 15, data)).toBeNull();
    expect(validLevels({ eclipse_ninja: 12 }, 15, data)).toEqual({ eclipse_ninja: 12 });
    expect(checkArmy(submission, { hallLevel: 15 } as Player, data).army).toEqual(submission.army);
  });
});
