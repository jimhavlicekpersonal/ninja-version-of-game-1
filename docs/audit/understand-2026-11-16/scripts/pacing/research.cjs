const root='/home/user/ninja-version-of-game-1/src/gameplay/data/';
const t=require(root+'troops.json'), h=require(root+'hall.json'), r=require(root+'raids.json'), b=require(root+'buildings.json');
const camp=require('/home/user/ninja-version-of-game-1/docs/game-theory/campaign.json');
const reg=camp.results.find(x=>x.id==='regular').reached, cas=camp.results.find(x=>x.id==='casual').reached;
const fmt=n=>n>=1e6?(n/1e6).toFixed(2)+'M':n>=1e3?(n/1e3).toFixed(0)+'k':String(n);
const have={}; // researched level carried
for(const L of h.levels){
  const mix=Object.keys(r.botArmyMix[L.level-1]);
  let secs=0,cost=0,longest=0; const parts=[];
  for(const id of mix){
    const d=t[id]; const cap=Math.max(1,Math.min(d.levels.length,L.troopLevelCap-(d.levelCapOffset||0)));
    const from=have[id]||1; let s=0,c=0;
    for(let lv=from+1; lv<=cap; lv++){ const R=d.levels[lv-1].research; if(!R) continue; s+=R.seconds; c+=Object.values(R.cost)[0]; longest=Math.max(longest,R.seconds); }
    have[id]=Math.max(from,cap); secs+=s; cost+=c; parts.push(`${d.name} ${from}->${cap} ${(s/3600).toFixed(1)}h`);
  }
  // all unlocked warriors to cap
  const lanes=L.researchLanes;
  const regD = reg[L.level+1]!==undefined? (reg[L.level+1]-reg[L.level]):NaN, casD=cas[L.level+1]!==undefined?(cas[L.level+1]-cas[L.level]):NaN;
  console.log(`K${L.level} cap ${L.troopLevelCap} lanes ${lanes} | mix research ${(secs/86400).toFixed(2)} lane-days (${(secs/86400/lanes).toFixed(2)}d wall) cost ${fmt(cost)} prov longest ${(longest/3600).toFixed(1)}h | time at Keep reg ${regD.toFixed(1)}d cas ${casD.toFixed(1)}d | ${parts.join('; ')}`);
}
// total roster research
let tot=0; for(const d of Object.values(t)) for(const lv of d.levels) if(lv.research) tot+=lv.research.seconds; console.log('whole roster research lane-days', (tot/86400).toFixed(0));
