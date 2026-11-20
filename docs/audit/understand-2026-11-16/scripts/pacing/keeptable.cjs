const root='/home/user/ninja-version-of-game-1/src/gameplay/data/';
const h=require(root+'hall.json'), b=require(root+'buildings.json'), t=require(root+'troops.json'), e=require(root+'economy.json');
const fmt=n=>n>=1e6?(n/1e6).toFixed(2)+'M':n>=1e3?(n/1e3).toFixed(1)+'k':String(n);
const hrs=s=>s>=86400?(s/86400).toFixed(2)+'d':s>=3600?(s/3600).toFixed(1)+'h':(s/60).toFixed(1)+'m';
let prev={};
for(const L of h.levels){
  const k=b.elder_toadstool.levels[L.level-1];
  const lim=L.limits;
  const news=[];
  for(const [id,l] of Object.entries(lim)){
    const p=prev[id];
    if(!p) news.push('NEW '+b[id].name+' x'+l.count+' L'+l.maxLevel);
    else { const parts=[]; if(l.count!==p.count) parts.push('x'+p.count+'->'+l.count); if(l.maxLevel!==p.maxLevel) parts.push('L'+p.maxLevel+'->'+l.maxLevel); if(parts.length) news.push(b[id].name+' '+parts.join(' ')); }
  }
  // storage cap
  const cap={acorns:0,dew:0};
  const ks=k.storage||{}; for(const r of ['acorns','dew']) cap[r]+=ks[r]||0;
  for(const id of ['acorn_silo','dew_cistern']){ const l=lim[id]; if(!l) continue; const st=b[id].levels[l.maxLevel-1].storage; for(const r of Object.keys(st)) cap[r]=(cap[r]||0)+st[r]*l.count; }
  const rate={};
  for(const id of ['acorn_orchard','dewdrop_well']){ const l=lim[id]; if(!l) continue; rate[id]=b[id].levels[l.maxLevel-1].ratePerHour*l.count; }
  const camp=lim.army_camp? b.army_camp.levels[lim.army_camp.maxLevel-1].housing*lim.army_camp.count:0;
  console.log(`\n== Keep ${L.level}: cost ${JSON.stringify(k.cost)} time ${k.buildSeconds?hrs(k.buildSeconds):'-'} keepStorage ${JSON.stringify(k.storage)} troopCap ${L.troopLevelCap} lanes ${L.researchLanes} otherKeys ${Object.keys(L).filter(x=>!['level','troopLevelCap','researchLanes','limits'].includes(x)).join(',')}`);
  console.log(`   storage cap acorns ${fmt(cap.acorns)} dew ${fmt(cap.dew)} ; prod/h coins ${fmt(rate.acorn_orchard||0)} prov ${fmt(rate.dewdrop_well||0)} ; housing ${camp}`);
  console.log('   '+news.join(' | '));
  prev=lim;
}
