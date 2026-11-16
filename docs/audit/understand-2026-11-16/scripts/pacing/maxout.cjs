const root='/home/user/ninja-version-of-game-1/src/gameplay/data/';
const h=require(root+'hall.json'), b=require(root+'buildings.json');
const camp=require('/home/user/ninja-version-of-game-1/docs/game-theory/campaign.json');
const reg=camp.results.find(r=>r.id==='regular').reached, cas=camp.results.find(r=>r.id==='casual').reached;
const fmt=n=>n>=1e9?(n/1e9).toFixed(2)+'B':n>=1e6?(n/1e6).toFixed(1)+'M':n>=1e3?(n/1e3).toFixed(0)+'k':String(n);
let prev={};
console.log('Keep | keepCost | keepTime(d) | maxout coins | maxout prov | builder-days all (no walls) | /5 builders | longest single | regular days at Keep | casual days at Keep | wall coins');
for(const L of h.levels){
  let coins=0,dew=0,secs=0,longest=0,wallc=0,walld=0; const by={};
  for(const [id,l] of Object.entries(L.limits)){
    const p=prev[id]||{count:0,maxLevel:0}; const def=b[id];
    if(['decor','obstacle','builder'].includes(def.category)) continue;
    for(let i=0;i<l.count;i++){
      const from = i<p.count? p.maxLevel:0;
      for(let lv=from+1; lv<=l.maxLevel; lv++){
        const d=def.levels[lv-1]; if(!d) continue;
        const c=d.cost||{};
        if(def.category==='hedge'){ wallc+=c.acorns||0; walld+=c.dew||0; continue; }
        coins+=c.acorns||0; dew+=c.dew||0; secs+=d.buildSeconds||0; longest=Math.max(longest,d.buildSeconds||0);
        by[id]=(by[id]||0)+(d.buildSeconds||0);
      }
    }
  }
  const k=b.elder_toadstool.levels[L.level-1];
  const nk=b.elder_toadstool.levels[L.level];
  const regD = reg[L.level+1]!==undefined? (reg[L.level+1]-reg[L.level]).toFixed(1):'-';
  const casD = cas[L.level+1]!==undefined? (cas[L.level+1]-cas[L.level]).toFixed(1):'-';
  const top=Object.entries(by).sort((a,c)=>c[1]-a[1]).slice(0,3).map(([id,s])=>b[id].name+' '+(s/86400).toFixed(1)+'d').join(', ');
  console.log(`K${L.level} | next keep ${nk?fmt(nk.cost.acorns):'-'} ${nk?(nk.buildSeconds/86400).toFixed(2)+'d':''} | maxout ${fmt(coins)}c ${fmt(dew)}p | ${(secs/86400).toFixed(1)} bd | /5=${(secs/86400/5).toFixed(1)}d /2=${(secs/86400/2).toFixed(1)}d | longest ${(longest/86400).toFixed(2)}d | reg ${regD}d cas ${casD}d | walls ${fmt(wallc)}c ${fmt(walld)}p | top: ${top}`);
  prev=L.limits;
}
