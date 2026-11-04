/**
 * Which game a battle was played with (roadmap step 72): `SIM_RULES` names
 * the battle rules, and `dataVersion` fingerprints the balance data
 * (src/gameplay/data, as loaded): FNV-1a 64 of its canonical JSON, the same
 * in the browser and on the server. Two builds with the same data have the
 * same data version, whatever else changed. Pure.
 */
import { canonicalJson, fnv64 } from './serverEconomy';
import type { GameData } from './types';

const known = new WeakMap<object, string>();

export function dataVersion(data: GameData): string {
  let v = known.get(data);
  if (!v) {
    v = fnv64(canonicalJson(data));
    known.set(data, v);
  }
  return v;
}
