/**
 * Long campaigns with the model player (tools/balance/playerModel.ts): real
 * timers, earned resources, real battles and offline raids, played until Keep
 * 15 (or a day limit). Reports when each Keep was reached, how raids went at
 * each Keep, and what raids against the village took (report section 5 step 11,
 * economy E26: stolen resources and held defenses, so whether defense is worth
 * building is measured). Run: npm run balance:campaign. The results also go to
 * docs/game-theory/campaign.json with a fingerprint of everything they depend
 * on; tests/gameplay/balance/campaign-gates.test.ts holds them to lower and
 * upper bounds and fails when they are stale.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SIM_RULES } from '../../src/gameplay/sim/battle/battle';
import { defaultData } from '../../src/gameplay/sim/data';
import type { GameData } from '../../src/gameplay/sim/types';
import { activeHour, casualDays, ModelPlayer, normalDays, type ModelOptions } from './playerModel';

export interface CampaignSpec {
  id: string;
  name: string;
  opts: ModelOptions;
  casual: boolean;
  maxDays: number;
}

/** The campaigns `npm run balance:campaign` plays (and the gates read). */
export const CAMPAIGNS: CampaignSpec[] = [
  { id: 'regular', name: "Regular (4 sessions a day, raid bots' army mix)", opts: { raidsPerSession: 2 }, casual: false, maxDays: 220 },
  { id: 'regular_defender', name: 'Regular defender (4 sessions a day, builds the five counters, defenses before collectors)', opts: { raidsPerSession: 2, policy: 'defender' }, casual: false, maxDays: 220 },
  { id: 'casual', name: "Casual (one visit a day, suggested army: the raid bots' roles, Trials and tasks)", opts: { raidsPerSession: 2, engaged: true }, casual: true, maxDays: 400 },
  { id: 'casual_explorer', name: 'Casual (one visit a day, explorer: newest warrior of each family, Trials and tasks)', opts: { raidsPerSession: 2, policy: 'explorer', engaged: true }, casual: true, maxDays: 400 },
];

export interface KeepRow {
  keep: number;
  raids: number;
  stars: number;
  threeStar: number;
  /** Share of raids won (one star or more). */
  won: number;
  destruction: number;
  /** Acorns + Dew banked per raid. */
  loot: number;
  opponentKeep: number;
  strength: number;
  honor: number;
  /** Raids against the village at this Keep. */
  defenses: number;
  /** Share of them held (no star lost). */
  held: number;
  /** Acorns + Dew taken per raid against the village. */
  stolen: number;
  /** Average honor change per raid against the village. */
  defenseHonor: number;
}

export interface CampaignResult {
  id: string;
  name: string;
  /** Day each Keep level was reached. */
  reached: Record<number, number>;
  days: number;
  byKeep: KeepRow[];
  defenses: number;
  /** Over the whole campaign: Acorns + Dew banked from raids, taken by raids against the village, and paid for held raids. */
  totals: { looted: number; stolen: number; defenseRewards: number };
}

export function runCampaign(spec: CampaignSpec, data: GameData = defaultData): CampaignResult {
  const p = new ModelPlayer(data, spec.opts);
  activeHour(p, 60, 2);
  let days = 0;
  const step = spec.casual ? casualDays : normalDays;
  // Play in weeks until Keep 15 has been played for two weeks, or the limit.
  let topSince = -1;
  while (days < spec.maxDays) {
    step(p, 7);
    days += 7;
    if (p.hallReachedAt[data.hall.levels.length] !== undefined && topSince < 0) topSince = days;
    if (topSince >= 0 && days - topSince >= 14) break;
  }
  const byKeep: KeepRow[] = [];
  const mean = <T>(xs: T[], f: (x: T) => number) => (xs.length ? xs.reduce((a, x) => a + f(x), 0) / xs.length : 0);
  for (let k = 1; k <= data.hall.levels.length; k++) {
    const rs = p.raidLog.filter((r) => r.hall === k);
    const ds = p.defenseLog.filter((d) => d.hall === k);
    if (!rs.length && !ds.length) continue;
    byKeep.push({
      keep: k,
      raids: rs.length,
      stars: mean(rs, (r) => r.stars),
      threeStar: mean(rs, (r) => (r.stars === 3 ? 1 : 0)),
      won: mean(rs, (r) => (r.stars >= 1 ? 1 : 0)),
      destruction: mean(rs, (r) => r.destruction),
      loot: mean(rs, (r) => r.loot),
      opponentKeep: mean(rs, (r) => r.opponentHall),
      strength: mean(rs, (r) => r.strength ?? 0),
      honor: mean(rs, (r) => r.trophies),
      defenses: ds.length,
      held: mean(ds, (d) => (d.stars === 0 ? 1 : 0)),
      stolen: mean(ds, (d) => d.lost),
      defenseHonor: mean(ds, (d) => d.trophies),
    });
  }
  const reached = Object.fromEntries(Object.entries(p.hallReachedAt).map(([k, v]) => [Number(k), +(v / 24).toFixed(1)]));
  const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);
  return {
    id: spec.id,
    name: spec.name,
    reached,
    days,
    byKeep,
    defenses: p.defenseLog.length,
    totals: { looted: sum(p.raidLog, (r) => Math.max(0, r.loot)), stolen: sum(p.defenseLog, (d) => d.lost), defenseRewards: sum(p.defenseLog, (d) => d.reward) },
  };
}

/** Keys that are only text: changing them never changes a campaign. */
const TEXT_KEYS = new Set(['name', 'names', 'description', 'desc', 'flavor', 'hint', 'label', 'title', 'tagline', 'lore', 'tip', 'tips', 'summary']);
/** The data a campaign plays through (the store, offers, cosmetics, achievements, social and notifications are not played). */
const PLAYED: (keyof GameData)[] = ['buildings', 'hall', 'economy', 'troops', 'battle', 'ranks', 'raids', 'pass', 'daily', 'events', 'trials'];
/** Code the campaigns depend on beyond the battle rules (`SIM_RULES`). */
const SOURCES = ['tools/balance/playerModel.ts', 'src/gameplay/sim/matchmaking.ts', 'src/gameplay/sim/battle/basegen.ts', 'src/gameplay/sim/defense.ts', 'src/gameplay/sim/offline.ts'];

function stripText(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripText);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort()) if (!TEXT_KEYS.has(k)) out[k] = stripText((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
}

/**
 * Everything the campaign results depend on: the played data (text removed), the battle
 * rules, the model player, matchmaking, base generation and offline raids, and the campaign
 * list. Line endings are normalised so Windows checkouts agree.
 */
export function campaignFingerprint(data: GameData = defaultData, root = process.cwd()): string {
  const h = createHash('sha256');
  h.update(JSON.stringify(stripText(Object.fromEntries(PLAYED.map((k) => [k, data[k]])))));
  h.update(`rules ${SIM_RULES}`);
  for (const f of SOURCES) h.update(readFileSync(join(root, f), 'utf8').replace(/\r\n/g, '\n'));
  h.update(JSON.stringify(CAMPAIGNS));
  return h.digest('hex').slice(0, 16);
}

export function campaignMarkdown(results: CampaignResult[]): string {
  const L: string[] = ['# Campaigns (generated)', '', 'Generated by `npm run balance:campaign` (`tools/balance/campaign.ts`). Do not edit by hand. The same numbers are in `campaign.json`, which `tests/gameplay/balance/campaign-gates.test.ts` holds to lower and upper bounds (and fails when they are stale).', ''];
  L.push("The model player (`tools/balance/playerModel.ts`) plays real timers, earned resources, real battles and offline raids with the simple bot attack plan (a human usually does better). Opponents are matched by honor, but never below the attacker's earned strength minus the Keep's `powerSlackByKeep` (else `powerSlack`). Army strength is the Keep the army's research matches (`attackerStrength`: a Keep 12 army two levels behind its caps reads about 10.5); Honor is the average honor while raiding at that Keep. Loot is Acorns + Dew banked per raid.", '');
  L.push('Defense columns: raids against the village at that Keep (real offline bot raids against the real layout), the share held (no star lost), Acorns + Dew taken per raid, and the honor change per raid.', '');
  for (const r of results) {
    L.push(`## ${r.name}`, '');
    L.push(`Keep reached (day): ${Object.entries(r.reached).map(([k, v]) => `${k}: ${v}`).join(' · ')}. Played ${r.days} days; ${r.defenses} raids against the village.`, '');
    L.push(`Totals: ${Math.round(r.totals.looted).toLocaleString('en-US')} looted, ${Math.round(r.totals.stolen).toLocaleString('en-US')} taken by raids against the village (${r.totals.looted ? Math.round((r.totals.stolen / r.totals.looted) * 100) : 0}% of the loot), ${Math.round(r.totals.defenseRewards).toLocaleString('en-US')} paid for held raids.`, '');
    L.push('| Keep | Raids | Avg stars | Won | 3★ rate | Destruction | Loot | Opponent Keep | Army strength | Honor | Raided | Held | Stolen | Honor lost |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const k of r.byKeep) {
      const attack = k.raids ? `${k.raids} | ${k.stars.toFixed(2)} | ${Math.round(k.won * 100)}% | ${Math.round(k.threeStar * 100)}% | ${k.destruction.toFixed(0)}% | ${Math.round(k.loot).toLocaleString('en-US')} | ${k.opponentKeep.toFixed(1)} | ${k.strength.toFixed(2)} | ${Math.round(k.honor)}` : '0 | – | – | – | – | – | – | – | –';
      const defense = k.defenses ? `${k.defenses} | ${Math.round(k.held * 100)}% | ${Math.round(k.stolen).toLocaleString('en-US')} | ${(-k.defenseHonor).toFixed(1)}` : '0 | – | – | –';
      L.push(`| ${k.keep} | ${attack} | ${defense} |`);
    }
    L.push('');
  }
  const reg = results.find((r) => r.id === 'regular');
  const def = results.find((r) => r.id === 'regular_defender');
  if (reg && def) {
    L.push('## Is defense worth building? (economy E26)', '');
    L.push('The same regular player with and without the defender policy, at the Keeps both played.', '');
    L.push('| Keep | Stolen per raid (raider) | Stolen per raid (defender) | Held (raider) | Held (defender) |', '|---|---|---|---|---|');
    for (const a of reg.byKeep) {
      const b = def.byKeep.find((x) => x.keep === a.keep);
      if (!b || !a.defenses || !b.defenses) continue;
      L.push(`| ${a.keep} | ${Math.round(a.stolen).toLocaleString('en-US')} | ${Math.round(b.stolen).toLocaleString('en-US')} | ${Math.round(a.held * 100)}% | ${Math.round(b.held * 100)}% |`);
    }
    L.push('', `Keep 15 reached on day ${reg.reached[15] ?? '–'} (raider) and ${def.reached[15] ?? '–'} (defender).`, '');
  }
  return L.join('\n') + '\n';
}
