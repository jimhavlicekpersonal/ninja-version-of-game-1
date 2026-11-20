// Read-only: which bot raider does a village meet today, by its honor? (attackerFor, 400 draws)
const REPO = '/home/user/ninja-version-of-game-1';
const { defaultData: data } = await import(`${REPO}/src/gameplay/sim/data`);
const M = await import(`${REPO}/src/gameplay/sim/matchmaking`);
const R = await import(`${REPO}/src/gameplay/sim/rng`);
const V = await import(`${REPO}/src/gameplay/sim/village`);
const A = await import(`${REPO}/src/gameplay/sim/army`);
const t0 = Date.UTC(2026, 5, 1);
for (const [K, honors] of [[5, [780, 1042, 1400, 1800]], [9, [1660, 2215, 2800, 3300]], [12, [1849, 3217, 3900, 4300]], [15, [2120, 4308, 4900, 5300]]] as [number, number[]][]) {
  for (const honor of honors) {
    const st = V.createNewVillage(t0, data);
    st.buildings = [{ id: 'b1', type: 'elder_toadstool', level: K, x: 18, y: 18, upgrade: null, collector: null }];
    st.trophies = honor; st.stats.defensesFaced = 99;
    const tally: Record<string, number> = {}; let housing = 0, lv = 0, n = 400;
    for (let i = 0; i < n; i++) {
      const a = M.attackerFor(R.createRng(1000 + i), st, data);
      const key = `Keep ${a.hall} ${a.bias < 0.5 ? 'low' : 'high'}`;
      tally[key] = (tally[key] ?? 0) + 1;
      housing += Object.entries(a.army).reduce((s, [t, c]) => s + data.troops[t].housing * (c as number), 0);
      lv += Math.max(...Object.values(a.levels) as number[]);
    }
    console.log(`own Keep ${K}, honor ${honor}: ${Object.entries(tally).sort().map(([k, v]) => `${k} ${Math.round(100 * v / n)}%`).join(', ')} | mean housing ${(housing / n).toFixed(0)} of own max ${A.maxHousingAtHall(K, data)} | mean top level ${(lv / n).toFixed(1)}`);
  }
}
