// Read-only: what "Next" offers at a Keep (no battles). Loot spread by rival clan, against the fee.
const REPO = '/home/user/ninja-version-of-game-1';
const { defaultData: data } = await import(`${REPO}/src/gameplay/sim/data`);
const M = await import(`${REPO}/src/gameplay/sim/matchmaking`);
const G = await import(`${REPO}/src/gameplay/sim/battle/basegen`);
const RV = await import(`${REPO}/src/gameplay/sim/rivals`);
const R = await import(`${REPO}/src/gameplay/sim/rng`);
const c = (await import(`${REPO}/docs/game-theory/campaign.json`, { with: { type: 'json' } })).default;
const reg = c.results.find((x: any) => x.id === 'regular');
for (const K of [5, 9, 12, 15]) {
  const row = reg.byKeep.find((k: any) => k.keep === K);
  const honor = Math.round(row.honor);
  const floor = row.strength - M.powerSlackAt(K, data);
  const fee = data.battle.scoutFeeByHall[K - 1];
  const by: Record<string, number[]> = {};
  const all: number[] = [];
  const halls: Record<number, number> = {};
  for (let i = 0; i < 400; i++) {
    const seed = R.mixSeed(12345, i);
    const base = M.opponentForRank(seed, honor, K, data, floor, []);
    const tot = G.totalLoot(base);
    const v = (tot.acorns ?? 0) + (tot.dew ?? 0);
    all.push(v);
    halls[base.hallLevel] = (halls[base.hallLevel] ?? 0) + 1;
    (by[RV.rivalFor(seed, data)?.id ?? '-'] ??= []).push(v);
  }
  all.sort((a, b) => a - b);
  const mean = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / xs.length;
  const q = (p: number) => all[Math.floor(p * (all.length - 1))];
  // Best accept-or-reroll policy with unlimited rerolls at fee f: accept if v >= threshold T where E[max(v - T, 0)] = fee.
  let best = mean(all), bestT = 0;
  for (const T of all) {
    const pAcc = all.filter((v) => v >= T).length / all.length;
    const mAcc = mean(all.filter((v) => v >= T));
    const ev = mAcc - fee * (1 / pAcc - 1);
    if (ev > best) { best = ev; bestT = T; }
  }
  console.log(`K${K} honor ${honor} floor ${floor.toFixed(2)} fee ${fee} (${(100 * fee / mean(all)).toFixed(2)}% of mean offer ${Math.round(mean(all))}) | offers p5 ${q(0.05)} p50 ${q(0.5)} p95 ${q(0.95)} (p95/p5 ${(q(0.95) / q(0.05)).toFixed(2)}) | opp Keeps ${JSON.stringify(halls)} | by clan ${Object.entries(by).map(([k, v]) => `${k} ${Math.round(mean(v))}`).join(', ')} | best reroll policy +${(100 * (best / mean(all) - 1)).toFixed(1)}% (accept >= ${bestT}, accepts ${(100 * all.filter((v) => v >= bestT).length / all.length).toFixed(0)}%)`);
}
