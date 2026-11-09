/**
 * Replays are tied to the battle rules they were fought under (audit F18).
 * This fingerprint covers every number the battle simulation reads (troops,
 * buildings, battle.json; names and descriptions left out). If it changes,
 * old recordings would no longer play back the fight the player had, so:
 * bump SIM_RULES in sim/battle/battle.ts and update both values below.
 */
import { describe, expect, it } from 'vitest';
import { SIM_RULES } from '../../../src/gameplay/sim/battle/battle';
import { defaultData as data } from '../../../src/gameplay/sim/data';

// Text, prices and timers never change how a recorded battle plays out.
const TEXT = new Set(['name', 'description', 'text', 'summary', 'look', 'tip', '$comment', 'research', 'cost', 'trainSeconds', 'buildSeconds', 'unlockKeep', 'barracksLevel', 'levelCapOffset', 'ratePerHour', 'storage', 'trainingSpeed', 'reinforcement', 'inShop', 'clear', 'scoutFeeByHall', 'generatedLootByHall', 'maxReplays']);

function strip(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(strip);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k]) => !TEXT.has(k)).map(([k, x]) => [k, strip(x)]));
  return v;
}

function fnv(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function combatFingerprint(): string {
  return fnv(JSON.stringify(strip({ troops: data.troops, buildings: data.buildings, battle: data.battle })));
}

describe('battle rules version', () => {
  it('combat data has not changed without a SIM_RULES bump', () => {
    expect({ rules: SIM_RULES, fingerprint: combatFingerprint() }).toEqual({ rules: 6, fingerprint: 'c471a8e0' });
  });
});
