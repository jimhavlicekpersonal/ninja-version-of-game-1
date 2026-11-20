import { defaultData as data, B, LAYOUTS, generateOpponent, botArmy, heroAtKeep, levelsFor, planFrom, run, triples, mean, maxHousingAtHall, lab } from './common.ts';
// Marginal value of each warrior at Keep K: bot mix at 80% housing + 20% housing of X, vs the full bot mix;
// and the same with X's kit removed. argv: keep, shard, shards
const keep = Number(process.argv[2] ?? 15); const shard = Number(process.argv[3] ?? 0); const shards = Number(process.argv[4] ?? 1);
const hero = heroAtKeep(keep, data);
const housing = maxHousingAtHall(keep, data);
const mix = botArmy(keep, 1, data);
function withX(x: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [t, n] of Object.entries(mix)) out[t] = Math.floor((n as number) * 0.8);
  const used = Object.entries(out).reduce((s, [t, n]) => s + data.troops[t].housing * n, 0);
  out[x] = (out[x] ?? 0) + Math.floor((housing - used) / data.troops[x].housing);
  return out;
}
const bases = LAYOUTS.map((layout: any) => generateOpponent(9500 + keep * 131, keep, data, { levelBias: 0.5, layout }));
function score(army: Record<string, number>, d: any): number {
  const levels = levelsFor(army, keep, d); const ds: number[] = [];
  for (const base of bases) {
    const setup = { seed: 800, base, army, levels, infiltration: true, ...(hero ? { hero } : {}) };
    const probe = B.createBattle(setup, d); const tr = triples(probe);
    for (const pts of [tr[0], tr[3 % tr.length]]) ds.push(run(setup, planFrom(probe, army, levels, pts, d, hero?.id), d).r.destruction);
  }
  return mean(ds);
}
const ids = Object.keys(data.troops).filter((t) => lab.troopKeep(t, data) <= keep).filter((_, i) => i % shards === shard);
if (shard === 0) console.log(`Keep ${keep} baseline bot mix: ${score(mix, data).toFixed(1)}%  (10 battles per cell: 5 layouts x 2 sides, bot plan, hero)`);
for (const x of ids) {
  const army = withX(x);
  const on = score(army, data);
  const d2 = structuredClone(data); const def = d2.troops[x]; const hadKit = Boolean(def.kit || def.ability);
  delete def.kit; if (def.ability === 'sabotage' || def.ability === 'charge' || def.ability === 'chain_lightning') def.ability = 'none';
  const off = hadKit ? score(army, d2) : NaN;
  console.log(`${x.padEnd(20)} ${String(data.troops[x].name).padEnd(20)} K${lab.troopKeep(x, data)} L${levelsFor(army, keep)[x]} n=${army[x]}  with20%=${on.toFixed(1)}  kitOff=${Number.isNaN(off) ? '  - ' : off.toFixed(1)}  kitValue=${Number.isNaN(off) ? '  - ' : (on - off).toFixed(1)}`);
}
