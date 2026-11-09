/**
 * Player-versus-player population: 12 model players with different policies and cadences raid EACH OTHER's real
 * villages (villageToBase) instead of generated bases, for 45 days. Targets: a greedy attacker picks the richest
 * unshielded village within the Keep window. Losses go through the real `applyDefense` command. Bot raids still hit
 * everyone while offline. Measures who feeds whom, inequality, and whether defence matters when the raiders are people.
 * node scratch/run.mjs scratch/design/pvp_pop.ts [days]
 */
import { ModelPlayer, normalDays, casualDays, activeHour, type Policy } from '../policy_sim/playerModel';
import { defaultData as data } from '../../src/gameplay/sim/data';
import { villageToBase, shieldHoursFor } from '../../src/gameplay/sim/defense';
import { createBattle, runBattle, SIM_RULES } from '../../src/gameplay/sim/battle/battle';
import { totalLoot } from '../../src/gameplay/sim/battle/basegen';
import { botDeployments } from '../../src/gameplay/sim/defense';
import { heroFor } from '../../src/gameplay/sim/heroes';
import { lootPenalty, hallWindow } from '../../src/gameplay/sim/matchmaking';
import { troopLevels } from '../../src/gameplay/sim/research';
import { createRng } from '../../src/gameplay/sim/rng';
import { winTrophies, lossTrophies } from '../../src/gameplay/sim/ranks';
import { applyCommand, battleArmy, hallLevel } from '../../src/gameplay/sim/village';
import { armyHousing, housingCapacity } from '../../src/gameplay/sim/army';
import { capacity } from '../../src/gameplay/sim/resources';
import { writeFileSync } from 'node:fs';

interface P { name: string; policy: Policy; cadence: 'regular' | 'casual'; raidsPerDay: number; p: ModelPlayer; taken: number; lost: number; raidsMade: number; raidsTaken: number; held: number; noTarget: number; stars: number }
const ROSTER: [Policy, 'regular' | 'casual', number][] = [
  ['raider', 'regular', 3], ['raider', 'regular', 3], ['raider', 'regular', 3],
  ['rusher', 'regular', 3], ['rusher', 'regular', 3],
  ['turtle', 'regular', 3], ['turtle', 'regular', 3],
  ['defender', 'regular', 3], ['defender', 'regular', 3],
  ['raider', 'casual', 1], ['raider', 'casual', 1], ['turtle', 'casual', 1],
];
const label = (x: P) => `${x.policy}/${x.cadence}`;

export default function main(daysArg = '45') {
  const DAYS = Number(daysArg);
  const players: P[] = ROSTER.map(([policy, cadence, rpd], i) => ({ name: `${policy}-${cadence}-${i}`, policy, cadence, raidsPerDay: rpd, p: new ModelPlayer(data, { raidsPerSession: 0, policy }), taken: 0, lost: 0, raidsMade: 0, raidsTaken: 0, held: 0, noTarget: 0, stars: 0 }));
  for (const x of players) activeHour(x.p, 60, 2);
  const flow: Record<string, Record<string, number>> = {};
  const addFlow = (a: string, b: string, v: number) => { flow[a] ??= {}; flow[a][b] = (flow[a][b] ?? 0) + v; };
  const L: string[] = [];
  const log = (s: string) => { L.push(s); console.log(s); };
  let rid = 1;
  for (let day = 1; day <= DAYS; day++) {
    for (const x of players) (x.cadence === 'regular' ? normalDays : casualDays)(x.p, 1);
    // PvP raids at the end of the day
    for (const att of players) {
      for (let r = 0; r < att.raidsPerDay; r++) {
        const s = att.p.state, now = att.p.clock.now();
        const army = battleArmy(s);
        if (armyHousing(army, data) < 0.5 * housingCapacity(s, data)) break;
        const myKeep = hallLevel(s, data);
        const win = hallWindow(myKeep, data);
        const cands = players.filter((t) => t !== att && hallLevel(t.p.state, data) >= win.min && hallLevel(t.p.state, data) <= win.max && t.p.state.shieldUntil <= now);
        if (!cands.length) { att.noTarget++; break; }
        const scored = cands.map((t) => { const b = villageToBase(t.p.state, now, data, t.name, lootPenalty(myKeep, hallLevel(t.p.state, data), data)); const tl = totalLoot(b); return { t, b, loot: (tl.acorns ?? 0) + (tl.dew ?? 0) }; }).sort((a, b) => b.loot - a.loot);
        const { t: def, b: base } = scored[0];
        const levels = troopLevels(s, data);
        const hero = heroFor(s, data);
        const setup = { seed: 7000 + rid, base, army, levels, infiltration: true, ...(hero ? { hero } : {}) };
        const probe = createBattle(setup, data);
        const deployments = botDeployments(probe.deployable, probe.grid.size, army, createRng(rid), data, levels, probe.entry);
        const before = s.resources.acorns + s.resources.dew;
        const res = applyCommand(s, { type: 'battleEnd', record: { at: now, opponentName: def.name, setup, deployments } } as any, now, data);
        if (!res.ok) throw new Error(res.message);
        att.p.state = res.state;
        const rec = att.p.state.battleLog[att.p.state.battleLog.length - 1];
        const gained = att.p.state.resources.acorns + att.p.state.resources.dew - before;
        att.taken += gained; att.raidsMade++; att.stars += rec.result.stars;
        att.p.state.battleLog = [];
        // defender side through the real command
        const lost = rec.result.loot;
        const won = rec.result.stars >= 1;
        const dTroph = won ? Math.max(0, def.p.state.trophies - winTrophies(s.trophies, def.p.state.trophies, data)) : def.p.state.trophies + lossTrophies(s.trophies, def.p.state.trophies, data);
        const shieldH = shieldHoursFor(rec.result.destruction, data);
        const drec = { id: `pvp${rid}`, at: now, kind: 'defense', opponentName: att.name, setup, deployments, result: rec.result, trophies: dTroph - def.p.state.trophies, rules: SIM_RULES } as any;
        const dres = applyCommand(def.p.state, { type: 'applyDefense', record: drec, lost, trophies: dTroph, shieldUntil: shieldH > 0 ? now + shieldH * 3_600_000 : 0 } as any, now, data);
        if (!dres.ok) throw new Error(dres.message);
        def.p.state = dres.state;
        def.lost += (lost.acorns ?? 0) + (lost.dew ?? 0); def.raidsTaken++; if (!won) def.held++;
        addFlow(label(att), label(def), gained);
        rid++;
      }
    }
    if (day % 15 === 0 || day === DAYS) {
      log(`\n== day ${day}`);
      log('player | Keep | honor | coins/cap | prov/cap | raids made | stars/raid | taken | raided | held | lost | net | no-target days');
      for (const x of players) { const s = x.p.state; const cap = capacity(s, data); log(`${x.name.padEnd(18)} | ${hallLevel(s, data)} | ${s.trophies} | ${(100 * s.resources.acorns / cap.acorns).toFixed(0)}% | ${(100 * s.resources.dew / cap.dew).toFixed(0)}% | ${x.raidsMade} | ${x.raidsMade ? (x.stars / x.raidsMade).toFixed(2) : '-'} | ${Math.round(x.taken / 1000)}k | ${x.raidsTaken} | ${x.raidsTaken ? Math.round(100 * x.held / x.raidsTaken) + '%' : '-'} | ${Math.round(x.lost / 1000)}k | ${Math.round((x.taken - x.lost) / 1000)}k | ${x.noTarget}`); }
    }
  }
  log('\n== loot flow between policy groups (rows take from columns), thousands');
  const groups = [...new Set(players.map(label))];
  log(['from \\ to'.padEnd(16), ...groups.map((g) => g.padStart(16))].join(' '));
  for (const g of groups) log([g.padEnd(16), ...groups.map((h) => String(Math.round((flow[g]?.[h] ?? 0) / 1000)).padStart(16))].join(' '));
  log('\n== by policy group: mean Keep, honor, taken, lost, net, held% (PvP only; bot raids excluded from lost)');
  for (const g of groups) {
    const xs = players.filter((x) => label(x) === g);
    const m = (f: (x: P) => number) => xs.reduce((a, x) => a + f(x), 0) / xs.length;
    log(`${g.padEnd(16)} Keep ${m((x) => hallLevel(x.p.state, data)).toFixed(1)} honor ${m((x) => x.p.state.trophies).toFixed(0)} taken ${Math.round(m((x) => x.taken) / 1000)}k lost ${Math.round(m((x) => x.lost) / 1000)}k net ${Math.round(m((x) => x.taken - x.lost) / 1000)}k raided ${m((x) => x.raidsTaken).toFixed(1)}x held ${(100 * m((x) => x.held) / Math.max(1, m((x) => x.raidsTaken))).toFixed(0)}%`);
  }
  // inequality
  const wealth = players.map((x) => x.p.state.resources.acorns + x.p.state.resources.dew).sort((a, b) => a - b);
  const n = wealth.length, sum = wealth.reduce((a, b) => a + b, 0);
  let g = 0; wealth.forEach((w, i) => { g += (2 * (i + 1) - n - 1) * w; });
  log(`\nGini of stored wealth on day ${DAYS}: ${(g / (n * sum)).toFixed(2)}; Keeps: ${players.map((x) => hallLevel(x.p.state, data)).join(',')}`);
  writeFileSync('scratch/design/pvp_pop.out', L.join('\n') + '\n');
}
