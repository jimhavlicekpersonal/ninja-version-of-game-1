/**
 * CU bot-raid tax: measured destruction of bot raids (model player), then a Monte Carlo of raids per day
 * for players online X hours a day, with the real raidTimes() slots, shields and the "attacking drops the
 * shield" rule (village.ts battleEnd), and the EV of the held-defence reward and the rematch.
 * Run: node scratch/run.mjs scratch/currencies/raidtax.ts [days=30]
 */
import { defaultData as data } from '../../src/gameplay/sim/data';
import { raidTimes, shieldHoursFor } from '../../src/gameplay/sim/defense';
import { botArmy } from '../../src/gameplay/sim/matchmaking';
import { troopLevelCapAt } from '../../src/gameplay/sim/research';
import { ModelPlayer, activeHour, normalDays, casualDays } from '../../tools/balance/playerModel';
import campaign from '../../docs/game-theory/campaign.json';

const DAY = 86_400_000, HOUR = 3_600_000;
const fmt = (n: number) => n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(Math.round(n));

function measure(kind: 'regular' | 'casual', days: number) {
  const p = new ModelPlayer(data, { raidsPerSession: 2, engaged: kind === 'casual' });
  activeHour(p, 60, 2);
  if (kind === 'regular') normalDays(p, days); else casualDays(p, days);
  const d = p.defenseLog;
  const n = d.length;
  const ge = (x: number) => d.filter((r) => r.destruction >= x).length / Math.max(1, n);
  const held = d.filter((r) => r.stars === 0).length / Math.max(1, n);
  const meanShield = d.reduce((a, r) => a + shieldHoursFor(r.destruction, data), 0) / Math.max(1, n);
  const byKeep: Record<number, { n: number; lost: number; dest: number }> = {};
  for (const r of d) { const k = byKeep[r.hall] ?? (byKeep[r.hall] = { n: 0, lost: 0, dest: 0 }); k.n++; k.lost += r.lost; k.dest += r.destruction; }
  console.log(`${kind}: ${days} days, ${n} raids against the village (${(n / days).toFixed(2)}/day), destruction >=30%: ${(ge(30) * 100).toFixed(0)}%, >=60%: ${(ge(60) * 100).toFixed(0)}%, >=90%: ${(ge(90) * 100).toFixed(0)}%, held (0 stars): ${(held * 100).toFixed(0)}%, mean shield per raid ${meanShield.toFixed(1)} h, final Keep ${Math.max(...Object.keys(p.hallReachedAt).map(Number))}`);
  for (const [k, v] of Object.entries(byKeep)) console.log(`   Keep ${k}: ${v.n} raids, mean destruction ${(v.dest / v.n).toFixed(0)}%, mean stolen ${fmt(v.lost / v.n)}`);
  return d.map((r) => r.destruction);
}

/** Monte Carlo: raids per day for a session schedule, using the real slot RNG (raidTimes) and shields. */
function mc(destrs: number[], sessions: [number, number][], dropShield: boolean, days = 365, seeds = 12): { raidsPerDay: number; shieldShare: number } {
  let total = 0, shieldedSlots = 0, slots = 0;
  for (let s = 0; s < seeds; s++) {
    const seed = (0x9e3779b9 * (s + 1)) >>> 0;
    const t0 = Date.UTC(2026, 0, 5);
    let shieldUntil = 0;
    let di = s * 7919;
    const pick = () => destrs[(di++ * 31) % destrs.length];
    for (let d = 0; d < days; d++) {
      const dayStart = t0 + d * DAY;
      // Offline windows between sessions (sessions sorted by start hour); the night belongs to the next day.
      const wins: [number, number][] = [];
      let cursor = dayStart;
      for (const [h, len] of sessions) {
        const st = dayStart + h * HOUR, en = st + len * HOUR;
        if (st > cursor) wins.push([cursor, st]);
        cursor = en;
      }
      wins.push([cursor, dayStart + DAY]);
      let si = 0;
      for (const [from, to] of wins) {
        // Session start: the player raids, which ends the shield (battleEnd).
        if (dropShield && si > 0) shieldUntil = Math.min(shieldUntil, from);
        si++;
        const grace = from + data.raids.graceMinutes * 60_000;
        for (const t of raidTimes(seed, grace, to, data)) {
          slots++;
          if (shieldUntil > t) { shieldedSlots++; continue; }
          total++;
          const sh = shieldHoursFor(pick(), data);
          if (sh > 0) shieldUntil = Math.max(shieldUntil, t + sh * HOUR);
        }
      }
    }
  }
  return { raidsPerDay: total / (days * seeds), shieldShare: shieldedSlots / Math.max(1, slots) };
}

export default function main(daysArg = '30') {
  const days = Number(daysArg);
  console.log('== A. measured bot raids against the model player (tools/balance/playerModel.ts, real offline raids)');
  const t0 = Date.now();
  const dReg = measure('regular', days);
  const dCas = measure('casual', days);
  console.log(`(${((Date.now() - t0) / 1000).toFixed(0)} s)`);

  console.log('\n== B. Monte Carlo raids per day (raidTimes slots 60 min x 12%, shields 12/14/16 h at 30/60/90%, grace 2 min); no-shield ceiling = 2.88 x offline share');
  const schedules: Record<string, [number, number][]> = {
    '0.5 h: one 30-min visit (18:00)': [[18, 0.5]],
    '1 h: two 30-min visits (8:00, 20:00)': [[8, 0.5], [20, 0.5]],
    '3 h: four 45-min sessions (8, 12:30, 18, 22)': [[8, 0.75], [12.5, 0.75], [18, 0.75], [22, 0.75]],
    '3 h: one 3-h evening (19-22)': [[19, 3]],
    '8 h: four 2-h sessions': [[8, 2], [12, 2], [17, 2], [21, 2]],
  };
  console.log('schedule | destr. sample | raids/day, attack drops shield (current code) | raids/day if attacks kept the shield | no-shield ceiling | share of raid slots blocked by shield (current)');
  for (const [name, sess] of Object.entries(schedules)) {
    const online = sess.reduce((a, [, l]) => a + l, 0);
    for (const [label, sample] of [['regular', dReg], ['casual', dCas]] as const) {
      const a = mc(sample, sess, true), b = mc(sample, sess, false);
      console.log(`${name} | ${label} | ${a.raidsPerDay.toFixed(2)} | ${b.raidsPerDay.toFixed(2)} | ${(2.88 * (1 - online / 24)).toFixed(2)} | ${(a.shieldShare * 100).toFixed(0)}%`);
    }
  }

  console.log('\n== C. the tax per Keep from the campaign (stolen per raid x raids against per day) against production and loot');
  const res = (campaign as any).results;
  const H = data.hall.levels; const B = data.buildings as any;
  const inc = (k: number) => H[k - 1].limits.acorn_orchard.count * B.acorn_orchard.levels[H[k - 1].limits.acorn_orchard.maxLevel - 1].ratePerHour * 2; // both currencies
  console.log('K | regular: raided/day | stolen/raid | stolen/day | % of 22 h production | % of loot | casual: raided/day | stolen/raid | stolen/day | % of 8 h production | % of loot | stolen per raid as % of generated avg loot (reg/cas)');
  for (let k = 3; k <= 15; k++) {
    const row = (id: string) => { const r = res.find((x: any) => x.id === id); const b = r.byKeep.find((x: any) => x.keep === k); if (!b) return null; const d = Math.max(0.1, (r.reached[String(k + 1)] ?? r.days) - r.reached[String(k)]); return { rpd: b.defenses / d, spr: b.stolen, spd: b.defenses * b.stolen / d, lpd: b.raids * b.loot / d }; };
    const g = data.battle.generatedLootByHall[k - 1]; const genAvg = (g.min + g.max);
    const r = row('regular'), c = row('casual');
    console.log(`${k} | ${r ? r.rpd.toFixed(2) : '-'} | ${r ? fmt(r.spr) : '-'} | ${r ? fmt(r.spd) : '-'} | ${r ? (r.spd / (inc(k) * 22) * 100).toFixed(0) : '-'}% | ${r ? (r.spd / r.lpd * 100).toFixed(0) : '-'}% | ${c ? c.rpd.toFixed(2) : '-'} | ${c ? fmt(c.spr) : '-'} | ${c ? fmt(c.spd) : '-'} | ${c ? (c.spd / (inc(k) * 8) * 100).toFixed(0) : '-'}% | ${c ? (c.spd / c.lpd * 100).toFixed(0) : '-'}% | ${r ? (r.spr / genAvg * 100).toFixed(0) : '-'}%/${c ? (c.spr / genAvg * 100).toFixed(0) : '-'}%`);
  }

  console.log('\n== D. held-defence reward (5% of min loot, both currencies) and the rematch (15% x stars/3 of min loot, both; costs the army)');
  console.log('K | held reward per held raid | P(held) campaign reg/cas | EV/day reg | rematch reward 3 stars | at campaign avg stars | army Prov cost (bot mix at cap) | net at 3 stars | net at avg stars | rematch EV/day (reg, every raid answered)');
  for (let k = 3; k <= 15; k++) {
    const g = data.battle.generatedLootByHall[k - 1];
    const held = Math.floor(g.min * data.raids.defenseWin!.shareOfRaidLoot) * 2;
    const reg = res.find((x: any) => x.id === 'regular'); const cas = res.find((x: any) => x.id === 'casual');
    const br = reg.byKeep.find((x: any) => x.keep === k), bc = cas.byKeep.find((x: any) => x.keep === k);
    const d = br ? Math.max(0.1, (reg.reached[String(k + 1)] ?? reg.days) - reg.reached[String(k)]) : 1;
    const rpd = br ? br.defenses / d : 0;
    const army = botArmy(k, 1, data);
    let cost = 0; for (const [t, n] of Object.entries(army)) { const lvl = Math.min(troopLevelCapAt(k, data, t), (data.troops as any)[t].levels.length); cost += ((data.troops as any)[t].levels[lvl - 1].cost.dew ?? 0) * n; }
    const rr = (stars: number) => Math.floor(g.min * data.raids.rematch!.shareOfRaidLoot * Math.min(3, stars) / 3) * 2;
    const avgStars = br ? br.stars : 1.5; const pWin = br ? br.won : 0.8;
    console.log(`${k} | ${fmt(held)} | ${br ? (br.held * 100).toFixed(0) : '-'}%/${bc ? (bc.held * 100).toFixed(0) : '-'}% | ${fmt(held * (br?.held ?? 0) * rpd)} | ${fmt(rr(3))} | ${fmt(rr(avgStars) * pWin)} | ${fmt(cost)} | ${fmt(rr(3) - cost)} | ${fmt(rr(avgStars) * pWin - cost)} | ${fmt((rr(avgStars) * pWin - cost) * rpd)}`);
  }
}
