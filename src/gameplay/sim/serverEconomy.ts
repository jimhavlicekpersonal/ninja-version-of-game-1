/**
 * The server-owned economy (roadmap Phase 2, steps 19-22). When a village
 * lives on the server, the server replays the player's commands with this
 * same simulation and compares one hash: the economy (what can be spent,
 * built, trained, researched or lost in a raid). Everything else in a village
 * (logs, tutorial, offers, cosmetics bookkeeping) stays the device's business.
 * When the hashes differ, the server's economy wins (`withEconomy`).
 *
 * Pure and deterministic, shared by the game and the server.
 */
import type { Command } from './village';
import type { Building, GroveState, Resources, ResearchState, TrainingItem, VillageState } from './types';

export interface Economy {
  resources: Resources;
  buildings: Building[];
  /** Next building id (placing a building takes one). */
  nextId: number;
  army: Record<string, number>;
  training: TrainingItem[];
  research: ResearchState;
  /** Donated warriors in the Alliance Lodge, and the level each fights at. */
  lodge: { troops: GroveState['reinforcements']; levels: GroveState['reinforcementLevels'] };
}

const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export function economyOf(s: VillageState): Economy {
  return copy({
    resources: s.resources,
    buildings: s.buildings,
    nextId: s.nextId,
    army: s.army,
    training: s.training,
    research: s.research,
    lodge: { troops: s.grove.reinforcements, levels: s.grove.reinforcementLevels },
  });
}

/** A copy of the village with the server's economy in place of its own. */
export function withEconomy(s: VillageState, e: Economy): VillageState {
  const out = copy(s);
  const eco = copy(e);
  out.resources = eco.resources;
  out.buildings = eco.buildings;
  out.nextId = eco.nextId;
  out.army = eco.army;
  out.training = eco.training;
  out.research = eco.research;
  out.grove.reinforcements = eco.lodge.troops;
  out.grove.reinforcementLevels = eco.lodge.levels;
  return out;
}

/** JSON with object keys sorted at every level, so equal content always gives equal text. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? 'null' : canonicalJson(v))).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
}

/** 64-bit FNV-1a (two 32-bit lanes) as 16 hex characters: fast, synchronous, the same everywhere. Not for security. */
export function fnv64(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c ^ (a >>> 7), 0x01000193) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

export function economyHash(s: VillageState): string {
  return fnv64(canonicalJson(economyOf(s)));
}

/**
 * Commands a player may send for the server to replay. The rest are results
 * the server makes itself (attacks, defenses, donations, war chests, honor:
 * `battleEnd`, `settleOnlineAttack`, `applyDefense`, `spendDonation`, …) or
 * belong to the offline bot Alliance. `grantPurchase` stays trusted until the
 * server verifies store receipts (roadmap Phase 4); the server logs it as such.
 */
export const PLAYER_COMMANDS: ReadonlySet<Command['type']> = new Set<Command['type']>([
  'place',
  'move',
  'upgrade',
  'cancel',
  'collect',
  'train',
  'trainArmy',
  'saveArmyPreset',
  'deleteArmyPreset',
  'dismiss',
  'cancelTraining',
  'research',
  'cancelResearch',
  'skipResearch',
  'openDailyChest',
  'scout',
  'trialEnd',
  'trialAlternate',
  'battleProgress',
  'abandonBattle',
  'skip',
  'skipTraining',
  'topUp',
  'grantPurchase',
  'setProfile',
  'buySkin',
  'equipSkin',
  'claimTask',
  'claimTier',
  'claimAchievement',
  'clear',
  'tutorial',
  'markPrepOffer',
]);
