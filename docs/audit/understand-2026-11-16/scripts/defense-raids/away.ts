// Read-only: what a long absence costs (one catch-up), K9 and K12, level-1 defences, storages full at leaving.
const REPO = '/home/user/ninja-version-of-game-1';
const { defaultData: data } = await import(`${REPO}/src/gameplay/sim/data`);
const D = await import(`${REPO}/src/gameplay/sim/defense`);
const G = await import(`${REPO}/src/gameplay/sim/battle/basegen`);
const V = await import(`${REPO}/src/gameplay/sim/village`);
const RES = await import(`${REPO}/src/gameplay/sim/resources`);
const t0 = Date.UTC(2026, 5, 1, 0, 0, 0); const HOUR = 3_600_000;
for (const K of [9, 12]) for (const fill of [1, 0.3]) for (const days of [3, 7, 30]) {
  const gen = G.generateOpponent(4242 + K, K, data, { levelBias: 0.5 });
  const st = V.createNewVillage(t0, data);
  let id = 1; const out: any[] = [];
  for (const b of gen.buildings) { const def = data.buildings[b.type]; const cat = def.category; if (cat === 'hedge') continue; const isDef = cat === 'defense' || cat === 'trap' || cat === 'support';
    out.push({ id: `b${id++}`, type: b.type, level: isDef ? 1 : b.level, x: b.x, y: b.y, upgrade: null, collector: def.produces ? { stored: 0, accrueFrom: t0 } : null }); }
  st.buildings = out; st.nextId = id; st.shieldUntil = 0; st.stats.defensesFaced = 99; st.trophies = 0; st.seed = 777 + K; st.lastSeenAt = t0; st.raidCheckAt = t0;
  const cap = RES.capacity(st, data); st.resources.acorns = cap.acorns * fill; st.resources.dew = cap.dew * fill;
  const before = st.resources.acorns + st.resources.dew;
  const r = D.simulateOfflineRaids(st, t0 + days * 24 * HOUR, data);
  const lost = r.raids.reduce((a: number, o: any) => a + (o.record.result.loot.acorns ?? 0) + (o.record.result.loot.dew ?? 0), 0);
  const fromSt = r.raids.reduce((a: number, o: any) => a + (o.fromStorage.acorns ?? 0) + (o.fromStorage.dew ?? 0), 0);
  console.log(`K${K} storages ${fill * 100}% full, away ${days} d: ${r.raids.length} raids, lost ${(lost / 1e6).toFixed(2)}M (from storage ${(fromSt / 1e6).toFixed(2)}M = ${(100 * fromSt / before).toFixed(1)}% of what was stored; the rest from collectors)`);
}
