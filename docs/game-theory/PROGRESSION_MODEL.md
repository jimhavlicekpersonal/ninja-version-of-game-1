# The progression model: one power budget for everything

Owner: GAME THEORY compartment (`src/gameplay/`). Constants: `src/gameplay/data/progression.json`. Code: `src/gameplay/sim/progression.ts`. Tests: `tests/gameplay/balance/progression-model.test.ts`. Generated tables: `ROSTER.md` (run `npm run docs:progression`).

## Playable roster release

All 50 warriors now have live troop definitions, training/research unlocks, combat behavior and code-drawn sprites. Keep levels 7–15 extend the existing buildings to their catalog caps; the four heroes and non-live buildings remain planned. `liveKeepLevels: 6` is the original calibration/interpolation pivot, not the current playable maximum (read `data.hall.levels.length` for that).

`troops.json` is authoritative for playable stats, prices, range, attack intervals and ability kits. Role formulas set baseline budgets; specialized ranges and abilities require battle tests beyond the budget equality test. Original six-warrior levels 1–5 remain unchanged. New tiers use the original role's entry training price where one exists, then tier and level multipliers. Late Keep costs grow ×1.45 to remain reachable; Keep timers grow ×2.7 to a seven-day cap. Collector payback continues increasing toward 167 hours. Late loot and fixed rewards are calibrated to tier-capped bot armies. See `PLAYABLE_ROSTER.md` for implemented mechanics and limits.

## The method in one paragraph

Every warrior, building, EXP track and difficulty tier is priced in one currency: **combat power = √(HP × DPS)** (Lanchester's square law: a unit's fighting value is the geometric mean of how long it lasts and how hard it hits). A warrior's power is a fixed **budget per housing** × its **role efficiency** (range, flight and abilities cost budget) × **1.4 per tier** × **1.16 per level**. The role then decides how the budget is split between HP and DPS. Costs grow faster than power (×1.3 training, ×1.55 research per level), so each level is worth less per Coin than the last: a long tail with no wall. Times grow ×1.9–2.2 per level up to a 7-day cap. Mastery EXP grows ×1.35 per level forever, while its bonus approaches +30%: there is always another level, but no runaway power creep. Defenses use the same 1.16 level growth, so attack and defense stay in step at every Keep level. The endless Shadow Trials ladder grows defense power +6% per tier past the last Keep level.

## Why this works

1. **It reproduces the existing balance.** All six live troops (Shinobi, Kunai Adept, Armored Guardian, Saboteur, Tunnel Runner, Kite Raider) land within 3% of the model's HP and DPS at level 1. Their level growth matches 1.16 within 4%. These are tests, so the live game and the design can't drift apart.
2. **Air pays for flying.** The Sky role's efficiency is 0.494 (HP/DPS 2.7): flyers ignore walls and ground-only defenses, so a full budget let air armies win ~100% at every Keep. Measured with `npm run balance:armies`.
2. **No dominance inside a tier.** Same tier and level means the same budget per housing (scaled by role efficiency). Warriors differ in *what they do*, not in raw strength. This extends the existing balance fix #7 ("no troop dominates another").
3. **New tiers excite without making old ones useless.** A newly unlocked tier starts no stronger than the tier below at its cap (tested). At the pinnacle each tier is about 4% stronger than the one below. Legends are about 1.2× Initiates, not 10×.
4. **Every Keep level brings something new.** Ten roles per tier, spread over 3 Keep levels, so 3–4 warriors unlock at every level from 1 to 15 (tested).
5. **Long curve, bounded numbers.** Maxing one warrior takes more than 30 days of research. Mastery levels are unbounded but the bonus is capped. Trial power is capped at 10⁹ so numbers stay finite.
6. **Rewards can't be farmed.** Trial rewards grow with log₂(tier) and pay once per tier.

## The formulas

| Quantity | Formula | Constant |
|---|---|---|
| Warrior power | `B × eff(role) × housing(role) × 1.4^(tier−1) × 1.16^(level−1)` | `powerPerHousing` B = 21 |
| HP, DPS | `HP = P·√r`, `DPS = P/√r`, with r = role HP:DPS ratio | `roles.*.hpPerDps` |
| Unlock Keep | live: from Dojo gating; planned: `firstKeep(tier) + ⌊3·roleIndex/10⌋` | `tiers[].firstKeep` = 1, 4, 7, 10, 13 |
| Level cap | `troopLevelCapByKeep[K] − 2·(tier−1)`, clamped to 1..20 | `levelCapOffsetPerTier` = 2 |
| Training cost | `20 × housing × 2^(tier−1) × 1.3^(level−1)` Provisions | `training` |
| Research | cost `4000 × 3^(tier−1) × 1.55^(level−2)`, time `30 min × 1.9^(level−2)` ≤ 7 days | `research` |
| Mastery EXP | total to reach M: `50 × (1.35^M − 1) / 0.35`; bonus `0.30 × (1 − 0.92^M)` | `mastery` |
| EXP per battle | `housing used × (1 + 2 × stars)` per warrior type | `mastery.xpPer*` |
| Building level | power ×1.16, cost ×1.45, time `10 s × 2.2^(level−1)` ≤ 7 days | `buildings` |
| Building mastery | defenses earn EXP by defending, collectors by producing; bonus → +15% | `buildingMastery` |
| Max building level | live tables to Keep 6, then a straight climb to `pinnacleMaxLevel` at Keep 15 | `buildingCatalog` |
| Shadow Trial t | Keep `min(6, 1 + ⌊(t−1)/4⌋)`; past tier 24, power ×1.06^(t−24); ×2 walls every 5th, ×1.2 defenses every 10th | `trials.json` |
| Trial reward | `25% × hall's min raid loot × (1 + 0.1·log₂ t)`, once; 5 Jade every 10th tier | `trials.json` |

## How to change it (GAME THEORY AI checklist)

1. Change a constant in `progression.json` or `trials.json`. Never change a number in code.
2. Run `npm test`. The progression-model tests say which invariant broke.
3. Run `npm run docs:progression` to regenerate `ROSTER.md` and the icon manifest.
4. To make a planned warrior playable: add it to `troops.json` with stats from `warriorStats()`, add its unlock to `hall.json`, implement its ability in `sim/battle/battle.ts` (deterministic, with a test in `tests/gameplay/battle/`), then remove "planned" by adding `liveTroop` in `roster.json`. The calibration test then keeps it honest.
5. Keep Keep levels 7–15, Shadow Ink and heroes behind a save migration (`SAVE_VERSION`) and a `PROTOCOL_VERSION` bump if the server must know.
