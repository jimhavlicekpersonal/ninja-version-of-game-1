// Probe 2 (review key def): reward per day against the "under 20% of a regular player's daily raid loot" bound.
// A: the blocked-deploy village with storages at the Keep's cap (everything else level 1).
// B: the published harness's generated villages (b100, b50), more seeds, storages emptied before logging off.
// node --experimental-transform-types --import <repo>/tools/balance/lab/register.mjs def-farm2.ts [keeps] [days] [seeds] [parts]
import { M, REGULAR_DAILY, RES, blockedVillage, collectorIncomePerDay, defaultData, genVillage, runDays } from './def-lib.ts';

const keeps = (process.argv[2] ?? '9,12,15').split(',').map(Number);
const DAYS = Number(process.argv[3] ?? 20);
const seeds = (process.argv[4] ?? '11,22,33').split(',').map(Number);
const parts = (process.argv[5] ?? 'A,B').split(',');
const data = structuredClone(defaultData);
const pct = (x: number, K: number) => (REGULAR_DAILY[K] ? Math.round((100 * x) / REGULAR_DAILY[K]) + '%' : 'n/a');

const modes = [
  { name: 'passive (1 visit, shield stays)', visits: [18], breakShield: false },
  { name: 'active (4 visits, shield ends)', visits: [8, 12.5, 18, 22], breakShield: true },
];

for (const K of keeps) {
  const min = data.battle.generatedLootByHall[K - 1].min;
  console.log(`\n=== Keep ${K}: one full hold pays ${M(2 * Math.floor(min * 0.12))}; regular player loots ${M(REGULAR_DAILY[K] ?? 0)} a day; 20% of that is ${M((REGULAR_DAILY[K] ?? 0) * 0.2)}`);
  if (parts.includes('A')) {
    const storageOnly = (type: string, max: number) => (data.buildings[type].category === 'storage' ? max : 1);
    const made = blockedVillage(K, 4011 + K * 131, data, storageOnly);
    if (made) {
      for (const mode of modes) {
        let raids = 0, rew = 0, loss = 0, held = 0, noDep = 0, honor = 0;
        for (const seed of seeds) {
          const v = structuredClone(made.st);
          v.seed = 4000 + seed + K * 131;
          const r = runDays(v, data, { days: DAYS, visits: mode.visits, fill: 0, breakShield: mode.breakShield });
          raids += r.raids; rew += r.rew; loss += r.loss; held += r.held; noDep += r.noDeploy; honor += r.honorEnd;
        }
        const days = DAYS * seeds.length;
        console.log(`A blocked, storages at cap, rest lvl 1 | ${mode.name.padEnd(32)} raids/day ${(raids / days).toFixed(2)} held ${Math.round((100 * held) / Math.max(1, raids))}% no-deploy ${noDep}/${raids} | lost/day ${M(loss / days)} reward/day ${M(rew / days)} = ${pct(rew / days, K)} of regular loot | honor after ${DAYS} days ${Math.round(honor / seeds.length)} | collectors/day ${M(collectorIncomePerDay(made.st, data))} cap ${M(RES.capacity(made.st, data).acorns)}`);
      }
    } else console.log('A: cannot block the map at this Keep');
  }
  if (parts.includes('B')) {
    for (const variant of ['b100', 'b50'] as const) {
      for (const fill of [0, 0.3]) {
        for (const mode of modes) {
          for (const honor of [undefined, 0] as const) {
            if (honor === 0 && fill !== 0) continue;
            let raids = 0, rew = 0, loss = 0, held = 0, shields = 0, honorEnd = 0;
            const per: string[] = [];
            for (const seed of seeds) {
              const v = genVillage(K, variant, 4000 + seed + K * 131, data);
              const r = runDays(v, data, { days: DAYS, visits: mode.visits, fill, breakShield: mode.breakShield, clearLog: true, honor });
              raids += r.raids; rew += r.rew; loss += r.loss; held += r.held; shields += r.shields; honorEnd += r.honorEnd;
              per.push(`s${seed}: ${(r.raids / DAYS).toFixed(2)}/d ${Math.round((100 * r.held) / Math.max(1, r.raids))}% rew ${M(r.rew / DAYS)}=${pct(r.rew / DAYS, K)} net ${M((r.rew - r.loss) / DAYS)}`);
            }
            const days = DAYS * seeds.length;
            console.log(`B ${variant.padEnd(4)} fill ${fill} honor ${honor === undefined ? 'moves' : 'kept 0'} | ${mode.name.padEnd(32)} raids/day ${(raids / days).toFixed(2)} held ${Math.round((100 * held) / Math.max(1, raids))}% shields ${shields}/${raids} | lost/day ${M(loss / days)} reward/day ${M(rew / days)} = ${pct(rew / days, K)} net/day ${M((rew - loss) / days)} | honor end ${Math.round(honorEnd / seeds.length)} | ${per.join(' ; ')}`);
          }
        }
      }
    }
  }
}
