// Read-only: what does the gated campaign's "defender" (and "regular") village actually look like when it is raided?
const REPO = '/home/user/ninja-version-of-game-1';
const { defaultData: data } = await import(`${REPO}/src/gameplay/sim/data`);
const PM = await import(`${REPO}/tools/balance/playerModel`);
const V = await import(`${REPO}/src/gameplay/sim/village`);
const policy = process.argv[2] ?? 'defender';
const budget = Number(process.argv[3] ?? 25) * 1000;
const p = new PM.ModelPlayer(data, { raidsPerSession: 2, ...(policy === 'raider' ? {} : { policy }) });
const t0 = Date.now();
PM.activeHour(p, 60, 2);
let days = 0;
while (Date.now() - t0 < budget && days < 120) { PM.normalDays(p, 1); days++; }
const K = V.hallLevel(p.state, data);
const lim = data.hall.levels[K - 1].limits;
const rows: string[] = [];
for (const [t, l] of Object.entries(lim) as [string, any][]) {
  const cat = data.buildings[t].category;
  if (!['defense', 'trap', 'hedge', 'support'].includes(cat)) continue;
  const mine = p.state.buildings.filter((b: any) => b.type === t);
  const avg = mine.length ? mine.reduce((a: number, b: any) => a + b.level, 0) / mine.length : 0;
  rows.push(`${t} ${mine.length}/${l.count} built, avg level ${avg.toFixed(1)} of cap ${l.maxLevel}`);
}
const d = p.defenseLog.filter((x: any) => x.hall >= K - 1);
console.log(JSON.stringify({ policy, daysPlayed: days, keep: K, lastDefenses: d.length, held: d.filter((x: any) => x.stars === 0).length, avgStars: +(d.reduce((a: number, x: any) => a + x.stars, 0) / Math.max(1, d.length)).toFixed(2) }));
console.log(rows.join('\n'));
