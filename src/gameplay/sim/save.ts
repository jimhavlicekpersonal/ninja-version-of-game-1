import { buildingDef, levelDef, maxDefinedLevel } from './data';
import { footprint, rectsOverlap } from './grid';
import type { GameData, VillageState } from './types';
import { RESOURCE_KINDS } from './types';
import { mixSeed } from './rng';
import { scatterObstacles } from './obstacles';
import { emptyGrove } from './social/grove';
import { seasonOf } from './ranks';
import { emptyStats } from './types';
import { emptyResearch } from './research';
import { emptyNet } from './net';
import { emptyDaily } from './daily';
import type { GameData as GD } from './types';

export const SAVE_VERSION = 13;
const EXPORT_PREFIX = 'TK1';

export interface SaveFile {
  version: number;
  savedAt: number;
  village: VillageState;
}

/** The save was written by a newer build than this one. It is fine; this build just can't read it, so it must not be replaced. */
export class NewerSaveError extends Error {
  constructor() {
    super('This save is from a newer version of the game. Update the game first.');
    this.name = 'NewerSaveError';
  }
}

export function serialize(state: VillageState, now: number): SaveFile {
  return { version: SAVE_VERSION, savedAt: now, village: { ...structuredClone(state), lastSeenAt: now } };
}

/** Upgrade an older save file to the current format. Add a step here whenever SAVE_VERSION goes up. */
export function migrate(raw: unknown, data?: GD): SaveFile {
  if (!raw || typeof raw !== 'object') throw new Error('Save data is not an object');
  const file = raw as Partial<SaveFile>;
  if (typeof file.version !== 'number') throw new Error('Save data has no version');
  if (file.version > SAVE_VERSION) throw new NewerSaveError();
  const out = structuredClone(file) as SaveFile;
  const v = out.village as unknown as Record<string, unknown>;
  if (out.version < 2 && v && typeof v === 'object') {
    // v1 -> v2: army, training queue, battle log, seeds.
    v.army = v.army ?? {};
    v.training = v.training ?? [];
    v.battleLog = v.battleLog ?? [];
    const created = Number(v.createdAt) || 0;
    v.seed = v.seed ?? mixSeed(created >>> 0, Math.floor(created / 4294967296));
    v.nextSeed = v.nextSeed ?? 1;
  }
  if (out.version < 3 && v && typeof v === 'object') {
    // v2 -> v3: leaf rank, shields, defense log, seasons.
    const last = Number(v.lastSeenAt) || 0;
    v.trophies = v.trophies ?? 0;
    v.shieldUntil = v.shieldUntil ?? last + 24 * 3_600_000;
    v.defenseLog = v.defenseLog ?? [];
    v.season = v.season ?? seasonOf(last);
    v.raidCheckAt = v.raidCheckAt ?? last;
  }
  if (out.version < 4 && v && typeof v === 'object') {
    // v3 -> v4: economy, pass, tasks, cosmetics, achievements, obstacles.
    const last = Number(v.lastSeenAt) || 0;
    v.stats = v.stats ?? emptyStats();
    v.purchases = v.purchases ?? [];
    v.profile = v.profile ?? { under18: null };
    v.offers = v.offers ?? { active: [], lastShown: {}, bought: [] };
    const day = data ? Math.floor((last - data.pass.epoch) / 86_400_000) : 0;
    v.pass = v.pass ?? { season: data ? Math.floor(day / data.pass.seasonDays) : 0, points: 0, premium: false, claimedFree: [], claimedPremium: [] };
    v.tasks = v.tasks ?? { day, dayBaseline: emptyStats(), dayClaimed: [], week: Math.floor(day / 7), weekBaseline: emptyStats(), weekClaimed: [] };
    v.cosmetics = v.cosmetics ?? { owned: ['classic'], hallSkin: 'classic' };
    v.achievements = v.achievements ?? {};
    v.flags = v.flags ?? { longWaitSeen: false };
    if (data) scatterObstacles(v as unknown as VillageState, data);
  }
  if (out.version < 5 && v && typeof v === 'object') {
    // v4 -> v5: Grove.
    v.grove = v.grove ?? emptyGrove();
  }
  if (out.version < 6 && v && typeof v === 'object') {
    // v5 -> v6: tutorial (existing players have already found their way around).
    v.tutorial = v.tutorial ?? { step: 99, done: true };
  }
  if (out.version < 7 && v && typeof v === 'object') {
    // v6 -> v7: troop research, the kept scout opponent, and a counter of
    // finished upgrades (tasks now count finished work, not started work).
    v.research = v.research ?? emptyResearch();
    v.scout = v.scout ?? null;
    const tasks = v.tasks as { dayBaseline?: Record<string, number>; weekBaseline?: Record<string, number> } | undefined;
    for (const st of [v.stats, tasks?.dayBaseline, tasks?.weekBaseline] as (Record<string, number> | undefined)[]) {
      if (st && typeof st === 'object' && st.upgradesDone === undefined) st.upgradesDone = Number(st.upgradesStarted) || 0;
    }
    // Troop and defense numbers changed, so old replays would not play back
    // the same way any more: drop them rather than show wrong replays.
    v.battleLog = [];
    v.defenseLog = [];
  }
  if (out.version < 8 && v && typeof v === 'object') {
    // v7 -> v8: free daily chest and visit streak.
    v.daily = v.daily ?? (data ? emptyDaily(data) : { lastDay: -1, step: 0, skipsLeft: 1, skipWeek: -1, history: [] });
  }
  if (out.version < 9 && v && typeof v === 'object') {
    // v8 -> v9: online bookkeeping (real raids, donations and Grove Raid chests from a server).
    v.net = v.net ?? emptyNet();
    v.daily = v.daily ?? (data ? emptyDaily(data) : { lastDay: -1, step: 0, skipsLeft: 1, skipWeek: -1, history: [] });
  }
  if (out.version < 10 && v && typeof v === 'object') {
    // v9 -> v10 (ninja rebuild): Shadow Trials progress. Nothing else changed:
    // internal ids stayed the same, and old replays still play back exactly.
    v.trials = v.trials ?? { best: 0 };
    v.pendingBattle = v.pendingBattle ?? null;
  }
  if (out.version < 11 && v && typeof v === 'object') {
    // v10 -> v11: all 50 troop ids and Keep levels 7–15 are valid. Existing
    // inventory, research, queues, trials and six-unit replays remain intact.
    // New per-warrior battle effects are reconstructed from deployments.
    v.research = v.research ?? emptyResearch();
  }
  if (out.version < 12 && v && typeof v === 'object') {
    // v11 -> v12 (gameplay audit fixes):
    // - Lodge troops keep the level they were donated at. Troops already in the
    //   Lodge keep fighting at the level they would have used (your research).
    // - Settled league seasons are logged (they now settle while the game is open).
    // - Army presets for one-tap retraining.
    // - Battle records carry the rules version they were fought under; records
    //   from before have none, so their replays are marked unavailable instead of
    //   playing back a different fight. Their results stay in the log.
    const grove = v.grove as { reinforcements?: Record<string, number>; reinforcementLevels?: Record<string, number> } | undefined;
    const research = v.research as { levels?: Record<string, number> } | undefined;
    if (grove && typeof grove === 'object') {
      const levels: Record<string, number> = {};
      for (const [t, n] of Object.entries(grove.reinforcements ?? {})) if (n > 0) levels[t] = Math.max(1, research?.levels?.[t] ?? 1);
      grove.reinforcementLevels = grove.reinforcementLevels ?? levels;
    }
    v.seasonLog = v.seasonLog ?? [];
    v.armyPresets = v.armyPresets ?? [];
    // Research lanes: the single running research becomes the first lane.
    const r = v.research as { active?: unknown } | undefined;
    if (r && typeof r === 'object' && !Array.isArray(r.active)) r.active = r.active ? [r.active] : [];
    // New task counters start at zero (in the lifetime stats and both task baselines).
    const tasks = v.tasks as { dayBaseline?: Record<string, number>; weekBaseline?: Record<string, number> } | undefined;
    for (const st of [v.stats, tasks?.dayBaseline, tasks?.weekBaseline] as (Record<string, number> | undefined)[]) {
      if (st && typeof st === 'object') for (const k of ['researchDone', 'trialsCleared']) st[k] = st[k] ?? 0;
    }
  }
  if (out.version < 13 && v && typeof v === 'object') {
    // v12 -> v13: Gang War chests collected (roadmap step 65) start empty.
    const net = v.net as { gangWars?: string[] } | undefined;
    if (net && typeof net === 'object') net.gangWars = net.gangWars ?? [];
  }
  repairTrainingQueue(v);
  out.version = SAVE_VERSION;
  return out;
}

/**
 * A timer that ends before it began fails `validateVillage`, and a failed load
 * replaces the village. "Finish training" with more queued than the camps hold
 * used to write exactly that. Those warriors did finish, so they stay in the queue
 * as finished, waiting for room. Runs on every load (the format did not change):
 * one bad timer must never cost a player their village.
 */
function repairTrainingQueue(v: Record<string, unknown> | undefined): void {
  if (!v || !Array.isArray(v.training)) return;
  for (const q of v.training as { startedAt: number; endsAt: number }[]) {
    if (q && q.endsAt < q.startedAt) q.startedAt = q.endsAt;
  }
}

export function validateVillage(v: VillageState, data: GameData): string[] {
  const problems: string[] = [];
  if (!v || typeof v !== 'object') return ['village missing'];
  if (!Number.isFinite(v.createdAt) || !Number.isFinite(v.lastSeenAt)) problems.push('bad timestamps');
  if (!v.resources) problems.push('resources missing');
  if (!v.trials || !Number.isInteger(v.trials.best) || v.trials.best < 0) problems.push('bad trials');
  else for (const k of RESOURCE_KINDS) if (!Number.isFinite(v.resources[k]) || v.resources[k] < 0) problems.push(`bad ${k}`);
  if (!Array.isArray(v.buildings)) return [...problems, 'buildings missing'];
  const map = data.economy.mapSize;
  const ids = new Set<string>();
  let halls = 0;
  for (const b of v.buildings) {
    if (!data.buildings[b.type]) {
      problems.push(`unknown building ${b.type}`);
      continue;
    }
    const def = buildingDef(data, b.type);
    if (def.category === 'hall') halls++;
    if (ids.has(b.id)) problems.push(`duplicate id ${b.id}`);
    ids.add(b.id);
    if (!Number.isInteger(b.level) || b.level < 0 || b.level > maxDefinedLevel(data, b.type)) problems.push(`bad level on ${b.id}`);
    if (!Number.isInteger(b.x) || !Number.isInteger(b.y) || b.x < 0 || b.y < 0 || b.x + def.size > map || b.y + def.size > map) {
      problems.push(`${b.id} is off the map`);
    }
    if (b.upgrade) {
      const u = b.upgrade;
      const clearing = def.category === 'obstacle' && u.toLevel === 0;
      if (!clearing && (u.toLevel !== b.level + 1 || !levelDef(data, b.type, u.toLevel))) problems.push(`bad upgrade on ${b.id}`);
      if (!(u.endsAt >= u.startedAt)) problems.push(`bad timer on ${b.id}`);
    } else if (b.level < 1) problems.push(`${b.id} unfinished with no timer`);
    if (Boolean(def.produces) !== Boolean(b.collector)) problems.push(`collector mismatch on ${b.id}`);
  }
  if (halls !== 1) problems.push('village must have exactly one Clan Keep');
  if (!v.army || typeof v.army !== 'object') problems.push('army missing');
  else for (const [t, n] of Object.entries(v.army)) if (!data.troops[t] || !Number.isInteger(n) || n < 0) problems.push(`bad army entry ${t}`);
  if (!Array.isArray(v.training)) problems.push('training missing');
  else for (const q of v.training) if (!data.troops[q.troop] || !(q.endsAt >= q.startedAt)) problems.push('bad training item');
  if (!Array.isArray(v.battleLog)) problems.push('battle log missing');
  if (!Number.isFinite(v.seed) || !Number.isFinite(v.nextSeed)) problems.push('bad seed');
  if (!Number.isFinite(v.trophies) || v.trophies < 0) problems.push('bad trophies');
  if (!Number.isFinite(v.shieldUntil) || !Number.isFinite(v.season) || !Number.isFinite(v.raidCheckAt)) problems.push('bad rank fields');
  if (!Array.isArray(v.defenseLog)) problems.push('defense log missing');
  if (!v.stats || !v.pass || !v.tasks || !v.cosmetics || !v.offers || !v.profile || !Array.isArray(v.purchases)) problems.push('economy fields missing');
  if (!v.grove || !Array.isArray(v.grove.chat)) problems.push('alliance missing');
  if (!v.tutorial) problems.push('tutorial missing');
  if (!v.daily || !Number.isFinite(v.daily.lastDay) || !Number.isFinite(v.daily.step) || !Array.isArray(v.daily.history)) problems.push('daily chest missing');
  if (!Array.isArray(v.seasonLog)) problems.push('season log missing');
  if (!Array.isArray(v.armyPresets)) problems.push('army presets missing');
  else for (const p of v.armyPresets) if (!p || typeof p.army !== 'object' || Object.entries(p.army).some(([t, n]) => !data.troops[t] || !Number.isInteger(n) || n < 0)) problems.push('bad army preset');
  if (v.grove && (typeof v.grove.reinforcementLevels !== 'object' || !v.grove.reinforcementLevels)) problems.push('lodge levels missing');
  if (!v.research || typeof v.research.levels !== 'object') problems.push('research missing');
  else {
    for (const [t, n] of Object.entries(v.research.levels)) if (!data.troops[t] || !Number.isInteger(n) || n < 1 || n > data.troops[t].levels.length) problems.push(`bad research level ${t}`);
    if (!Array.isArray(v.research.active)) problems.push('bad research timer');
    else for (const a of v.research.active) if (!data.troops[a.troop] || !(a.endsAt >= a.startedAt)) problems.push('bad research timer');
  }
  for (let i = 0; i < v.buildings.length; i++) {
    for (let j = i + 1; j < v.buildings.length; j++) {
      const a = v.buildings[i];
      const c = v.buildings[j];
      if (!data.buildings[a.type] || !data.buildings[c.type]) continue;
      if (rectsOverlap(footprint(a, data), footprint(c, data))) problems.push(`${a.id} overlaps ${c.id}`);
    }
  }
  return problems;
}

export function deserialize(raw: unknown, data: GameData): VillageState {
  const file = migrate(raw, data);
  const problems = validateVillage(file.village, data);
  if (problems.length) throw new Error(`Save data is damaged: ${problems.slice(0, 3).join('; ')}`);
  return structuredClone(file.village);
}

// ---------- Export / import codes (move a village between devices) ----------

function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(b64: string): string {
  const std = b64.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(std + '='.repeat((4 - (std.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export function encodeExportCode(file: SaveFile): string {
  // Replays are left out to keep the code short enough to copy and paste.
  const slim: SaveFile = { ...file, village: { ...file.village, battleLog: [], defenseLog: [] } };
  const payload = toBase64Url(JSON.stringify(slim));
  return `${EXPORT_PREFIX}.${payload}.${fnv1a(payload)}`;
}

/** Returns the raw save file inside an export code. Throws if the code is mistyped. */
export function decodeExportCode(code: string): unknown {
  const parts = code.trim().split('.');
  if (parts.length !== 3 || parts[0] !== EXPORT_PREFIX) throw new Error("That doesn't look like a Kagemura: Ninja Clans save code.");
  const [, payload, sum] = parts;
  if (fnv1a(payload) !== sum) throw new Error('The save code is incomplete or has a typo.');
  try {
    return JSON.parse(fromBase64Url(payload));
  } catch {
    throw new Error('The save code could not be read.');
  }
}
