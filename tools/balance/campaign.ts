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
  /**
   * P2-04 (DEF-03): the model player cannot design a base, so this campaign's village is raided on a generated
   * layout for its Keep (`raids.labAutoLayout` and `labWalls`, set on a data clone for this campaign only; live data
   * never sets them, `tests/gameplay/balance/campaign-gates.test.ts` checks).
   */
  labLayout?: boolean;
}

/** The data a campaign plays: the live data, or for `labLayout` a clone with the lab's layout flags. */
export function campaignData(spec: CampaignSpec, data: GameData = defaultData): GameData {
  if (!spec.labLayout) return data;
  return { ...data, raids: { ...data.raids, labAutoLayout: true, labWalls: true } };
}

/** The campaigns `npm run balance:campaign` plays (and the gates read). */
export const CAMPAIGNS: CampaignSpec[] = [
  { id: 'regular', name: "Regular (4 sessions a day, raid bots' army mix)", opts: { raidsPerSession: 2 }, casual: false, maxDays: 220 },
  { id: 'regular_defender', name: 'Regular defender (4 sessions a day, builds the five counters, defenses before collectors)', opts: { raidsPerSession: 2, policy: 'defender' }, casual: false, maxDays: 220 },
  { id: 'casual', name: "Casual (one visit a day, suggested army: the raid bots' roles, Trials and tasks)", opts: { raidsPerSession: 2, engaged: true }, casual: true, maxDays: 400 },
  // Balance audit 2026-11-08 Change-12 (PS-1): the dominance margins are tracked by playing the rival policies.
  { id: 'regular_rusher', name: 'Regular rusher (4 sessions a day, never builds defenses or traps)', opts: { raidsPerSession: 2, policy: 'rusher' }, casual: false, maxDays: 220 },
  { id: 'regular_sandbagger', name: 'Regular sandbagger (4 sessions a day, research held at Keep - 1.4 to meet weaker bases)', opts: { raidsPerSession: 2, policy: 'sandbagger' }, casual: false, maxDays: 220 },
  { id: 'casual_explorer', name: 'Casual (one visit a day, explorer: newest warrior of each family, Trials and tasks)', opts: { raidsPerSession: 2, policy: 'explorer', engaged: true }, casual: true, maxDays: 400 },
  // P2-04 (DEF-03): the campaign that sees defense: the fortress policy (keeps its counters within two levels of
  // the Keep's caps before raising the Keep) on a real, walled layout.
  // P3-02 (PAC-02, PAC-08): the player the game allows, reported beside the conservative gated baseline: the casual
  // player who hires the third artisan with the starting Jade, and one who also queues the next army.
  { id: 'casual_hires', name: 'Casual who hires the third artisan with the starting Jade (one visit a day, suggested army, Trials and tasks)', opts: { raidsPerSession: 2, engaged: true, hireBuilders: true }, casual: true, maxDays: 400 },
  { id: 'casual_queues', name: 'Casual who hires the third artisan and queues the next army (one visit a day, suggested army, Trials and tasks)', opts: { raidsPerSession: 2, engaged: true, hireBuilders: true, queueArmy: true }, casual: true, maxDays: 400 },
  { id: 'regular_fortress', name: 'Regular fortress (4 sessions a day, counters within 2 levels of the caps before the Keep, walled generated layout)', opts: { raidsPerSession: 2, policy: 'fortress', fortressGap: 2 }, casual: false, maxDays: 220, labLayout: true },
];

/**
 * Beast Mode 2026-11-21 GT-11: every campaign is played this many times with differently seeded villages (`rep`), and
 * the gates read the pooled rows and the spread between runs. One seed swung a Keep's stars by 0.1-0.6 and the
 * Keep 15 day by ±3, inside the gates' margins. 4 for CI-sized runs; `CAMPAIGN_REPS=8` for a release run.
 */
export const CAMPAIGN_REPS = 4;

/** Mean and 95% confidence interval (Student t) of a few runs' values. */
export function meanCi(xs: number[]): { mean: number; lo: number; hi: number; sd: number; n: number } {
  const n = xs.length;
  const mean = n ? xs.reduce((a, x) => a + x, 0) / n : 0;
  const sd = n > 1 ? Math.sqrt(xs.reduce((a, x) => a + (x - mean) ** 2, 0) / (n - 1)) : 0;
  const t = [0, 12.71, 4.30, 3.18, 2.78, 2.57, 2.45, 2.36, 2.31, 2.26, 2.23][n - 1] ?? 2.0;
  const half = n > 1 ? (t * sd) / Math.sqrt(n) : 0;
  const r = (x: number) => +x.toFixed(3);
  return { mean: r(mean), lo: r(mean - half), hi: r(mean + half), sd: r(sd), n };
}

export interface KeepRow {
  keep: number;
  raids: number;
  stars: number;
  threeStar: number;
  /** Share of raids won (one star or more). */
  won: number;
  destruction: number;
  /** Coins + Provisions banked per raid. */
  loot: number;
  opponentKeep: number;
  strength: number;
  honor: number;
  /** Raids against the village at this Keep. */
  defenses: number;
  /** Share of them held (no star lost). */
  held: number;
  /** Coins + Provisions taken per raid against the village. */
  stolen: number;
  /** Average honor change per raid against the village. */
  defenseHonor: number;
  /** Pooled results only (GT-11): this Keep's average stars in each run that raided at it. */
  starsByRep?: number[];
}

export interface CampaignResult {
  id: string;
  name: string;
  /** Day each Keep level was reached. */
  reached: Record<number, number>;
  days: number;
  byKeep: KeepRow[];
  defenses: number;
  /** Over the whole campaign: Coins + Provisions banked from raids, taken by raids against the village, and paid for held raids. */
  totals: { looted: number; stolen: number; defenseRewards: number };
  /** GT-11 (ECO-03): Jade at the start, earned and spent by source over the campaign, and left at the end. */
  jade: { start: number; earned: Record<string, number>; spent: Record<string, number>; end: number };
  /** Pooled results only (GT-11): how many runs, and each Keep's day in every run with its mean and 95% interval. */
  reps?: number;
  reachedByRep?: Record<number, number[]>;
  reachedCi?: Record<number, ReturnType<typeof meanCi>>;
}

export function runCampaign(spec: CampaignSpec, live: GameData = defaultData, rep = 0): CampaignResult {
  const data = campaignData(spec, live);
  const p = new ModelPlayer(data, rep ? { ...spec.opts, rep } : spec.opts);
  const jadeStart = p.state.resources.moonstones ?? 0;
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
    jade: { start: jadeStart, earned: p.jadeEarned, spent: p.jadeSpent, end: p.state.resources.moonstones ?? 0 },
  };
}

/**
 * GT-11: several runs of one campaign as one result. Each Keep's row pools every run's raids and raids against the
 * village (weighted by count); `reached` is the mean day with each run's day and the 95% interval kept beside it;
 * totals and Jade are per-run means.
 */
export function poolCampaign(runs: CampaignResult[]): CampaignResult {
  const first = runs[0];
  const keeps = [...new Set(runs.flatMap((r) => r.byKeep.map((k) => k.keep)))].sort((a, b) => a - b);
  const byKeep: KeepRow[] = keeps.map((keep) => {
    const rows = runs.map((r) => r.byKeep.find((k) => k.keep === keep)).filter((k): k is KeepRow => Boolean(k));
    const raids = rows.reduce((a, k) => a + k.raids, 0);
    const defenses = rows.reduce((a, k) => a + k.defenses, 0);
    const byRaid = (f: (k: KeepRow) => number) => (raids ? rows.reduce((a, k) => a + f(k) * k.raids, 0) / raids : 0);
    const byDef = (f: (k: KeepRow) => number) => (defenses ? rows.reduce((a, k) => a + f(k) * k.defenses, 0) / defenses : 0);
    return {
      keep, raids, stars: byRaid((k) => k.stars), threeStar: byRaid((k) => k.threeStar), won: byRaid((k) => k.won), destruction: byRaid((k) => k.destruction), loot: byRaid((k) => k.loot),
      opponentKeep: byRaid((k) => k.opponentKeep), strength: byRaid((k) => k.strength), honor: byRaid((k) => k.honor),
      defenses, held: byDef((k) => k.held), stolen: byDef((k) => k.stolen), defenseHonor: byDef((k) => k.defenseHonor),
      starsByRep: rows.filter((k) => k.raids).map((k) => +k.stars.toFixed(3)),
    };
  });
  const reachedByRep: Record<number, number[]> = {};
  for (const r of runs) for (const [k, v] of Object.entries(r.reached)) (reachedByRep[Number(k)] ??= []).push(v);
  const reachedCi = Object.fromEntries(Object.entries(reachedByRep).map(([k, v]) => [Number(k), meanCi(v)]));
  // A Keep counts as reached only when every run reached it (a mean over fewer runs would flatter the pace).
  const reached = Object.fromEntries(Object.entries(reachedByRep).filter(([, v]) => v.length === runs.length).map(([k, v]) => [Number(k), +(v.reduce((a, x) => a + x, 0) / v.length).toFixed(1)]));
  const avg = (f: (r: CampaignResult) => number) => runs.reduce((a, r) => a + f(r), 0) / runs.length;
  const bySource = (pick: (r: CampaignResult) => Record<string, number>) => {
    const out: Record<string, number> = {};
    for (const r of runs) for (const [k, v] of Object.entries(pick(r))) out[k] = (out[k] ?? 0) + v / runs.length;
    return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, Math.round(v)]));
  };
  return {
    id: first.id, name: first.name, reached, days: Math.round(avg((r) => r.days)), byKeep, defenses: Math.round(avg((r) => r.defenses)),
    totals: { looted: avg((r) => r.totals.looted), stolen: avg((r) => r.totals.stolen), defenseRewards: avg((r) => r.totals.defenseRewards) },
    jade: { start: Math.round(avg((r) => r.jade.start)), earned: bySource((r) => r.jade.earned), spent: bySource((r) => r.jade.spent), end: Math.round(avg((r) => r.jade.end)) },
    reps: runs.length, reachedByRep, reachedCi,
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
  if (results[0]?.reps) L.push(`Each campaign is played ${results[0].reps} times with differently seeded villages (Beast Mode GT-11). Keep days are means with the 95% interval in brackets; the tables pool every run's raids; totals and Jade are per-run means.`, '');
  for (const r of results) {
    L.push(`## ${r.name}`, '');
    const ci = (k: string) => (r.reachedCi?.[Number(k)] ? ` [${r.reachedCi[Number(k)].lo.toFixed(1)}–${r.reachedCi[Number(k)].hi.toFixed(1)}]` : '');
    L.push(`Keep reached (day): ${Object.entries(r.reached).map(([k, v]) => `${k}: ${v}${ci(k)}`).join(' · ')}. Played ${r.days} days; ${r.defenses} raids against the village.`, '');
    L.push(`Totals: ${Math.round(r.totals.looted).toLocaleString('en-US')} looted, ${Math.round(r.totals.stolen).toLocaleString('en-US')} taken by raids against the village (${r.totals.looted ? Math.round((r.totals.stolen / r.totals.looted) * 100) : 0}% of the loot), ${Math.round(r.totals.defenseRewards).toLocaleString('en-US')} paid for held raids.`, '');
    L.push('| Keep | Raids | Avg stars | Won | 3★ rate | Destruction | Loot | Opponent Keep | Army strength | Honor | Raided | Held | Stolen | Honor lost |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const k of r.byKeep) {
      const attack = k.raids ? `${k.raids} | ${k.stars.toFixed(2)} | ${Math.round(k.won * 100)}% | ${Math.round(k.threeStar * 100)}% | ${k.destruction.toFixed(0)}% | ${Math.round(k.loot).toLocaleString('en-US')} | ${k.opponentKeep.toFixed(1)} | ${k.strength.toFixed(2)} | ${Math.round(k.honor)}` : '0 | – | – | – | – | – | – | – | –';
      const defense = k.defenses ? `${k.defenses} | ${Math.round(k.held * 100)}% | ${Math.round(k.stolen).toLocaleString('en-US')} | ${(-k.defenseHonor).toFixed(1)}` : '0 | – | – | –';
      L.push(`| ${k.keep} | ${attack} | ${defense} |`);
    }
    L.push('');
  }
  // GT-11 (ECO-03): where Jade comes from and goes over a campaign (per-run means).
  L.push('## Jade over a campaign (economy ECO-03)', '', 'Per-run means. Earned and spent by what moved it: the command (openDailyChest, claimTask, claimTier, trialEnd, claimCalendar, claimAchievement, …), `settle` (time passing with the game open: league and season chests, the stipend), `offline` (time away) and `raid`. The model player buys nothing with money and spends Jade only on Artisans when its policy hires them.', '');
  const sources = [...new Set(results.flatMap((r) => Object.keys(r.jade?.earned ?? {})))].sort();
  L.push(`| Campaign | Start | ${sources.map((s) => `+${s}`).join(' | ')} | Spent | End |`, `|---|---|${sources.map(() => '---|').join('')}---|---|`);
  for (const r of results) {
    if (!r.jade) continue;
    const spent = Object.entries(r.jade.spent).map(([k, v]) => `${v} (${k})`).join(', ') || '0';
    L.push(`| ${r.id} | ${r.jade.start} | ${sources.map((s) => r.jade.earned[s] ?? 0).join(' | ')} | ${spent} | ${r.jade.end} |`);
  }
  L.push('');
  // P2-04 (DEF-03): what defense buys, by policy. The fortress plays a walled generated layout (`labLayout`), the
  // others the model's own placement; all four play the same raids against generated bases.
  const pols = ['regular_rusher', 'regular', 'regular_defender', 'regular_fortress'].map((id) => results.find((r) => r.id === id)).filter((r): r is CampaignResult => Boolean(r));
  if (pols.length >= 2) {
    L.push('## Is defense worth building? (economy E26, defense DEF-03)', '');
    L.push('The regular player under four policies: the rusher never builds defenses, the regular raider builds them late, the defender builds the counters before collectors, and the fortress keeps every counter within two levels of the caps before raising the Keep, on a walled generated layout (the model player cannot design a base). Bot raids only: with a server configured, a village is not raided by bots yet (`docs/backend/REQUESTS.md`, P2-12).', '');
    L.push(`| Keep | ${pols.map((r) => `Held (${r.id.replace('regular_', '')})`).join(' | ')} | ${pols.map((r) => `Stolen per raid (${r.id.replace('regular_', '')})`).join(' | ')} |`, `|---|${pols.map(() => '---|').join('')}${pols.map(() => '---|').join('')}`);
    for (let k = 1; k <= 15; k++) {
      const cells = pols.map((r) => r.byKeep.find((x) => x.keep === k));
      if (cells.every((c) => !c?.defenses)) continue;
      L.push(`| ${k} | ${cells.map((c) => (c?.defenses ? `${Math.round(c.held * 100)}%` : '–')).join(' | ')} | ${cells.map((c) => (c?.defenses ? Math.round(c.stolen).toLocaleString('en-US') : '–')).join(' | ')} |`);
    }
    L.push('', '| Policy | Keep 12 (day) | Keep 15 (day) | Raids against the village | Held, Keeps 9-15 | Stolen ÷ looted | Paid for held raids |', '|---|---|---|---|---|---|---|');
    for (const r of pols) {
      const late = r.byKeep.filter((x) => x.keep >= 9 && x.defenses);
      const n = late.reduce((a, x) => a + x.defenses, 0);
      const held = n ? late.reduce((a, x) => a + x.held * x.defenses, 0) / n : 0;
      const ratio = r.totals.looted ? r.totals.stolen / r.totals.looted : 0;
      L.push(`| ${r.id} | ${r.reached[12] ?? '–'} | ${r.reached[15] ?? '–'} | ${r.defenses} | ${Math.round(held * 100)}% | ${ratio.toFixed(2)} | ${Math.round(r.totals.defenseRewards).toLocaleString('en-US')} |`);
    }
    L.push('');
  }
  return L.join('\n') + '\n';
}
