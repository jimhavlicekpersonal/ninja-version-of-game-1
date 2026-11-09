# Implementation note: Tempering (implemented 2026-11-09)

> **Status: implemented** on the owner's request (battle rules 6, save v21, protocol 11). The code is the reference now: `src/gameplay/sim/battle/temper.ts`, `battle.json` `temper`, the `temper` command and `temperQuote` in `sim/village.ts`, scouting in `sim/battle/scout.ts`, rival outposts in `sim/matchmaking.ts`, server validation in `server/core/pvp.ts`, the HUD panel in `ui/hud.ts`, tests `tests/gameplay/battle/temper.test.ts`. What changed from this note: tempers are set **per building type** with one command (not points bought per level); the numbers were re-calibrated on the real simulation (`TEMPERING_CALIBRATION_2026-11-09.md`; the round-3 prototype values were not power-neutral); the Sky re-budget was dropped (measured unnecessary); rules 5 and 4 stay compatible because an untempered base plays exactly as before. The text below is the original plan, kept as history.
>
> Design and measurements: [`DESIGN_TEMPERING_2026-11-08.md`](DESIGN_TEMPERING_2026-11-08.md). Audit it answers: [`docs/audit/BALANCE_AUDIT_2026-11-08.md`](../audit/BALANCE_AUDIT_2026-11-08.md). Prototype scripts: `docs/audit/balance-2026-11-08/scripts/design/temper.ts` (round 3 values), `equilibrium.mjs`, `counter_hook.patch`. Written against commit `64eafb5` + the audit commits; revalidate file paths and line numbers before editing.

## 0. One-paragraph summary for the implementer

Each defence level buys one **temper point** the owner places on a three-way scale per building type: **Reach**, **Blast**, **Watch**. Points re-shape the building's existing stats at a fixed power budget (they never add power). `createBattle` derives each building's effective combat stats from its level stats plus its temper. Untempered buildings play exactly as today. The base's power-weighted temper profile is shown at scouting. Generated rival bases carry tempers chosen by a pure function of the player's recent raids. Attack-side counterplay (deployment width) already exists and needs no code.

## 1. Owner, compartments and contracts

| Part | Compartment | Files |
|---|---|---|
| Rules, data, commands, save, generated bases | GAME THEORY | `src/gameplay/sim/**`, `src/gameplay/data/battle.json`, `buildings.json` |
| Building sheet slider, scout card, Codex page, text | GUI & INTERACTION | `src/presentation/ui/hud.ts` (building sheet section `// ---- building sheet`), scouting panel, `locales/en/ui.json` |
| Server validation, replay, protocol | BACKEND | `server/core/pvp.ts` (`normalizeBase`), `server/rules/`, `docs/PROTOCOL.md`, `src/backend/net/protocol.ts` |
| Contract changes | INTEGRATION | `sim/serverEconomy.ts` (`PLAYER_COMMANDS`, `Economy`), `control/controller.ts` command surface |

Follow `AGENTS.md`: GAME THEORY lands sim + data first; ask BACKEND through `docs/backend/REQUESTS.md`; the server deploys before the game.

## 2. Recommended prerequisites (separate, smaller changes)

Ship these first; Tempering's gates assume them.

1. **Fielded strength:** `attackerStrength` (`sim/matchmaking.ts`) weights each type by its housing in `state.army` and ignores `state.training`. Test: queuing a unit never lowers strength.
2. **No warriors, no reward:** in `battleEnd` (`sim/village.ts`), if `Object.keys(result.used)` minus `setup.hero?.id` is empty, record the battle as practice (no loot, honor or shield change). Mirror in the server report check.

## 3. Data schema (all numbers in data; none in code)

Add to `src/gameplay/data/battle.json` (illustrative: the real file is strict JSON, so move the `//` notes into `$comment` keys):

```jsonc
"temper": {
  "$comment": "Tempering (IMPLEMENTATION_NOTE_TEMPERING.md). Per full-weight axis (fraction f = points / level, 0..1). Penalties are additive across axes: damage x (1 - sum(cost_i x f_i)).",
  "retemperCostShare": 0.05,            // Coins: share of the building's cumulative Coin cost
  "types": {
    "acorn_cannon": {                    // Kunai Tower
      "reach": { "range": 2, "damageCost": 0.20, "preferFarAt": 0.5, "prefersBeyond": 3.5 },
      "blast": { "splashRadius": 0.5, "fireSlow": 0.8, "damageCost": 0.20 },
      "watch": { "damageCost": 0.10 }
    },
    "wasp_nest": {                       // Shuriken Tower (no Blast in phase 1: unmeasured)
      "reach": { "range": 2, "damageCost": 0.20, "preferFarAt": 0.5, "prefersBeyond": 3.5 },
      "watch": { "damageCost": 0.10 }
    }
  },
  "baseWide": {
    "$comment": "Driven by the base profile (power-weighted mean f over tempered buildings).",
    "blast": { "pinecone_catapult": { "damage": 0.15 } },
    "watch": {
      "firefly_tower": { "damage": 0.30, "fireFaster": 0.40 },
      "bitter_incense_burner": { "radius": 2, "cutAdd": 0.50 },
      "thorn_snare": { "damage": 1.00 }
    }
  },
  "rivals": { "$comment": "home profile per rival clan id; offers sample around the counter to the player's recent raids", "spread": 0.25, "counterShare": 0.5, "recentRaids": 10 }
}
```

The values are the measured round-3 prototype (`temper3_K*.out`) except where marked unmeasured. Tuning to the gates (section 9) is expected to change them. **Volley (fire rate) and stealth detection were measured as non-levers and are deliberately absent.**

Companion troop change measured as necessary for the cycle to close: Sky role tiers 1–4 (`owl_bomber`, `crane_glider`, `lantern_balloon`, `thunder_kite`) HP and damage ×1.25 at every level. Do **not** buff `dragon_kite_armada` (it reached 100 % against five of seven profiles with the buff). Regenerate via `node tools/progression/rolecut.mjs` so the progression model stays consistent, then fix `progression-model.test.ts` expectations if the role budget moves.

## 4. Types

`src/gameplay/sim/types.ts`:

```ts
export interface Temper { reach?: number; blast?: number; watch?: number }   // non-negative integers
export interface Building { /* existing */ temper?: Temper }                 // OMIT the key when untempered
export interface TemperCfg { /* mirrors battle.json temper */ }
// Command union:
| { type: 'temper'; buildingType: BuildingType; temper: Temper }
```

`src/gameplay/sim/battle/types.ts`: `BaseBuilding.temper?: Temper`; `ScoutReport.profile?: { reach: number; blast: number; watch: number }`.

**Hash invariant:** `canonicalJson` (`sim/serverEconomy.ts`) skips `undefined` keys, so an untempered village hashes exactly as today **only if the key is absent**. Never write `temper: {}` or zeros; delete the key when all axes are 0.

## 5. Pure functions to add (new file `src/gameplay/sim/battle/temper.ts`)

```ts
export function validTemper(type: string, level: number, t: Temper | undefined, data: GameData): boolean
//   every axis allowed for the type (data.battle.temper.types[type]); integers >= 0; sum <= level.
export function temperFractions(level: number, t?: Temper): { reach: number; blast: number; watch: number }
//   points / max(1, level); all 0 when t is absent.
export function temperedCombat(def: BuildingDef, ld: LevelDef, t: Temper | undefined, cfg: TemperCfg):
    { combat: CombatDef; damage: number; effect: BuildingEffect | null }
//   range += Σ axis.range·f; splashRadius = max(existing, blast.splashRadius·f_blast);
//   fireIntervalTicks = round(base · (1 + blast.fireSlow·f_blast));
//   damage = ld.damage · (1 − Σ axis.damageCost·f_axis)   // additive, per DESIGN gate 4
//   if f_reach >= reach.preferFarAt: effect = merge(def.effect, { kind:'counter_artillery', prefersBeyond })
export function baseProfile(base: BaseLayout, data: GameData): { reach: number; blast: number; watch: number }
//   Σ(level · f_axis) / Σ level over buildings whose type is in cfg.types (0s when none tempered).
export function applyBaseWide(buildings: SimBuilding[], profile, cfg): void
//   scales damage / fire interval / effect radius and cuts of the listed types by (1 + value·profile_axis).
```

Arithmetic must stay within + − × ÷ and √ (battle determinism rule; `tests/gameplay/sim/purity.test.ts`). Use `Math.round` only on integers already used by the sim (fire intervals are integers today).

## 6. Edits, in order

1. **`sim/battle/battle.ts` `createBattle`** (where `combat:` is built from `def.combat` and `ld.damage`): call `temperedCombat(def, ld, bb.temper, cfg)` for defences, then after the `buildings` array exists call `applyBaseWide(buildings, baseProfile(setup.base, data), cfg)`. Keep the existing `setup.base.power` multiplier on top (Trials). No other battle code changes: splash, counter_artillery preference and fire intervals already exist in `stepDefense` / `stepProjectiles`.
2. **Bump `SIM_RULES` to 6** after running `npm run rules:snapshot` (archives rules 5 under `server/rules/v5`). `SIM_RULES_COMPATIBLE`: `[]` if the Sky buff ships in the same bump (records with air would replay differently), else `[5]` (a battle with no tempers is identical). Update `tests/gameplay/battle/rules-version.test.ts` fingerprint.
3. **`sim/village.ts`:** add `case 'temper'` → `temper(s, cmd, now, data)`: require at least one building of the type owned; `validTemper` for each building's level; charge `retemperCostShare` × cumulative Coin cost of each affected building (refuse with `NOT_ENOUGH_RESOURCES` and a top-up-compatible quote is *not* offered: re-tempering is not a top-up action); set or delete `temper` on every building of that type; no builder, no timer. When a building levels up, its existing points stay; the new point is untempered until the owner places it.
4. **`sim/serverEconomy.ts`:** add `'temper'` to `PLAYER_COMMANDS` (the server replays it). This is a contract change: tell BACKEND.
5. **`sim/save.ts`:** `SAVE_VERSION` 21 with an empty v20→v21 step (field optional) and a comment; extend `validateVillage` to reject invalid tempers (fail-safe: drop invalid `temper` keys on load rather than refusing the save; never lose progress).
6. **`sim/defense.ts` `villageToBase`:** copy `temper` onto each `BaseBuilding` (omit when absent).
7. **`sim/battle/basegen.ts` `generateOpponent`:** accept `opts.temper?: Temper | { profile: {reach,blast,watch} }`; distribute points per tower by `round(level · f)` with the remainder to the axis with the largest fraction (deterministic). `sim/trials.ts`: cycle profiles with layouts (tier t uses profile index t mod 4 including untempered) so the ladder teaches the triangle.
8. **`sim/rivals.ts` (or new `sim/temperOffer.ts`):** `temperOfferFor(state, seed, data)`: from the last `rivals.recentRaids` attack records in `state.battleLog`, compute the attacker's role mix; map to the counter profile (ranged-heavy → Reach, stacked melee/stealth/beast → Blast, air → Watch); with probability `counterShare` (seeded from `seed`) offer the counter ± `spread`, else a random point in the triangle. `opponentFor` passes it to `generateOpponent`. Same function on the server's generated fallback (`opponentForRank` callers).
9. **`sim/battle/scout.ts` `scoutReport`:** add `profile` from `baseProfile`. **`sim/suggest.ts`:** take the profile: Reach-heavy → shadows/blades stacked; Blast-heavy → throwers/air, spread wide; Watch-heavy → ground throwers + guardians. Text through `t()`.
10. **Server (BACKEND):** `server/core/pvp.ts` `normalizeBase` whitelists fields today and would **strip `temper`**: add it, validated with `validTemper`; `capBaseLoot` unaffected. `server/core/village.ts` and `villageImport.ts` call `villageToBase`, so they inherit step 6. Bump `PROTOCOL_VERSION` to 11, add `/v1/hello` feature `temper`, list `supportedRules: [6, …]`; a client below rules 6 must not receive tempered bases (existing `426 version_mismatch` path). Document in `docs/PROTOCOL.md` with contract tests in `tests/backend/contract`.
11. **GUI:** building sheet: a three-way slider (triangle or three steppers) for Kunai/Shuriken types showing points used/available, the Coin price and a live preview of range/splash/damage; scout card: triangle marker + "Reach N · Blast N · Watch N"; Codex page "Tempering"; defence log shows the attackers' role mix so owners know which way to slide. All strings via `t()` with English in `locales/en/ui.json`, then `npm run i18n:extract && npm run i18n:sync`.

## 7. Invariants to keep (from root `CLAUDE.md`)

- Battles replay exactly from seed + deployments; tempers are part of `BattleSetup.base`, so records carry them.
- Saves are versioned with a migration step; never drop progress.
- The server owns online truth: it validates tempers and replays the `temper` command.
- Honesty: generated rivals stay labelled; their tempers are shown, not hidden; the Codex states that rivals adapt to the player's recent armies.
- Money: re-tempering costs Coins only; never Jade, never sold, no offers keyed to it.

## 8. Tests to add or update

| Test | Asserts |
|---|---|
| `tests/gameplay/battle/temper.test.ts` (new) | untempered base ⇒ identical `stateHash` to rules-5 code path; `temperedCombat` budget: at every level, Σ damageCost·f applied additively; `validTemper` bounds; determinism across two runs |
| `tests/gameplay/sim/village.test.ts` | `temper` command charges the right Coins, sets/deletes the key, refuses invalid points, works without a builder |
| `tests/gameplay/sim/save.test.ts`, `migration-full.test.ts` | v20 save loads as v21 unchanged; invalid temper dropped on load |
| `tests/gameplay/sim/serverEconomy` / contract tests | `economyHash` unchanged for untempered villages; `temper` replays identically on server |
| `tests/gameplay/battle/rules-version.test.ts` | new fingerprint, `SIM_RULES` 6 |
| `tests/gameplay/balance/temper-gates.test.ts` (new, slow; may live behind the campaign-style fingerprint) | gates 1–6 below on a fixed panel |
| `tests/gameplay/balance/army-lab.test.ts`, `campaign-gates.test.ts` | rerun; regenerate `docs/game-theory/ARMY_BALANCE.md` and `CAMPAIGN.md` |

## 9. Acceptance gates (numeric; from DESIGN section 6)

Run the panel harness (`docs/audit/balance-2026-11-08/scripts/design/temper.ts`, adapted to the real implementation) at Keeps 8, 12, 15 with stacked and spread plans for every army, then `node equilibrium.mjs <matrix>`:

1. **Budget:** each pure profile's best-response value within ±3 destruction points of the others.
2. **No single answer:** no pure saddle point; mixed-equilibrium support ≥ 3 on both sides at every Keep ≥ 8. (Prototype: Keep 15 passes 3×3, Keep 12 fails 2×2.)
3. **Cycle:** each pure profile has a different best army; no army within 5 points of its best against all three.
4. **Continuity:** a 50/50 blend lands between its components ±5 for every panel army.
5. **Width lever:** spread beats stacked by ≥ 15 on at least one profile and loses by ≥ 10 on another. (Prototype: +30 vs Blast at Keep 15, −21 vs Reach at Keep 12.)
6. **Nothing dead:** every family ≥ 50 % against at least one pure profile at its Keep (siege needs its targeting fix first).

Also rerun: `npm test`, `npm run build`, `npm run typecheck:server`, `npm run server:build`, `npm run balance:armies`, `npm run balance:campaign`, `npm run status`.

## 10. Known gaps and open questions

- **Per-building heterogeneity is unmeasured.** The prototype tempered every Kunai/Shuriken Tower identically. Mixed tempers inside one base (e.g. two Reach towers facing the open approaches, two Blast towers on the core) may be stronger than any uniform profile; measure before shipping, and cap or price it if it dominates.
- **Shuriken Blast and Kunai anti-air under Watch** are design guesses, not measured.
- **Keep 12 equilibrium is 2×2.** The thrower line stays robust because air is weak there even with +25 %; expect one more tuning round on the Sky budget at Keeps 9–12.
- **Bot deployment plan only.** A human who chooses width and side well will extract more; gate 5 should be rechecked with a smarter scripted attacker.
- **Real-player bases** will cluster on whatever the meta counters; rival offers (step 8) and the defence log are what keep the population moving. Watch the online distribution of profiles after release.

## 11. Rollback

Data-only rollback: set every `damageCost`, `range`, `splashRadius`, `fireSlow` and base-wide value to 0 and every `types` entry empty; tempers then have no effect, battles equal rules 5 (keep the `SIM_RULES` 6 records replayable). The save field stays harmlessly. Full removal needs a v22 step that deletes `temper` keys and a `SIM_RULES` bump.
