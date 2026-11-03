/**
 * Joinable AI factions: the social structure that exists before real
 * communities do. A player joins one of the great clans and gets missions,
 * a daily support squad and a weekly war against the clan's rival, which the
 * player's conquests and wins can tip.
 *
 * AI factions give orders and send warriors; they never chat or pose as
 * people. Rewards are fixed, shown in advance and never sold.
 */
import { barracksLevel } from '../army';
import { scaleReward } from '../economy';
import { dayIndex } from '../pass';
import { createRng, int, mixSeed, next } from '../rng';
import { reinforcementCapacity, reinforcementHousing } from '../social/grove';
import type { Cost, FactionMissionDef, FactionState, FactionWarRecord, GameData, VillageState } from '../types';
import { hashId, pushNews } from './clans';
import { clanDef } from './villagegen';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export function emptyFaction(): FactionState {
  return { id: null, joinedAt: 0, leftAt: 0, reputation: 0, day: -1, dayBaseline: {}, claimed: [], supportDay: -1, war: { week: -1, conquests: 0, rivalConquests: 0, raidWins: 0 }, warHistory: [] };
}

export function factionRank(reputation: number, data: GameData): { index: number; name: string; supportHousing: number; next: { name: string; reputation: number } | null } {
  const ranks = data.world.factions.ranks;
  let i = 0;
  for (let k = 0; k < ranks.length; k++) if (reputation >= ranks[k].reputation) i = k;
  const nx = ranks[i + 1];
  return { index: i, name: ranks[i].name, supportHousing: ranks[i].supportHousing, next: nx ? { name: nx.name, reputation: nx.reputation } : null };
}

/** A counter a mission can track: lifetime stats or world counters. */
export function factionStat(state: VillageState, key: string): number {
  const s = state.stats as unknown as Record<string, number>;
  if (key in s) return s[key] ?? 0;
  const w = state.world.counters as unknown as Record<string, number>;
  return w[key] ?? 0;
}

function snapshot(state: VillageState, data: GameData): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of data.world.factions.missions) out[m.stat] = factionStat(state, m.stat);
  return out;
}

export function canJoinFaction(state: VillageState, clanId: string, now: number, data: GameData): { ok: true } | { ok: false; message: string } {
  if (!data.clans.clans.some((c) => c.id === clanId)) return { ok: false, message: 'Unknown clan.' };
  const f = state.world.faction;
  if (f.id === clanId) return { ok: false, message: `You already serve ${clanDef(data, clanId).name}.` };
  if (f.id) return { ok: false, message: 'Leave your faction first.' };
  const wait = f.leftAt + data.world.factions.switchCooldownHours * HOUR - now;
  if (f.leftAt && wait > 0) return { ok: false, message: `You can pledge to a new faction in ${Math.ceil(wait / HOUR)} h.` };
  return { ok: true };
}

/** Join a faction. Reputation stays with the player; missions and war counters start fresh. Mutates. */
export function joinFaction(state: VillageState, clanId: string, now: number, data: GameData): void {
  const f = state.world.faction;
  f.id = clanId;
  f.joinedAt = now;
  f.day = dayIndex(now, data);
  f.dayBaseline = snapshot(state, data);
  f.claimed = [];
  f.war = { week: warWeek(now, data), conquests: 0, rivalConquests: 0, raidWins: 0 };
  pushNews(state.world, { at: now, kind: 'faction', text: `You pledged your clan to ${clanDef(data, clanId).name}.` }, data);
}

export function leaveFaction(state: VillageState, now: number, data: GameData): void {
  const f = state.world.faction;
  if (!f.id) return;
  pushNews(state.world, { at: now, kind: 'faction', text: `You left ${clanDef(data, f.id).name}.` }, data);
  f.id = null;
  f.leftAt = now;
  f.war = { week: -1, conquests: 0, rivalConquests: 0, raidWins: 0 };
}

/** Start a new mission day if the day changed. Mutates. */
export function rollFactionDay(state: VillageState, now: number, data: GameData): void {
  const f = state.world.faction;
  const day = dayIndex(now, data);
  if (!f.id || f.day === day) return;
  f.day = day;
  f.dayBaseline = snapshot(state, data);
  f.claimed = [];
}

export interface MissionView {
  def: FactionMissionDef;
  text: string;
  target: number;
  progress: number;
  done: boolean;
  claimed: boolean;
  reward: Cost;
}

/** Today's missions (the same for the whole day, from the world seed). */
export function factionMissions(state: VillageState, hall: number, data: GameData): MissionView[] {
  const f = state.world.faction;
  if (!f.id) return [];
  const cfg = data.world.factions;
  const rng = createRng(mixSeed(mixSeed(state.world.seed, hashId(f.id)), f.day));
  const pool = [...cfg.missions];
  const picked: FactionMissionDef[] = [];
  while (picked.length < cfg.missionsPerDay && pool.length) picked.push(pool.splice(int(rng, 0, pool.length - 1), 1)[0]);
  return picked.map((def) => {
    const target = Math.max(1, Math.round(def.base + def.perHall * (hall - 1)));
    const progress = Math.max(0, factionStat(state, def.stat) - (f.dayBaseline[def.stat] ?? 0));
    return { def, text: def.text.replace('{n}', target.toLocaleString('en-US')).replace('{s}', target === 1 ? '' : 's'), target, progress: Math.min(target, progress), done: progress >= target, claimed: f.claimed.includes(def.id), reward: scaleReward(def.reward, hall, data) };
  });
}

/** The day's support squad: warriors of the faction's style the player's Dojo can field. */
export function supportSquad(state: VillageState, data: GameData): Record<string, number> {
  const f = state.world.faction;
  if (!f.id) return {};
  const housing = factionRank(f.reputation, data).supportHousing;
  const dojo = Math.max(1, barracksLevel(state, data));
  const mix = Object.entries(clanDef(data, f.id).army).filter(([t]) => data.troops[t] && data.troops[t].barracksLevel <= dojo);
  const sum = mix.reduce((a, [, v]) => a + v, 0);
  const out: Record<string, number> = {};
  if (!housing || !sum) return out;
  let used = 0;
  for (const [t, share] of mix) {
    const n = Math.floor((housing * share) / sum / data.troops[t].housing);
    if (n > 0) {
      out[t] = n;
      used += n * data.troops[t].housing;
    }
  }
  const filler = mix.map(([t]) => t).sort((a, b) => data.troops[a].housing - data.troops[b].housing)[0];
  const extra = Math.floor((housing - used) / data.troops[filler].housing);
  if (extra > 0) out[filler] = (out[filler] ?? 0) + extra;
  return out;
}

/** Room for support troops: the larger of the Alliance Lodge and the rank's support housing. */
export function supportRoom(state: VillageState, data: GameData): number {
  const housing = factionRank(state.world.faction.reputation, data).supportHousing;
  return Math.max(reinforcementCapacity(state, data), housing) - reinforcementHousing(state, data);
}

export function warWeek(now: number, data: GameData): number {
  const w = data.world.factions.war;
  return Math.floor((now - w.epoch) / (w.periodDays * DAY));
}

export function warEndsAt(week: number, data: GameData): number {
  const w = data.world.factions.war;
  return w.epoch + (week + 1) * w.periodDays * DAY;
}

/** A faction's simulated score in a war week (the same for every player in the world). */
export function warAiScore(worldSeed: number, week: number, clanId: string, data: GameData): number {
  const [a, b] = data.world.factions.war.aiScore;
  const rng = createRng(mixSeed(mixSeed(worldSeed, hashId(clanId) ^ 0x3a7), week));
  return a + Math.floor(next(rng) * (b - a + 1));
}

export function warContribution(war: FactionState['war'], data: GameData): number {
  const w = data.world.factions.war;
  return war.conquests * w.perConquest + war.rivalConquests * w.perRivalConquest + war.raidWins * w.perRaidWin;
}

export function currentWar(state: VillageState, now: number, data: GameData): { week: number; rival: string; ours: number; theirs: number; contribution: number; endsAt: number } | null {
  const f = state.world.faction;
  if (!f.id) return null;
  const week = warWeek(now, data);
  const rival = clanDef(data, f.id).rival;
  const contribution = f.war.week === week ? warContribution(f.war, data) : 0;
  return { week, rival, ours: warAiScore(state.world.seed, week, f.id, data) + contribution, theirs: warAiScore(state.world.seed, week, rival, data), contribution, endsAt: warEndsAt(week, data) };
}

/** Close war weeks that ended. A week the player fought in becomes a claimable record. Mutates. */
export function settleFactionWars(state: VillageState, now: number, data: GameData): void {
  const f = state.world.faction;
  const week = warWeek(now, data);
  if (!f.id || f.war.week === week) return;
  if (f.war.week >= 0 && f.war.week < week) {
    const contribution = warContribution(f.war, data);
    if (contribution >= data.world.factions.war.minContribution) {
      const rival = clanDef(data, f.id).rival;
      const ours = warAiScore(state.world.seed, f.war.week, f.id, data) + contribution;
      const theirs = warAiScore(state.world.seed, f.war.week, rival, data);
      const outcome = ours > theirs ? 'win' : ours === theirs ? 'draw' : 'loss';
      const rec: FactionWarRecord = { week: f.war.week, rival, ours, theirs, outcome, claimed: false };
      f.warHistory.push(rec);
      while (f.warHistory.length > data.world.factions.war.historyWeeks) f.warHistory.shift();
      pushNews(state.world, { at: warEndsAt(f.war.week, data), kind: 'war', text: `${clanDef(data, f.id).name} ${outcome === 'win' ? 'won' : outcome === 'draw' ? 'drew' : 'lost'} the war with ${clanDef(data, rival).name}, ${ours}-${theirs}.` }, data);
    }
  }
  f.war = { week, conquests: 0, rivalConquests: 0, raidWins: 0 };
}

export function warReward(outcome: 'win' | 'draw' | 'loss', hall: number, data: GameData): { grants: Cost; reputation: number } {
  const { reputation, ...rest } = data.world.factions.war.rewards[outcome];
  return { grants: scaleReward(rest, hall, data), reputation };
}
