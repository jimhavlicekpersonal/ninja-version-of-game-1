/**
 * Builds the game-theory and art documents straight from the progression
 * model, so the lists can never drift from the numbers. Run: npm run docs:progression
 */
import { defaultData as data } from '../../src/gameplay/sim/data';
import { LAYOUTS } from '../../src/gameplay/sim/battle/basegen';
import {
  BUILDINGS,
  HEROES,
  MODEL,
  WARRIORS,
  buildingMaxLevelAt,
  expectedArmyPower,
  masteryBonus,
  masteryXpTotal,
  researchCost,
  researchSeconds,
  role,
  trainingCost,
  warriorLevelCap,
  warriorStats,
  warriorUnlockKeep,
  type RoleId,
  type WarriorEntry,
} from '../../src/gameplay/sim/progression';
import { trialInfo, trialReward } from '../../src/gameplay/sim/trials';

const K = MODEL.keepLevels;
const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}k` : String(Math.round(n)));
const days = (s: number) => (s >= 86400 ? `${(s / 86400).toFixed(1)} d` : s >= 3600 ? `${(s / 3600).toFixed(1)} h` : `${Math.round(s / 60)} min`);
const tierName = (t: number) => MODEL.tiers[t - 1].name;

export interface IconEntry {
  key: string;
  file: string;
  size: number;
  group: 'warrior' | 'hero' | 'sprite' | 'building' | 'ability' | 'currency' | 'league' | 'tier' | 'role' | 'trial' | 'fx';
  subject: string;
  stage?: number;
  levels?: [number, number];
  /** Is it used by the live game today (vs. planned content)? */
  live: boolean;
  prompt: string;
}

function lookText(look: Record<string, string>): string {
  const parts = [`${look.gi} outfit`, `${look.accent} accents`];
  if (look.weapon) parts.push(look.weapon);
  if (look.armor) parts.push(`${look.armor} armour`);
  if (look.hat) parts.push(look.hat);
  if (look.mount) parts.push(`riding/with ${look.mount}`);
  return parts.join(', ');
}

export function iconManifest(): IconEntry[] {
  const out: IconEntry[] = [];
  for (const w of WARRIORS) {
    const r = role(w.role);
    for (const s of MODEL.visualStages) {
      out.push({
        key: `icon.warrior.${w.id}.s${s.stage}`,
        file: `public/art/icons/warriors/${w.id}_s${s.stage}.png`,
        size: 256,
        group: 'warrior',
        subject: `${w.name} (${r.name}, ${tierName(w.tier)})`,
        stage: s.stage,
        levels: s.levels as [number, number],
        live: Boolean(w.liveTroop),
        prompt: `Portrait icon of ${w.name}, a ${r.name.toLowerCase()} warrior (${r.summary.toLowerCase()}) Signature: ${w.ability.name}. ${lookText(w.look)}. Stage ${s.stage}: ${s.look}.`,
      });
    }
    out.push({
      key: `troop.${w.liveTroop ?? w.id}`,
      file: `public/art/troops/${w.id}.png`,
      size: 128,
      group: 'sprite',
      subject: `${w.name} battle sprite`,
      live: Boolean(w.liveTroop),
      prompt: `Full-body battle sprite of ${w.name}, facing right, feet on the bottom edge, readable at 40 px tall. ${lookText(w.look)}.${r.air ? ' Shown airborne.' : ''}`,
    });
  }
  for (const hr of HEROES) {
    for (const s of MODEL.visualStages) {
      out.push({
        key: `icon.hero.${hr.id}.s${s.stage}`,
        file: `public/art/icons/heroes/${hr.id}_s${s.stage}.png`,
        size: 256,
        group: 'hero',
        subject: `${hr.name} (hero)`,
        stage: s.stage,
        levels: s.levels as [number, number],
        live: false,
        prompt: `Heroic portrait of ${hr.name}, clan hero. Signature: ${hr.ability.name}. ${lookText(hr.look)}. Larger, more ornate than regular warriors. Stage ${s.stage}: ${s.look}.`,
      });
    }
  }
  const stages = MODEL.buildings.visualStages;
  for (const b of BUILDINGS) {
    const n = b.pinnacleMaxLevel <= 1 ? 1 : stages;
    for (let s = 1; s <= n; s++) {
      const lo = n === 1 ? 1 : Math.floor(((s - 1) * b.pinnacleMaxLevel) / n) + 1;
      const hi = n === 1 ? 1 : Math.floor((s * b.pinnacleMaxLevel) / n);
      out.push({
        key: `icon.building.${b.id}.s${s}`,
        file: `public/art/icons/buildings/${b.id}_s${s}.png`,
        size: 256,
        group: 'building',
        subject: `${b.name} (${b.category})`,
        stage: s,
        levels: [lo, hi],
        live: b.live,
        prompt: `Isometric icon of the ${b.name}${b.description ? `: ${b.description}` : ''}. Stage ${s} of ${n}: ${['timber and plaster, simple', 'stone base and tiled roof', 'second storey, banners, lacquer trim', 'gold finials, lanterns, carved beams', 'masterwork: gold leaf, glowing lanterns, clan crest banners'][Math.min(4, s - 1)]}.`,
      });
    }
  }
  const abilities: [string, string, string, boolean][] = [['smoke_bomb', 'Smoke Bomb', data.battle.abilities.smoke_bomb.description, true]];
  for (const w of WARRIORS) abilities.push([w.ability.id, w.ability.name, w.ability.text, Boolean(w.liveTroop)]);
  for (const hr of HEROES) abilities.push([hr.ability.id, hr.ability.name, hr.ability.text, false]);
  for (const [id, name, text, live] of abilities) out.push({ key: `icon.ability.${id}`, file: `public/art/icons/abilities/${id}.png`, size: 128, group: 'ability', subject: name, live, prompt: `Ability icon "${name}": ${text} One bold symbol on a round ink-wash badge.` });
  for (const [id, name, what, live] of [
    ['acorns', 'Coins', 'gold coin with a square hole', true],
    ['dew', 'Provisions', 'rice bale tied with straw rope', true],
    ['moonstones', 'Jade', 'faceted green jade gem', true],
    ['nightsap', 'Shadow Ink', 'ink stone with a drop of glowing violet ink', false],
  ] as const) out.push({ key: `icon.currency.${id}`, file: `public/art/icons/currency/${id}.png`, size: 128, group: 'currency', subject: name, live, prompt: `Currency icon: ${what}. Must read at 24 px.` });
  for (const l of data.ranks.leagues) out.push({ key: `icon.league.${l.id}`, file: `public/art/icons/leagues/${l.id}.png`, size: 192, group: 'league', subject: l.name, live: true, prompt: `League badge for the ${l.name}: a shield-shaped crest with ${l.name.split(' ')[0].toLowerCase()} material and the clan crest.` });
  for (const t of MODEL.tiers) out.push({ key: `icon.tier.${t.tier}`, file: `public/art/icons/tiers/tier_${t.tier}.png`, size: 96, group: 'tier', subject: `${t.name} tier`, live: false, prompt: `Tier badge "${t.name}" with ${t.tier} ${t.tier === 1 ? 'mark' : 'marks'}; colour runs cloth > steel > lacquer > silver > gold.` });
  for (const [id, r] of Object.entries(MODEL.roles)) out.push({ key: `icon.role.${id}`, file: `public/art/icons/roles/${id}.png`, size: 96, group: 'role', subject: r.name, live: false, prompt: `Role symbol for ${r.name}: ${r.summary}` });
  for (const m of data.trials.modifiers) out.push({ key: `icon.trial.${m.id}`, file: `public/art/icons/trials/${m.id}.png`, size: 96, group: 'trial', subject: m.name, live: true, prompt: `Shadow Trial modifier "${m.name}": ${m.description}` });
  out.push({ key: 'icon.trial.ladder', file: 'public/art/icons/trials/ladder.png', size: 128, group: 'trial', subject: 'Shadow Trials', live: true, prompt: 'Endless ladder of fortresses climbing into mist; the Shadow Trials button.' });
  for (const l of LAYOUTS) out.push({ key: `icon.layout.${l.id}`, file: `public/art/icons/trials/layout_${l.id}.png`, size: 96, group: 'trial', subject: l.name, live: true, prompt: `Top-down map glyph of the "${l.name}" layout: ${l.tip}` });
  out.push({ key: 'fx.smoke', file: 'public/art/fx/smoke.png', size: 64, group: 'fx', subject: 'Smoke Bomb cloud lobe', live: true, prompt: 'One soft grey-white smoke lobe, transparent edges; layered nine times to form a cloud.' });
  out.push({ key: 'fx.jam', file: 'public/art/fx/jam.png', size: 56, group: 'fx', subject: 'Jammed defense marker', live: true, prompt: 'Broken gear crossed by a gold wrench on a dark disc; floats over a sabotaged defense.' });
  return out;
}

export function rosterMarkdown(): string {
  const L: string[] = [];
  L.push('# Kagemura roster and progression (generated)', '');
  L.push('> Generated by `npm run docs:progression` from `src/gameplay/data/progression.json`, `roster.json` and `src/gameplay/sim/progression.ts`. Do not edit by hand.', '');
  L.push(`**${WARRIORS.length} warriors** (10 roles x 5 tiers) + **${HEROES.length} planned heroes**, **${BUILDINGS.length} buildings**, ${K} Clan Keep levels. Live today: ${WARRIORS.filter((w) => w.liveTroop).length} warriors, Keep 1-${data.hall.levels.length}.`, '');
  L.push('## Roles', '', '| Role | Housing | Range | Speed | Targets | Air | Past walls | Budget | HP:DPS | What it does |', '|---|---|---|---|---|---|---|---|---|---|');
  for (const [id, r] of Object.entries(MODEL.roles)) L.push(`| ${r.name} (\`${id}\`) | ${r.housing} | ${r.range} | ${r.speed} | ${r.targets} | ${r.air ? 'yes' : ''} | ${r.wallBypass ? 'yes' : ''} | ${r.efficiency} | ${r.hpPerDps} | ${r.summary} |`);
  L.push('', '## Every warrior at unlock and at the pinnacle (Keep 15)', '');
  L.push('| # | Warrior | Role | Tier | Unlock Keep | Ability | HP / DPS at unlock | Max level | HP / DPS at max | Train cost at max | Live |', '|---|---|---|---|---|---|---|---|---|---|---|');
  WARRIORS.forEach((w, i) => {
    const k = warriorUnlockKeep(w, data);
    const c0 = warriorLevelCap(w, k, data);
    const cM = warriorLevelCap(w, K, data);
    const actual = (level: number) => {
      const def = w.liveTroop ? data.troops[w.liveTroop] : undefined;
      if (!def) return { ...warriorStats(w, level), cost: trainingCost(w, level) };
      const stats = def.levels[level - 1];
      return { hp: stats.hp, dps: stats.damage * data.battle.ticksPerSecond / def.attackIntervalTicks, cost: stats.cost.dew ?? 0 };
    };
    const s0 = actual(c0);
    const sM = actual(cM);
    L.push(`| ${i + 1} | **${w.name}** \`${w.id}\` | ${role(w.role).name} | ${w.tier} ${tierName(w.tier)} | ${k} | ${w.ability.name}: ${w.ability.text} | ${fmt(s0.hp)} / ${fmt(s0.dps)} | ${cM} | ${fmt(sM.hp)} / ${fmt(sM.dps)} | ${fmt(sM.cost)} | ${w.liveTroop ? `yes (\`${w.liveTroop}\`)` : 'planned'} |`);
  });
  L.push('', '## Heroes', '', '| Hero | Leads | Unlock Keep | Ability |', '|---|---|---|---|');
  for (const hr of HEROES) L.push(`| **${hr.name}** \`${hr.id}\` | ${role(hr.heroOf).name} | ${hr.unlockKeep} | ${hr.ability.name}: ${hr.ability.text} |`);
  L.push('', '## Warrior level caps by Clan Keep level', '', `| Role \\ Keep | ${Array.from({ length: K }, (_, i) => i + 1).join(' | ')} |`, `|---|${'---|'.repeat(K)}`);
  for (const r of Object.keys(MODEL.roles) as RoleId[]) {
    for (const w of WARRIORS.filter((x) => x.role === r)) {
      L.push(`| ${w.name} | ${Array.from({ length: K }, (_, i) => warriorLevelCap(w, i + 1, data) || '·').join(' | ')} |`);
    }
  }
  L.push('', '## Research ladder (one warrior, by level)', '', '| Level | Research cost (x tier mult) | Research time | Art stage |', '|---|---|---|---|');
  const sample = WARRIORS[0] as WarriorEntry;
  for (let lv = 1; lv <= MODEL.warriorMaxLevel; lv++) L.push(`| ${lv} | ${fmt(researchCost(sample, lv))} | ${lv > 1 ? days(researchSeconds(lv)) : '-'} | ${MODEL.visualStages.find((s) => lv >= s.levels[0] && lv <= s.levels[1])?.stage} |`);
  L.push('', '## Mastery EXP (per warrior type; unbounded levels, bonus approaches 30%)', '', '| Mastery | Total EXP | Stat bonus |', '|---|---|---|');
  for (const m of [1, 2, 3, 5, 8, 10, 15, 20, 30, 50, 75, 100]) L.push(`| ${m} | ${fmt(masteryXpTotal(m))} | +${(masteryBonus(m) * 100).toFixed(1)}% |`);
  L.push('', '## Buildings: max level by Clan Keep level', '', `| Building | Category | Unlock | ${Array.from({ length: K }, (_, i) => i + 1).join(' | ')} | Live |`, `|---|---|---|${'---|'.repeat(K)}---|`);
  for (const b of BUILDINGS) L.push(`| **${b.name}** \`${b.id}\` | ${b.category} | ${b.unlockKeep} | ${Array.from({ length: K }, (_, i) => buildingMaxLevelAt(b, i + 1, data) || '·').join(' | ')} | ${b.live ? 'yes' : 'planned'} |`);
  L.push('', '## Expected attack power and Shadow Trial ladder', '', '| Keep | Expected army power | Trial tiers at this Keep | Defense power x | Reward (Coins, first clear) |', '|---|---|---|---|---|');
  for (let k = 1; k <= K; k++) {
    const first = (k - 1) * data.trials.tiersPerHall + 1;
    const info = trialInfo(first, data);
    L.push(`| ${k} | ${fmt(expectedArmyPower(k))} | ${first}-${first + data.trials.tiersPerHall - 1} | ${info.power.toFixed(2)} | ${fmt(trialReward(first, data).acorns ?? 0)} |`);
  }
  L.push('', 'Tiers past the last live Keep keep growing by 6% per tier with no top: tier 50 = x' + trialInfo(50, data).power.toFixed(1) + ', tier 100 = x' + trialInfo(100, data).power.toFixed(0) + ', tier 200 = x' + fmt(trialInfo(200, data).power) + '.');
  return L.join('\n') + '\n';
}

export function iconMarkdown(icons: IconEntry[]): string {
  const L: string[] = [];
  const groups = [...new Set(icons.map((i) => i.group))];
  L.push('# Icon manifest: every icon in the pinnacle game (generated)', '');
  L.push('> Generated by `npm run docs:progression`. Machine-readable twin: `docs/art/ICON_MANIFEST.json`. Style rules: `docs/art/ART_AI_BRIEF.md`.', '');
  L.push(`**${icons.length} images** in ${groups.length} groups. "Live" means the current build already shows it (so it is the priority).`, '');
  L.push('| Group | Count | Live now |', '|---|---|---|');
  for (const g of groups) L.push(`| ${g} | ${icons.filter((i) => i.group === g).length} | ${icons.filter((i) => i.group === g && i.live).length} |`);
  for (const g of groups) {
    L.push('', `## ${g}`, '', '| Key | File | Size | Subject | Stage (levels) | Live |', '|---|---|---|---|---|---|');
    for (const i of icons.filter((x) => x.group === g)) L.push(`| \`${i.key}\` | \`${i.file}\` | ${i.size} | ${i.subject} | ${i.stage ? `${i.stage} (${i.levels?.[0]}-${i.levels?.[1]})` : ''} | ${i.live ? 'yes' : ''} |`);
  }
  return L.join('\n') + '\n';
}
