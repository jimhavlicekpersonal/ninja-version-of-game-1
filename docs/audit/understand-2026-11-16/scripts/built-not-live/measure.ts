import { createBattle, deploymentsByTick, result as battleResult, step } from '/src/gameplay/sim/battle/battle';
import { LAYOUTS, generateOpponent } from '/src/gameplay/sim/battle/basegen';
import type { BaseLayout, BattleSetup } from '/src/gameplay/sim/battle/types';
import { defaultData } from '/src/gameplay/sim/data';
import { botDeployments } from '/src/gameplay/sim/defense';
import { heroAtKeep } from '/src/gameplay/sim/heroes';
import { botArmy } from '/src/gameplay/sim/matchmaking';
import { withPreview, previewBuildingIds } from '/src/gameplay/sim/plannedContent';
import { troopLevelCapAt } from '/src/gameplay/sim/research';
import { createRng } from '/src/gameplay/sim/rng';
import type { GameData } from '/src/gameplay/sim/types';
import { BattleSession } from '/src/gameplay/control/battleSession';
import { BUILDINGS, buildingMaxLevelAt } from '/src/gameplay/sim/progression';
import { withBuilding } from '/tools/balance/preview.ts';
import { newestInFamily, troopKeep } from '/tools/balance/armyLab.ts';
import { maxHousingAtHall } from '/src/gameplay/sim/army';
import { WARRIORS } from '/src/gameplay/sim/progression';

const LAY = ['random', 'kunai_ring', 'walled_keep'];
function bases(keep: number, seeds: number): BaseLayout[] {
  const out: BaseLayout[] = [];
  for (const id of LAY) {
    const layout = LAYOUTS.find((l) => l.id === id);
    for (let i = 0; i < seeds; i++) out.push(generateOpponent(9000 + i * 7919 + keep * 131, keep, defaultData, { levelBias: 0.5, layout }));
  }
  return out;
}
function fight(base: BaseLayout, army: Record<string, number>, keep: number, seed: number, data: GameData, hero: { id: string; level: number } | null, mastery?: Record<string, number>, ev?: Record<string, number>): { d: number; s: number } {
  const levels = Object.fromEntries(Object.keys(army).map((t) => [t, troopLevelCapAt(keep, data, t)]));
  const setup: BattleSetup = { seed: 177 + seed, base, army, levels, infiltration: true, ...(hero ? { hero } : {}), ...(mastery ? { mastery } : {}) };
  const sim = createBattle(setup, data);
  const deployments = botDeployments(sim.deployable, sim.grid.size, army, createRng(13 + seed), data, levels, sim.entry);
  if (hero && deployments.length) deployments.unshift({ ...deployments[0], troop: hero.id });
  const byTick = deploymentsByTick(deployments);
  while (!sim.ended) {
    step(sim, byTick.get(sim.tick));
    if (ev) for (const e of sim.events) if (e.k === 'counter') ev[(e as { what: string }).what] = (ev[(e as { what: string }).what] ?? 0) + 1;
  }
  const r = battleResult(sim);
  return { d: r.destruction, s: r.stars };
}
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a: number[]) => { const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / Math.max(1, a.length - 1)); };
const se = (a: number[]) => sd(a) / Math.sqrt(a.length);
const f = (n: number) => n.toFixed(1);

export async function run(mode: string, args: string[]): Promise<string> {
  const L: string[] = [];
  const pdata = withPreview(defaultData);
  if (mode === 'hero') {
    const seeds = Number(args[0] ?? 4);
    for (const keep of [9, 12, 15]) {
      const list = bases(keep, seeds);
      const army = botArmy(keep, 1, pdata);
      const cap = heroAtKeep(keep, defaultData);
      const heroes: [string, { id: string; level: number } | null][] = [['none', null], ['captain', cap]];
      for (const id of ['iron_matriarch', 'sky_admiral', 'grand_sensei']) {
        const def = pdata.battle.heroes![id];
        if (keep >= def.unlockKeep) heroes.push([id, { id, level: Math.max(1, Math.min(def.levels.length, keep - def.unlockKeep + 1)) }]);
      }
      const res: Record<string, number[]> = {};
      const stars: Record<string, number[]> = {};
      list.forEach((b, i) => { for (const [n, h] of heroes) { const r = fight(b, army, keep, i, pdata, h); (res[n] ??= []).push(r.d); (stars[n] ??= []).push(r.s); } });
      for (const [n] of heroes) {
        const diff = res[n].map((v, i) => v - res.none[i]);
        L.push(`K${keep} n=${list.length} ${n.padEnd(15)} destr ${f(mean(res[n]))} stars ${mean(stars[n]).toFixed(2)}  paired diff vs none ${f(mean(diff))} +- ${f(se(diff))} (SE)`);
      }
    }
  } else if (mode === 'mastery') {
    const seeds = Number(args[0] ?? 4);
    for (const keep of [6, 9, 12, 15]) {
      const list = bases(keep, seeds);
      const army = botArmy(keep, 1, defaultData);
      const res: Record<string, number[]> = {};
      const stars: Record<string, number[]> = {};
      for (const b of [0, 0.1, 0.17, 0.243, 0.3]) {
        const m = b ? Object.fromEntries(Object.keys(army).map((t) => [t, b])) : undefined;
        list.forEach((base, i) => { const r = fight(base, army, keep, i, defaultData, heroAtKeep(keep, defaultData), m); (res[b] ??= []).push(r.d); (stars[b] ??= []).push(r.s); });
        const diff = res[b].map((v, i) => v - res[0][i]);
        const three = stars[b].filter((s) => s === 3).length / list.length;
        L.push(`K${keep} n=${list.length} mastery +${(b * 100).toFixed(0)}%: destr ${f(mean(res[b]))} stars ${mean(stars[b]).toFixed(2)} three-star ${(three * 100).toFixed(0)}% diff ${f(mean(diff))} +- ${f(se(diff))}`);
      }
    }
  } else if (mode === 'squad') {
    const seeds = Number(args[0] ?? 3);
    const forms = ['together', 'pincer', 'file'] as const;
    const orders = ['tanks', 'rush', 'reserve'] as const;
    for (const keep of [9, 12]) {
      const list = bases(keep, seeds);
      const army = botArmy(keep, 1, defaultData);
      const levels = Object.fromEntries(Object.keys(army).map((t) => [t, troopLevelCapAt(keep, defaultData, t)]));
      const agg: Record<string, number[]> = {};
      const spread: number[] = [];
      const bestMinusBot: number[] = [];
      list.forEach((base, i) => {
        const bot = fight(base, army, keep, i, defaultData, null).d;
        (agg.bot ??= []).push(bot);
        const per: number[] = [];
        for (const fo of forms) for (const or of orders) {
          const setup: BattleSetup = { seed: 177 + i, base, army, levels, infiltration: true };
          const s = new BattleSession(setup, defaultData, 'scout');
          s.start();
          const n = s.sim.entry?.points.length ?? 0;
          // point: the one the bot plan would lead with is unknown here; use point 0
          s.orderSquad({ point: 0, formation: fo, order: or });
          let guard = 0;
          while (!s.sim.ended && guard++ < 100000) s.update(100);
          const d = s.result().destruction;
          (agg[`${fo}/${or}`] ??= []).push(d);
          per.push(d);
          void n;
        }
        spread.push(Math.max(...per) - Math.min(...per));
        bestMinusBot.push(Math.max(...per) - bot);
      });
      for (const [k, v] of Object.entries(agg)) L.push(`K${keep} n=${list.length} ${k.padEnd(18)} destr ${f(mean(v))}`);
      L.push(`K${keep} per-base spread between the 9 orders (same army, same point): mean ${f(mean(spread))}, max ${f(Math.max(...spread))}; best order minus bot plan: mean ${f(mean(bestMinusBot))}`);
    }
  } else if (mode === 'counters' || mode === 'counters-target') {
    const seeds = Number(args[0] ?? 4);
    const keep = Number(args[1] ?? 15);
    const only = args.slice(2);
    const list = bases(keep, seeds);
    const target = mode === 'counters-target';
    const liveTroop = (rid: string) => WARRIORS.find((w) => w.id === rid)?.liveTroop ?? rid;
    const focus = (troops: string[]): Record<string, number> | null => {
      const open = troops.map(liveTroop).filter((t) => pdata.troops[t] && troopKeep(t, pdata) <= keep);
      if (!open.length) return null;
      const housing = maxHousingAtHall(keep, pdata);
      const out: Record<string, number> = {};
      const add = (list: string[], share: number) => { for (const t of list) { const n = Math.floor((housing * share) / list.length / pdata.troops[t].housing); if (n > 0) out[t] = (out[t] ?? 0) + n; } };
      add(open, 0.6);
      add(newestInFamily('melee', keep, 2, pdata), 0.4);
      return out;
    };
    let army = botArmy(keep, 1, pdata);
    for (const id of previewBuildingIds().filter((b) => b !== 'hero_shrine' && (!only.length || only.includes(b)))) {
      const entry = BUILDINGS.find((b) => b.id === id)!;
      if (buildingMaxLevelAt(entry, keep) <= 0) continue;
      if (target) { const a2 = focus(entry.counters ?? []); if (!a2) continue; army = a2; }
      const plain = structuredClone(pdata);
      delete plain.buildings[id].effect;
      for (const lv of plain.buildings[id].levels) delete (lv as { effect?: unknown }).effect;
      const w: number[] = [], o: number[] = [], a: number[] = [];
      const ev: Record<string, number> = {};
      list.forEach((base, i) => {
        const changed = withBuilding(base, id, keep, pdata);
        a.push(fight(base, army, keep, i, pdata, null).d);
        w.push(fight(changed, army, keep, i, pdata, null, undefined, ev).d);
        o.push(fight(changed, army, keep, i, plain, null).d);
      });
      const dEff = w.map((v, i) => v - o[i]);
      const dBody = o.map((v, i) => v - a[i]);
      L.push(`${id.padEnd(22)} K${keep} n=${list.length} base ${f(mean(a))} body ${f(mean(o))} with ${f(mean(w))} | body-only delta ${f(mean(dBody))} +- ${f(se(dBody))} | effect delta ${f(mean(dEff))} +- ${f(se(dEff))} | events/fight ${JSON.stringify(Object.fromEntries(Object.entries(ev).map(([k, v]) => [k, +(v / list.length).toFixed(1)])))}`);
    }
  }
  return L.join('\n');
}
