// Read-only: how much of the regular model player's pace do raids against the village cost at all?
// Plays the gated 'regular' policy with and without offline raids, with a wall-clock guard.
// Usage: pace_noraids.ts <on|off|half> <seconds>
const REPO = '/home/user/ninja-version-of-game-1';
const { defaultData } = await import(`${REPO}/src/gameplay/sim/data`);
const PM = await import(`${REPO}/tools/balance/playerModel`);
const mode = process.argv[2] ?? 'on';
const budget = Number(process.argv[3] ?? 25) * 1000;
const data = structuredClone(defaultData);
if (mode === 'off') data.raids.chancePerSlot = 0;
if (mode === 'carry0') (data.raids as any).carryByStars = [0, 0, 0, 0];
const p = new PM.ModelPlayer(data, { raidsPerSession: 2, ...(process.argv[4] ? { policy: process.argv[4] } : {}) });
const t0 = Date.now();
PM.activeHour(p, 60, 2);
let days = 0;
while (Date.now() - t0 < budget && days < 120) {
  PM.normalDays(p, 1);
  days++;
}
const reached = Object.fromEntries(Object.entries(p.hallReachedAt).map(([k, v]) => [k, +((v as number) / 24).toFixed(1)]));
const lost = p.defenseLog.reduce((a: number, d: any) => a + d.lost, 0);
const looted = p.raidLog.reduce((a: number, r: any) => a + Math.max(0, r.loot), 0);
console.log(JSON.stringify({ mode, policy: process.argv[4] ?? 'raider', daysPlayed: days, wallSeconds: Math.round((Date.now() - t0) / 1000), reached, raids: p.raids, defenses: p.defenseLog.length, lostM: +(lost / 1e6).toFixed(1), lootedM: +(looted / 1e6).toFixed(1) }));
