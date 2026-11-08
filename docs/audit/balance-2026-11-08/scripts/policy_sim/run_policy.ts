/**
 * node scratch/run.mjs scratch/policy_sim/run_policy.ts <policy> <regular|casual> [maxDays] [stopKeep] [raidsPerSession]
 * Plays one policy with the scratch model player and writes
 * scratch/policy_sim/<policy>_<cadence>.out (tables) and .json (raw rows) every 10 days and at the end.
 */
import { writeFileSync } from 'node:fs';
import { defaultData } from '../../src/gameplay/sim/data';
import { activeHour, casualDays, ModelPlayer, normalDays, type ModelOptions, type Policy } from './playerModel';

export default function main(policyArg = 'raider', cadence = 'regular', maxDaysArg = '120', stopKeepArg = '12', rpsArg = '', watchArg = '') {
  const policy = policyArg as Policy;
  const maxDays = Number(maxDaysArg);
  const stopKeep = Number(stopKeepArg);
  const raidsPerSession = rpsArg ? Number(rpsArg) : policy === 'raid_max' ? 6 : 2;
  const opts: ModelOptions = { raidsPerSession, policy, watch: watchArg === 'watch' };
  const data = defaultData;
  const p = new ModelPlayer(data, opts);
  const t0 = Date.now();
  const tag = watchArg === 'watch' ? '_watch' : '';
  const out = `scratch/policy_sim/${policy}_${cadence}${tag}.out`;
  const json = `scratch/policy_sim/${policy}_${cadence}${tag}.json`;
  activeHour(p, 60, 2);
  let days = 0;
  let stopped = '';
  const step = cadence === 'casual' ? casualDays : normalDays;
  const render = (final: boolean) => {
    const L: string[] = [];
    const reached = Object.fromEntries(Object.entries(p.hallReachedAt).map(([k, v]) => [Number(k), +(v / 24).toFixed(1)]));
    L.push(`# policy ${policy} cadence ${cadence} raidsPerSession ${raidsPerSession} ${final ? 'FINAL' : 'partial'} days ${days} (${((Date.now() - t0) / 1000).toFixed(0)} s) ${stopped}`);
    L.push(`Keep reached (day): ${Object.entries(reached).map(([k, v]) => `${k}: ${v}`).join(' · ')}`);
    const mean = <T>(xs: T[], f: (x: T) => number) => (xs.length ? xs.reduce((a, x) => a + f(x), 0) / xs.length : 0);
    const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);
    L.push(`Watch index mean ${p.watchIndex.length ? (p.watchIndex.reduce((a, b) => a + b, 0) / p.watchIndex.length).toFixed(2) : '-'}`);
    L.push(`Totals: raids ${p.raidLog.length}, looted ${Math.round(sum(p.raidLog, (r) => Math.max(0, r.loot)))}, raided ${p.defenseLog.length}x, stolen ${Math.round(sum(p.defenseLog, (d) => d.lost))}, held ${p.defenseLog.filter((d) => d.stars === 0).length}, defence rewards ${Math.round(sum(p.defenseLog, (d) => d.reward))}, Next presses ${p.nextPresses}`);
    L.push(`Sessions ${p.sessionsTotal}: full storage (either) ${(100 * p.fullStorageSessions / Math.max(1, p.sessionsTotal)).toFixed(0)}%, Coins full ${(100 * p.fullAcornSessions / Math.max(1, p.sessionsTotal)).toFixed(0)}%, Provisions full ${(100 * p.fullDewSessions / Math.max(1, p.sessionsTotal)).toFixed(0)}%`);
    L.push(`Research started ${p.researchStarted}, skipped (sandbag) ${p.researchSkipped}; walls placed ${p.wallsPlaced}, wall upgrades ${p.wallUpgrades}, Coins on walls ${p.wallCoins}; final honor ${p.state.trophies}; final strength ${p.dayLog.length ? p.dayLog[p.dayLog.length - 1].strength.toFixed(2) : '-'}`);
    L.push('');
    L.push('| Keep | days at Keep | Raids | Avg stars | Won | 3-star | Destr | Loot/raid | Opp Keep | Opp bias | Strength | Honor | Raided | Held | Stolen/raid | Honor lost/raid |');
    L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    const rows: Record<string, unknown>[] = [];
    for (let k = 1; k <= data.hall.levels.length; k++) {
      const rs = p.raidLog.filter((r) => r.hall === k);
      const ds = p.defenseLog.filter((d) => d.hall === k);
      if (reached[k] === undefined) continue;
      const from = reached[k];
      const to = reached[k + 1] ?? days;
      const row = {
        keep: k, daysAt: +(to - from).toFixed(1), raids: rs.length, stars: mean(rs, (r) => r.stars), threeStar: mean(rs, (r) => (r.stars === 3 ? 1 : 0)), won: mean(rs, (r) => (r.stars >= 1 ? 1 : 0)), destruction: mean(rs, (r) => r.destruction), loot: mean(rs, (r) => r.loot), opponentKeep: mean(rs, (r) => r.opponentHall), opponentBias: mean(rs, (r) => r.opponentBias), strength: mean(rs, (r) => r.strength ?? 0), honor: mean(rs, (r) => r.trophies), defenses: ds.length, held: mean(ds, (d) => (d.stars === 0 ? 1 : 0)), stolen: mean(ds, (d) => d.lost), defenseHonor: mean(ds, (d) => d.trophies),
      };
      rows.push(row);
      const a = rs.length ? `${rs.length} | ${row.stars.toFixed(2)} | ${Math.round(row.won * 100)}% | ${Math.round(row.threeStar * 100)}% | ${row.destruction.toFixed(0)}% | ${Math.round(row.loot)} | ${row.opponentKeep.toFixed(2)} | ${row.opponentBias.toFixed(2)} | ${row.strength.toFixed(2)} | ${Math.round(row.honor)}` : '0 | - | - | - | - | - | - | - | - | -';
      const b = ds.length ? `${ds.length} | ${Math.round(row.held * 100)}% | ${Math.round(row.stolen)} | ${(-row.defenseHonor).toFixed(1)}` : '0 | - | - | -';
      L.push(`| ${k} | ${row.daysAt} | ${a} | ${b} |`);
    }
    L.push('');
    L.push('day | keep | honor | strength | coins/cap | prov/cap | housing | walls@lvl | defences');
    for (const d of p.dayLog) if (d.day % 5 === 0 || d.day === days) L.push(`${d.day} | ${d.keep} | ${d.honor} | ${d.strength.toFixed(2)} | ${Math.round(d.acorns)}/${d.capAcorns} | ${Math.round(d.dew)}/${d.capDew} | ${d.housing} | ${d.walls}@${d.wallLevel.toFixed(1)} | ${d.defenceLevels}`);
    writeFileSync(out, L.join('\n') + '\n');
    writeFileSync(json, JSON.stringify({ policy, cadence, raidsPerSession, days, final, stopped, reached, rows, totals: { raids: p.raidLog.length, looted: sum(p.raidLog, (r) => Math.max(0, r.loot)), raided: p.defenseLog.length, stolen: sum(p.defenseLog, (d) => d.lost), held: p.defenseLog.filter((d) => d.stars === 0).length, rewards: sum(p.defenseLog, (d) => d.reward), nextPresses: p.nextPresses, sessions: p.sessionsTotal, fullStorage: p.fullStorageSessions, fullAcorns: p.fullAcornSessions, fullDew: p.fullDewSessions, researchStarted: p.researchStarted, researchSkipped: p.researchSkipped, wallsPlaced: p.wallsPlaced, wallUpgrades: p.wallUpgrades, wallCoins: p.wallCoins, finalHonor: p.state.trophies }, dayLog: p.dayLog, raidLog: p.raidLog, defenseLog: p.defenseLog }));
    return L.join('\n');
  };
  while (days < maxDays) {
    step(p, 1, () => {
      days++;
      p.logDay(days);
    });
    if (p.hallReachedAt[stopKeep] !== undefined) {
      stopped = `stopped: Keep ${stopKeep} reached`;
      break;
    }
    if (days % 10 === 0) render(false);
  }
  if (!stopped) stopped = `stopped: ${maxDays} days`;
  console.log(render(true));
}
