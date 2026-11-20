// Probe 1 (review key def): a village whose buildings leave the raider no tile to deploy on.
// node --experimental-transform-types --import <repo>/tools/balance/lab/register.mjs def-farm1.ts [keeps] [days]
import { B, D, HOUR, M, R, RES, SAVE, T0, V, blockedVillage, collectorIncomePerDay, defaultData, runDays } from './def-lib.ts';

const keeps = (process.argv[2] ?? '4,5,6,9,12,15').split(',').map(Number);
const DAYS = Number(process.argv[3] ?? 20);
const data = structuredClone(defaultData);

for (const K of keeps) {
  const made = blockedVillage(K, 4011 + K * 131, data);
  if (!made) {
    console.log(`K${K}: the Keep's building counts cannot close every deploy tile (greedy packer)`);
    continue;
  }
  const { st } = made;
  const problems = SAVE.validateVillage(st, data);
  // The deploy map of this village as the raider sees it.
  const base = D.villageToBase(st, T0, data);
  const sim = B.createBattle({ seed: 1, base, army: { hedgehog_roller: 10 }, levels: {}, infiltration: true }, data);
  const open = Array.from(sim.deployable as Uint8Array).filter((v) => v === 1).length;
  const levels = st.buildings.filter((b: any) => data.buildings[b.type].category !== 'hall').map((b: any) => b.level);
  console.log(`K${K}: ${made.placed} buildings placed (all level ${Math.max(...levels)} except the Keep), ${made.unusedWalls} walls and ${made.unusedBuildings} buildings to spare; deployable tiles ${open}; infiltration points ${sim.entry?.points.length}; validateVillage: ${problems.length ? problems.join('; ') : 'ok'}`);
  // One raid, in detail.
  const one = structuredClone(st);
  const rec = D.raidVillage(one, T0, R.createRng(900), data).record;
  console.log(`   one raid: deployments ${rec.deployments.length}, stars ${rec.result.stars}, destruction ${rec.result.destruction}%, end ${rec.result.endReason}, loot ${JSON.stringify(rec.result.loot)}, banked ${JSON.stringify(rec.banked)}, shield ${one.shieldUntil > T0}, honor ${rec.trophies}`);
  const min = data.battle.generatedLootByHall[K - 1].min;
  for (const mode of [
    { name: 'never opens the game for the whole span', visits: [] as number[], breakShield: false },
    { name: 'one visit a day', visits: [18], breakShield: false },
    { name: 'four visits a day', visits: [8, 12.5, 18, 22], breakShield: true },
  ]) {
    let raids = 0, rew = 0, loss = 0, held = 0, noDep = 0;
    const seeds = [11, 22, 33];
    for (const seed of seeds) {
      const v = structuredClone(st);
      v.seed = 4000 + seed + K * 131;
      if (mode.visits.length) {
        const r = runDays(v, data, { days: DAYS, visits: mode.visits, fill: 0, breakShield: mode.breakShield });
        raids += r.raids; rew += r.rew; loss += r.loss; held += r.held; noDep += r.noDeploy;
      } else {
        // One absence of 8 days: the catch-up cap (24 raids) and the storage cap both apply.
        const r = D.simulateOfflineRaids(v, T0 + 8 * 24 * HOUR, data);
        for (const o of r.raids) {
          raids++; if (o.record.result.stars === 0) held++;
          loss += (o.record.result.loot.acorns ?? 0) + (o.record.result.loot.dew ?? 0);
          rew += (o.record.banked?.acorns ?? 0) + (o.record.banked?.dew ?? 0);
          if (!o.record.deployments.length) noDep++;
        }
      }
    }
    const days = (mode.visits.length ? DAYS : 8) * seeds.length;
    console.log(`   ${mode.name.padEnd(40)} raids/day ${(raids / days).toFixed(2)} held ${Math.round((100 * held) / Math.max(1, raids))}% (no warrior deployed in ${noDep}/${raids}) | lost/day ${M(loss / days)} reward/day ${M(rew / days)} | full hold ${M(2 * Math.floor(min * 0.12))} | collectors/day ${M(collectorIncomePerDay(st, data))} | storage cap ${M(RES.capacity(st, data).acorns)} each`);
  }
}
