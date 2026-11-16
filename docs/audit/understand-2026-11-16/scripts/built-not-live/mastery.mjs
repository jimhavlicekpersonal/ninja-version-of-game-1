import { open } from './load.mjs';
const s = await open();
try {
  const P = await s.load('/src/gameplay/sim/progression.ts');
  const { defaultData: data } = await s.load('/src/gameplay/sim/data.ts');
  const { maxHousingAtHall } = await s.load('/src/gameplay/sim/army.ts');
  console.log('level  totalXP  bonus%');
  for (const m of [1,2,3,4,5,6,8,10,12,15,20,25,30,40]) console.log(String(m).padStart(3), String(Math.round(P.masteryXpTotal(m))).padStart(12), (P.masteryBonus(m)*100).toFixed(2));
  console.log('battleMasteryXp(100 housing, 0..3 stars):', [0,1,2,3].map((st)=>P.battleMasteryXp(100, st)));
  // Battles (3-star, whole army of ONE type) to reach each level, by Keep housing
  for (const keep of [4,7,9,12,15]) {
    const h = maxHousingAtHall(keep, data);
    const per3 = P.battleMasteryXp(h, 3), per2 = P.battleMasteryXp(h, 2);
    const row = [5,10,15,20,25].map((pct)=>{ let m=0; while(P.masteryBonus(m)*100 < pct && m<200) m++; return `+${pct}%: L${m} ${Math.ceil(P.masteryXpTotal(m)/per3)} raids(3*) / ${Math.ceil(P.masteryXpTotal(m)/per2)} (2*)`; });
    console.log(`Keep ${keep} housing ${h}: mono-type army -> ` + row.join(' | '));
    // five-type even split
    const per3s = P.battleMasteryXp(h/5, 3);
    console.log(`   5-type even split, 3*: ` + [5,10,15,20,25].map((pct)=>{ let m=0; while(P.masteryBonus(m)*100 < pct) m++; return `+${pct}%: ${Math.ceil(P.masteryXpTotal(m)/per3s)} raids`; }).join(' | '));
  }
} finally { await s.close(); }
