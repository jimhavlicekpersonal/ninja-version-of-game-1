# GT: content, game design, game theory and strategy (release bulletproofing audit, 2026-11-21)

Audited commit `560ce7a` (HEAD). Read-only: no repository file was edited. Measurements ran in a scratch copy
(`git archive HEAD` plus `npm ci` under the session scratchpad). Scripts: `docs/audit/bulletproof-2026-11-21/evidence/gt/gt.ts`, `evidence/gt/run.mjs` and `evidence/gt/rep.mjs`
in that copy. They are not in the repo.

**What I ran**
- `npx vitest run tests/gameplay/balance`: 11 files, 105 tests pass (75 s). The slow files are not in this set.
- **Trial ladder probe** (`gt.ts trials`), tiers 1-66. Each tier used `trialBase(t, data, v)` for v 0-1 and two bot
  sides, with the raid bots' mix at the tier's own Keep, research at its caps and the hero. That is 4 battles a tier.
- **Luck probe** (`gt.ts luck`) at Keeps 6, 10 and 15. Bases were 5 generated layouts at level bias 0.5, with fixed
  bot deployments; only `setup.seed` changed, over 12 seeds a cell.
- **Multi-seed campaigns** (`evidence/gt/rep.mjs`): the `regular` campaign over 8 replicates through `ModelPlayer`'s own unused
  `rep` option (`tools/balance/playerModel.ts:67,108`). Rep 0 is the committed run. The `casual` campaign ran over 6
  replicates (reps 0-5).
- **Storage vs cost check** (python over `buildings.json`, `hall.json` and `troops.json`).
- Read: `campaign.json` / `CAMPAIGN.md` (fingerprint current, since `campaign-gates` passes) and `ARMY_BALANCE.md`. No
  combat data has changed since that file was generated on 2026-11-18: the only later `sim/battle` change is
  `3cd05a5`, the own-property `canDeploy` fix with valid battles unchanged.

**Labels from the earlier audit**
- D-2 (casual loss and late raiding) and D-4 (honor and Power) are named in the brief.
- D-1, D-3, D-5 and D-6 are **inferred**. Their most likely subjects:
  - D-1: defense does not matter late, and does nothing online (WORLDWIDE_AUDIT S1, P2-12).
  - D-3: one army wins, the "solved line" (S2).
  - D-5: the Trial ladder sawtooth, or the 3★ stake lottery.
  - D-6: war-chest free riding / alt feeding, or Power ≈ Keep.

## 1. Verdict table

| Item | Verdict | One-line evidence |
|---|---|---|
| Soft-lock: resources / economy | PASS | No demolish command exists (command list in `village.ts`). Collectors produce while upgrading. A refund debt is repaid by income (`src/gameplay/CLAUDE.md` Purchases). Max storage covers the largest cost at every Keep (Keep 14: 316.7M cap vs 24.1M for Keep 15; Keep 15: 490.9M vs 21.6M; research max 25.9M for `storm_sovereign` L12). |
| Soft-lock: builders / army empty | PASS | Garrison crew 2 (`economy.garrisonCrew`). Cancel refunds and is refused only when the refund would not fit. The daily drill pays with nothing spent (`drillEnd`, `daily.json drill`). The Trial catch-up tier exists (`trialCatchUpTier`). |
| Soft-lock: entryRoom | PASS | `sim/entryRoom.ts`: 6 of 8 approaches must stay open, refused at `place`/`move`. A raid that deploys nothing pays nothing (DECISIONS line 40). |
| Win/lose conditions trigger | PASS | `battle.ts:827-837`: `destroyed` at 100%, `time` at `durationSeconds` 180 × 10, `no_troops` when every warrior is dead with nothing left to deploy; `surrender` in `battleSession.ts:83,145`. Stars at `battle.ts:850-854` (50% / Keep / 100%). |
| Every Trial tier beatable | PARTIAL | Tier 58 is the measured ceiling for the bot mix (`trials.json $commentCap`, `TRIAL_CAP` 58). My probe: the last tier of most Keeps is **0/4 clears** for a capped own-Keep army (tiers 23, 27, 28, 32, 36, 40, 47, 48, 60, 62, 64), then the next tier is 100% (see GT-09). No solver proof exists, only fixed bot plans. |
| Generated bases never impossible | PASS | `entry-room.test.ts` holds that generated bases leave all 8 approaches open. Lab floor: every family ≥ 30% except `melee@8` and `support@8` (KNOWN_BELOW, `army-lab.test.ts:145`). |
| RNG fairness / seed reproducibility | PASS | The integer-only mulberry32 RNG (`rng.ts`). Server seeds come from `randomBytes(4)` (`server/nodeContext.ts:76`). The online seed is issued at `/attacks/start` after the stake (DECISIONS line 17). Offline seeds come from `scoutBattleSeed`; abandoning counts as a lost attack. |
| Seed noise (deploySpread 0.3) | PARTIAL | Seed-only destruction SD: K6 4.7, K10 9.3, K15 2.6. The star result differs from the modal result 29% / 16% / 8% of the time. Single cells reach SD 19.5 (K10, stars 0/1/2/3 = 1/5/3/3 from the seed alone) and a 6/12 three-star coin flip (K15). See GT-10. |
| Keep 3 dip | PASS (moved) | Regular K3 1.94★ ± 0.22 across 8 seeds (gate 1.2). **The casual dip moved to Keep 4**: 0.48★ and 31% won, pooled over 6 seeds and 29 raids (GT-02). |
| Keep 5→6 | PASS | Casual K5→6 is 9 days (CAMPAIGN.md: casual 5.7 → 14.7). The gate "≤ 21 days a stretch through Keep 10" passes. |
| Keep 15 cliff | FAIL (ungated) | Regular K14 1.72★ / 84% won → K15 1.25★ / 68% / 8% three-star (8-seed means). The drop of 0.47 ± 0.08 stars appears in every seed. The pair rule hides it (GT-08). |
| Trials "regressing tiers" | FAIL | The sawtooth goes from 0/4 to 4/4 at every Keep boundary (GT-09). |
| Warrior "regressing tiers" | FAIL | `TIER_KNOWN_BELOW` lists 12 newer-below-older pairs at K15 and `KIT_KNOWN_BELOW` lists 20 kits worth < +2 (`kits-tiers.test.ts:22-24`) (GT-04). |
| Air | FAIL | Air destruction (3★) by Keep from `ARMY_BALANCE.md`: K6 47 (0%), K7 47 (0%), K8 36 (0%), K10 49 (0%), K12 26 (0%), K15 44 (0%). It is the lowest or second-lowest at every Keep from 6 and costs about 2× the Provisions (K15 7.9M vs 4.0M for the mix) (GT-03). |
| Dominant / dominated strategies | FAIL | The raid-bot mix at K15 scores 84 against 69 for the next army. Keep 12 is a listed gap (`it.todo`, `kits-tiers.test.ts:67`). Air is dominated. Rushing is fastest (rusher Keep 15 day 100.2 vs 103.6) (GT-07, GT-03). |
| Degenerate: turtling / Keep rush / farming | PARTIAL | The farming bound passes (≤ 50% three-star). Sandbagging does not pay (gate). The fortress pays 26 days to Keep 15 (129.6 vs 103.6), but only Keep 12 is gated (GT-05). The rushed-Keep line and seals exist (`armyBehindKeep`, `claimKeepSeal`). |
| Intransitive counters | PARTIAL | Tempering gives "no army best on every profile at K15" (DECISIONS line 37), but Keep 12 is still a gap. The five live counters move armies by about −12 to +9 points; most cells are within ±3 (`ARMY_BALANCE.md`, counters table). The 20 planned rock-paper-scissors buildings are not live. |
| Early vs late scaling / power creep | FAIL | Newer tiers sit below older ones (GT-04). The late curve ×1.56 × 1.15^(K−6) is documented (DECISIONS line 31). |
| Attacker vs defender advantage | FAIL (late) | Held share at Keeps 13-15: regular 3% / 5% / 0%; defender 5% / 0% / 0%; fortress 44% / 31% / 12% (CAMPAIGN.md). The 8-seed regular Keep 15 held rate is 3% ± 4 (GT-05). |
| Scouting / information asymmetry | PASS | `scout.ts` never shows hidden traps or upgrading buildings as threats. The temper profile is shown (`ScoutReport.profile`). The rival-answer rule is on a Codex page (P6-18). |
| Commitment (3★ stake) | PARTIAL | 1.3 / 1.75 multipliers; a miss carries nothing (`raids.json stakes`). Stake UI text gives no hit rate (`locales/en/ui.json:174-179`). Seed lottery as above (GT-10). |
| Gangs / Alliances free riders | PARTIAL | A chest needs `chestMinAttacks` 1 (`server/core/groveRaid.ts:163-165,290-294`, `gangWars.ts:417-420`), but any attack counts, including a one-warrior attack, and the chest does not depend on contribution (GT-13). |
| Donations / collusion / alt feeding | NEEDS-PLAYERS | A device donor is refused for a server receiver (exploit #8). Uploaded-base loot is capped (#7). Server-village alts and troop gifts are uncapped beyond Lodge and storage caps (GT-17). |
| Win-trading / honor collusion | FAIL | A lost defense costs 0 honor (`ranks.json defenseHonorLossShare` 0, `pvp.ts:763-770`). Equal-honor wins pay +24 (`attackWin.base`). A Keep snipe under 30% gives the defender no shield (`shieldTiers` 30/60/90). Two accounts gain honor from each other with no loss (GT-01). |
| Kingmaking | PASS (N/A) | All wars are two-sided: Gang Wars 2v2-4v4 and Alliance pairings. |
| Griefing | PARTIAL | The leader hands over on leave (`groves.ts:105-115`). A token war attack spends one of the side's `attacksPerMember × roster` slots without contributing (GT-13). |
| Snowball / comeback | PASS (offline) | Shields 16/20/24 h, exhaustion ×0.5 over 36 h, upward loot penalty, `lossStreakSlack` (0.51-0.62× loot when abused, P2-10), catch-up raids ≤ 3. **Online none of the defense side applies** (P2-12, `src/main.ts:284 botRaids: !serverUrl`). |
| Quit incentives | PASS | Online, a started raid with no report becomes a forfeit after `REPORT_GRACE_MS` (`pvp.ts` match loop). Offline, `abandonBattle` is a lost attack (`sanitizeBattleSetup`). |
| Matchmaking algorithm fit | PARTIAL | Glicko-like AR/BR, K 40 → 16, RD 350 → 60 in about 24 battles (`ranks.json rating`, `rating.ts`). The convergence test uses synthetic skill (1200-1900) and ±0.15 noise (`rating-convergence.test.ts:37-51`). The power term uses the Keep, not research strength (`pvp.ts:362,780`). |
| Placement speed / uncertainty / decay | PASS (math) / NEEDS-PLAYERS | `rdShrinkPerBattle` 0.93 and `rdGrowthPerIdleDay` 6. Bots never move a rating (`pvp.ts:777-783`), so at low population nobody gets placed. |
| Inflation / seasons | PARTIAL | A monthly halving above 400 (`ranks.ts rollSeasons`) bounds honor. Honor still only rises on defense (GT-01). |
| Smurfing | NEEDS-PLAYERS | The rating picks the base nearest `matchTarget` 0.55 among real candidates, which protects weaker players. Unmeasured with a population. |
| Queue time at low population | PASS | A generated fallback always exists and is labelled (`pvp.ts:376-391`, `kind.generated` / `kind.rival`). |
| Bots labelled and not distorting rank | PARTIAL | They are labelled, and ratings are untouched, but **honor and the honor leaderboard are earned against generated bases** (`pvp.ts:756`, using `ticket.defenderTrophies`) (GT-01). |
| Leaderboard incentives (Goodhart) | FAIL | Honor = session count × wins (LD-2 still holds, `defense-raids.md:222`). Power = AR + 150 × (Keep − 1) (`rating.ts powerRating`) (GT-01, GT-12). |
| Risk vs reward | PASS | Stakes, the upward loot penalty and carry by stars. |
| Loss aversion, casual | FAIL | Casual players lose 0.98 ± 0.09 of what they loot (6 seeds, minimum 0.91); explorer 160%; casual_hires 106% (CAMPAIGN.md) (GT-06). |
| Sunk-cost traps | FAIL | Researching a newer tier that scores below the older one (GT-04). Air research at 2× cost (GT-03). |
| Streak pressure (a missed day never wipes it) | PASS | `daily.ts:67-82`: one free skip a week, then −1 step per missed day, never below 1. Tests `daily.test.ts:82,89`. The calendar loses nothing (`daily.json calendar $comment`). Note: 7+ missed days return the streak to step 1, which matches the rule. |
| Methods: multi-seed CIs | FAIL | `rep` exists but no tool uses it. My 8 seeds: regular Keep 15 day 103.7 ± 1.3 (95% CI), range 100.2-106.2, against gate ≥ 100 (GT-11). |
| Methods: adversarial attacker in CI | FAIL | Searches exist only in audit scripts (`docs/audit/balance-2026-11-08/scripts/design/coevo.ts`, `doctrine2.ts`). CI uses fixed bot plans only (GT-11). |
| Methods: defense-loss telemetry / human playtest | NEEDS-PLAYERS | No telemetry against the model. "Real-player playtests are still owed" (`campaign-gates.test.ts:12`). |
| Jade lifetime model | FAIL (tooling) | `campaign.json` has no moonstones field. The model only spends Jade on artisans (`playerModel.ts:179`) (GT-11). |
| Content runway | NEEDS-PLAYERS | Keep 15 at day 103.7 for regular, 179.4 casual, 207.4 explorer, 106.4 casual_queues. After that: research (< 1 year, `progression-model.test.ts`), Trials to about tier 58, weekly Gauntlet, monthly leagues (GT-15). |

## 2. Work items

### GT-01 — Honor is not zero-sum: no loss on defense, gains against generated bases, win-trading pays both sides (earlier D-4, LD-2; inferred D-6 in part)
- Severity: HIGH
- Status: FAIL
- Kind: DESIGN
- Compartment: gameplay/data, server
- Checklist refs: Checklist 17e (leaderboards), 17d (collusion and win-trading); Masterclass 17 Exploits and abuse; Goodhart's law
- Evidence:
  - `src/gameplay/data/ranks.json` sets `defenseHonorLossShare: 0`, and `ranks.ts defenseHonorLoss` returns 0, so a lost defense never costs honor.
  - `attackWin.base` 24 pays +24 at equal honor, with `perTrophyBelow` 0.25 only below.
  - `server/core/pvp.ts:756-770`: the attacker's honor delta uses `ticket.defenderTrophies`. For a generated base that is `base.trophies` from `opponentForRank`, near the attacker's own honor (`pvp.ts:378-391`). Honor therefore climbs against generated bases at 3 AM.
  - `pvp.ts:777-783`: "bots never move a rating". They do move honor.
  - A Keep-only snipe (1★ from `hallDestroyed`, `battle.ts:850-854`) under 30% destruction gives the defender no shield (`raids.json shieldTiers` 30/60/90). Only `recentTargets` (1 h) and exposure ordering stand between two colluding accounts.
  - Each account gains +24 a win and loses nothing when raided. `MAX_HONOR_FROM_ONE_ATTACKER` 40 (`pvp.ts:703`) caps only honor fed by **lost** raids.
  - League chests pay Jade by honor (`ranks.json leagues[].chest.moonstones` 10-200 a month), and three leagues give looks.
  - LD-2 "honor rewards session count" is re-confirmed in `docs/audit/understand-2026-11-16/defense-raids.md:222`.
- Fix:
  1. Set `ranks.json defenseHonorLossShare` to 0.5 (staked honor), keeping `defenderDailyHonorLossCap` 150. Gate it on the attacker having won at least 1★ with ≥ 30% destruction, so a snipe moves little.
  2. In `pvp.ts settle`, pay a generated-base win at most `attackWin.base × generatedHonorShare`, a new `ranks.json` key of about 0.5. Or exclude generated-base honor from the public board (keep a separate "practice honor"). State this on the result screen (Honesty).
  3. Give the defender a minimum shield after any raid that took ≥ 1★ (a new `shieldTiers` entry `{stars: 1, hours: 4}`). Or exclude a pair raided within 24 h from `findOpponents` (pair memory in `recentTargets`).
  4. Per-pair daily honor cap: at most `pairHonorPerDay` (e.g. 48) between the same two accounts in either direction.
  5. Re-measure: extend `rating-convergence.test.ts` into an honor-economy simulation with N players, a share of colluding pairs and generated-base fill at low population. Rerun `npm run balance:campaign`; the campaign's honor column feeds the matchmaker.
- Tests: a new `tests/backend/server/honor-collusion.test.ts`. Two accounts at equal honor raid each other 10 times in a day (Keep snipe, under 30%). Total honor gain ≤ the pair cap, and the sum of both accounts' honor change ≤ 0 net of generated-base wins. Also a sim test that `defenseHonorLoss(24) > 0`.
- Done when: in the honor simulation, a colluding pair gains ≤ 10% more honor a month than an honest pair with the same win rate. Generated-base wins give ≤ 50% of real-base honor. The honor board correlates with Attack Rating (Spearman ≥ 0.6) in the population simulation.
- Don't break:
  - Honor is a matchmaker input, so rerun `balance:campaign` and keep `campaign-gates`.
  - The `matchedKeep` / Next fee reads no honor (keep it so).
  - The server replays `settleOnlineAttack`, so note it in `docs/backend/REQUESTS.md` and `docs/PROTOCOL.md` if `AttackResponse` changes.
  - Under-13 board rules (DECISIONS line 13).
  - Generated opponents stay labelled.

### GT-02 — The casual early dip moved from Keep 3 to Keep 4 (days 2-6) and the gates cannot see it (earlier "Keep 3 dip")
- Severity: HIGH
- Status: FAIL
- Kind: TOOLING + DESIGN
- Compartment: tests, gameplay/data
- Checklist refs: Checklist 17c (difficulty spikes, D1-D14 window); Masterclass 4.8 Flow
- Evidence:
  - `docs/game-theory/CAMPAIGN.md`, casual: Keep 4 has 3 raids, 0.67★, 67% won; **Keep 5 has 7 raids, 0.57★, 43% won**. These are days 1.7 to 14.7.
  - casual_explorer Keep 4: 5 raids, 0.40★, **20% won**. casual_hires Keep 4: 0.67★; Keep 7: 50% won.
  - **6-seed casual pool:**

    | Keep | Raids | Stars | Won | Per seed |
    |---|---|---|---|---|
    | 4 | 29 | **0.48★** | **31%** | 3-7 raids a seed; one seed 0.14★ / 14% won |
    | 5 | 56 | 1.11★ | 59% | |
    | 6 | 73 | 1.29★ | 71% | |
    | 3 | 26 | 1.46★ | 77% | |

  - Regular Keep 3 is fixed (1.94 ± 0.22★ over 8 seeds).
  - `campaign-gates.test.ts:36,60-66`: `rows(id, minRaids = 5)` drops casual Keep 4 (3 raids). `pairs()` then joins Keep 3 (2.00★, 5 raids) with Keep 5 (0.57★, 7 raids), giving 1.17★, which passes 0.9. The explorer has no lower gate below Keep 8.
- Fix:
  1. Gates: in `campaign-gates.test.ts`, add a per-Keep floor for casual, casual_explorer and casual_hires at Keeps 3-7. Pool raids across replicates (see GT-11) rather than dropping low-count Keeps, and use a lower confidence bound: Wilson 90% lower bound of wins ≥ 0.5.
  2. Design: diagnose before tuning. Keep 4 already has `powerSlackByKeep[3]` 0.75 (Keep 5 has 0.25), so the Keep 4 dip probably comes from the army, not slack alone (inferred): a casual player one day after Keep 4 fields small camps and new-tier warriors at level 1, and does about one raid a day. Measure opponent Keep against army strength at casual Keep 4 (`CAMPAIGN.md` reads 3.3 against 3.15). Then try a Keep-4 `researchFloorKeeps` override, `newPlayer`-style easing for the first N raids after a Keep-up, or a faster Keep 4 research step (`troops.json` research seconds).
  3. Check that the casual suggested army at Keep 4-5 includes the newly unlocked roles. The explorer at Keep 4 scores 20% won with the newest warriors, which links to GT-04.
  4. Re-measure with `npm run balance:campaign` plus a 6-seed casual run (`rep`).
- Tests: the casual Keep 4 gate first. It fails today: 6-seed pool 0.48★ / 31% won; committed seed Keeps 4-5 0.60★ / 50%.
- Done when: casual, casual_explorer and casual_hires each reach ≥ 0.9★ and ≥ 55% wins at Keeps 4 and 5, pooled over ≥ 6 seeds, with a 90% lower bound ≥ 0.5 wins. The regular Keep 3 gate still passes.
- Don't break: the farming bound (≤ 50% three-star at Keeps ≥ 6); sandbagger ≥ regular days; slack changes ride the server's generated fallback (`pvp.ts:381`), so log them in `docs/backend/REQUESTS.md`; the campaign fingerprint.

### GT-03 — Air is a dominated family: weakest and most expensive from Keep 6 (earlier "Air")
- Severity: HIGH
- Status: FAIL
- Kind: DESIGN
- Compartment: gameplay/data
- Checklist refs: Checklist 17b (dominated strategies, usage matrix); Masterclass 17 Balance and counters
- Evidence:
  - `docs/game-theory/ARMY_BALANCE.md` (current: no combat data change since generation). Air (80% air + 20% melee) by Keep:

    | Keep | Destruction (3★) | Rank among 9 armies |
    |---|---|---|
    | 6 | 47 (0%) | 9th |
    | 7 | 47 (0%) | 9th |
    | 8 | 36 (0%) | 7th |
    | 10 | 49 (0%) | 8th |
    | 12 | **26 (0%)** | 9th, below the 30% family floor |
    | 15 | 44 (0%) | 7th |

  - Training costs about 2× the others: K15 7.9M Provisions vs 4.0M for the mix; K12 1.2M vs 0.6M.
  - `army-lab.test.ts:106` gates the family floor only at Keeps 7, 8 and 15, so air@12 = 26 is ungated. `army-lab.test.ts:98` gates air only from above (< 95%).
  - Live counters cut air another 12.3 points at K8 (counters table).
  - Five warriors (`owl_bomber`, `crane_glider`, `lantern_balloon`, `thunder_kite`, `dragon_kite_armada`; 10% of the roster), and `crane_glider<owl_bomber` is a regressing pair.
  - Air only wins against bases without anti-air (P2-03: 38 → 97% at K15). Rational players will not train it, and then the Sky Bow and Ballista have no real-player target (inferred).
- Fix:
  1. Rebalance the Sky role budget in `roster.json` / `progression.json` (efficiency 0.494, DECISIONS line 32). Raise it, or cut air Provisions cost (`troops.json levels[].cost.dew`) to parity with ground per destruction point. The target is the air family within 10 points of the median family at every lab Keep.
  2. Keep the anti-air counterplay: air ≤ 60% against a base with capped Sky Bows and Ballista.
  3. Run `node tools/progression/rolecut.mjs` for the Sky role.
  4. Then `npm run rules:snapshot`, bump `SIM_RULES` 8 → 9 and update the fingerprint in `tests/gameplay/battle/rules-version.test.ts`.
  5. Run `npm run balance:armies`, `npm run test:slow` (kits-tiers) and `npm run balance:campaign`.
- Tests: extend the family floor gate in `army-lab.test.ts` to Keeps 6, 10 and 12, and add a cost-efficiency gate: destruction per million Provisions for air ≥ 0.6× the mix's. Both fail today (air@12 26%; air@15 44/7.9 = 5.6 vs mix 84/4.0 = 21).
- Done when: air is ≥ 40% destruction at every lab Keep, ≥ 0.6× the mix's destruction-per-Provision, and ≤ 60% against capped anti-air. No army goes over the 92% / 60% gates.
- Don't break: the `SIM_RULES` bump after the snapshot; server deploys first (`docs/backend/REQUESTS.md`); raider mixes (`raidVillage` air raid); the `aura-cache.test.ts` re-pin needs the bump; `campaign-gates`.

### GT-04 — Newer warrior tiers score below older ones and 20 kits do nothing: unlocking is a sunk-cost trap (earlier "regressing tiers")
- Severity: HIGH
- Status: FAIL
- Kind: DESIGN
- Compartment: gameplay/data
- Checklist refs: Checklist 17b (power creep, early vs late scaling); Masterclass 17 Sunk cost
- Evidence:
  - `tests/gameplay/balance/kits-tiers.test.ts:22-24`: `TIER_KNOWN_BELOW` lists 12 pairs scoring below the previous tier at Keep 15, among them `storm_sovereign<moonblade_master`, `thousand_needle<chain_sickle_reaper`, `volcano_cannoneer<siege_bombardier`, `ghost_engineer<fuse_master` and `crane_glider<owl_bomber`.
  - `KIT_KNOWN_BELOW` lists 20 kits worth < +2 points.
  - Effect: casual_explorer (newest warrior of each family) 0.62★ / 38% won at Keep 15 and 0.71★ at Keep 12 (CAMPAIGN.md). The gate was lowered to 0.55 per pair / 0.75 mean with the 0.9 target **not met** (`campaign-gates.test.ts:86-94`, P4-09 partial).
  - Each newer tier still costs research up to 25.9M Provisions a level (`storm_sovereign` L12) and appears as progress in the Codex.
- Fix:
  1. For each `TIER_KNOWN_BELOW` pair, raise the newer warrior's `dpsScale` / hp in `roster.json` + `troops.json` until its K15 `kitValue` score is ≥ the older one's + 2. Do one role at a time with `node tools/progression/rolecut.mjs`.
  2. For each kit in `KIT_KNOWN_BELOW`, either strengthen it to ≥ +2 or remove it and fold its budget into stats. A kit that does nothing is misleading Codex text (Honesty).
  3. Rules: `npm run rules:snapshot`, then bump `SIM_RULES` (batch this with GT-03 into one bump).
  4. Re-measure with `npm run test:slow` (kits-tiers), `balance:armies` and `balance:campaign`.
- Tests: the lists in `kits-tiers.test.ts` already fail when an entry is fixed. Add a target test: `TIER_KNOWN_BELOW.size === 0` as `it.fails` today, plus the explorer mean gate restored to 0.9.
- Done when: `TIER_KNOWN_BELOW` and `KIT_KNOWN_BELOW` are empty; casual_explorer averages ≥ 0.9★ at Keeps 8-15 across ≥ 4 seeds; `progression-model.test.ts` "no dominance inside a tier" still passes.
- Don't break: the `SIM_RULES` bump after the snapshot; the original six units' stats through level 5 (`src/gameplay/CLAUDE.md`); the single-warrior < 85% gate (`kits-tiers.test.ts:58-62`); the farming bound; the server deploys first.

### GT-05 — Late defense barely matters, costs a month on the fortress path, and does nothing online (inferred earlier D-1; WORLDWIDE S1, P2-12)
- Severity: HIGH
- Status: FAIL
- Kind: DESIGN (+ server)
- Compartment: gameplay/data, server
- Checklist refs: Checklist 17b (attacker vs defender advantage, turtling), 17e (snowball/comeback); Masterclass 17 Balance
- Evidence:
  - `CAMPAIGN.md` "Is defense worth building?": held at Keeps 12/13/14/15 is regular 13/3/5/0%, regular_defender (counters first) 4/5/0/0%, fortress 69/44/31/**12%**.
  - 8-seed regular Keep 15 held: 3% ± 4.
  - The fortress reaches Keep 15 on day 129.6 against 100.2 for the rusher (1.29×). The gate checks only Keep 12, at ≤ 1.25× (`campaign-gates.test.ts:157-159`).
  - The defender policy loses 57% of its loot vs the regular's 51%, so building counters first is worse.
  - **Online, no raids reach a village except real players'**: `src/main.ts:284 botRaids: !serverUrl`; P2-12 not built (`docs/backend/REQUESTS.md:11,23`). The released game therefore runs 11-13% faster than every gated campaign, and all defense tuning is offline-only.
  - Raids with a server re-simulate real attacks only (`pvp.ts`). The hold reward is never paid for real raids (by design, against alt trading).
- Fix:
  1. Ship P2-12 (BACKEND), or explicitly scope launch campaigns to "no bot raids online". Add an `online` campaign policy (`botRaids: false`) so the gated numbers describe the build that ships.
  2. Late defense return: from Keep 12, raise `raids.json carryByStars[0..1]`, the share a raider carries at 0-1★ (today 0.2 / 0.5), so a near-capped base loses less. Or scale `defenseWin.shareOfRaidLoot` by Keep within the 17% cap (do not raise it without `daily_live.ts`, owner decision 2026-11-20).
  3. Add a Keep 15 fortress gate: fortress Keep 15 day ≤ 1.2× the rusher's. Add a held-share gate for regular_defender at Keeps 12-15 of ≥ 15%.
  4. Re-measure with `npm run balance:campaign` over multi-seed (GT-11) and `docs/audit/understand-2026-11-16/scripts/defense-raids/daily_live.ts`.
- Tests: a gate in `campaign-gates.test.ts` that regular_defender's held share at Keeps 12-15 ≥ 0.15. It fails today: 0.02, from (27×4 + 37×5 + 39×0 + 36×0)/139.
- Done when: defender held ≥ 15% at Keeps 12-15 and fortress Keep 15 ≤ 1.2× the rusher's days, both over ≥ 4 seeds; P2-12 live, or an online campaign gated; defense rewards ≤ 1/5 of a regular day's raid loot (`daily_live.ts`).
- Don't break: `defenseWin.shareOfRaidLoot` is an owner decision; hold rewards never come from real raids (alt trading); "the fortress loses ≤ 0.62× the rusher's share" gate; the casual loss (GT-06) must not rise; the server replays `applyDefense` (`docs/backend/REQUESTS.md`).

### GT-06 — Casual players lose about what they loot, and late raiding is a small share of income (earlier D-2)
- Severity: HIGH
- Status: FAIL
- Kind: DESIGN
- Compartment: gameplay/data
- Checklist refs: Checklist 17f (risk and reward, loss aversion); Masterclass 17 Loss aversion
- Evidence:
  - `CAMPAIGN.md` totals, stolen ÷ looted: casual 96% (368M of 382M), casual_explorer **160%**, casual_hires 106%, casual_queues 58%.
  - Across seeds: casual 0.98 ± 0.09 (6 seeds, range 0.91-1.16); regular 0.53 ± 0.03 (8 seeds).
  - The gate is "regular < 0.8" only. Casual is explicitly "E26 open" (`campaign-gates.test.ts:130-134`).
  - Keep 15 economics, computed:
    - Collectors make 12 × 296,957 = 3.56M/h (`buildings.json` `acorn_orchard` / `dewdrop_well` L24).
    - A regular Keep 15 raid banks 5.12M against a 4.0M-Provision army (`ARMY_BALANCE.md` mix K15) trained in 6.6 h / 4.5 (Dojo L13 `trainingSpeed`) ≈ 1.47 h.
    - Net ≈ 1.1M a raid ≈ 0.76M per training hour, about 21% of collector income, before the 62-76% win rate.
    - The earlier audit's 170k/h (≈ 5%) used other assumptions. Either way raiding is a minority income late.
    - Raids against the regular village at Keep 15 take 6.9M each (30 raids), more than a raid nets.
  - Online this applies only to real-player raids (P2-12; see GT-05).
- Fix:
  1. Cap per-raid loss as a share of the casual player's daily production. Use a new `raids.json lossCapHoursOfProduction` (e.g. 6 h of their collectors) applied in `raidVillage` / `capBaseLoot` on top of `storageLootCapByHall`.
  2. Or extend `exhaustion`, so the second raid within 36 h on a one-visit player takes ×0.25.
  3. Raise late raid value: lower army Provisions cost at Keeps 13-15, or raise loot share. Re-measure the net per training hour (script in the scratch copy as a starting point).
  4. Run `npm run balance:campaign` with all casual policies over 6 seeds.
- Tests: a gate `casual.totals.stolen / casual.totals.looted < 0.6` and `casual_explorer < 0.8`. Both fail today (0.96 / 1.60).
- Done when: casual ≤ 0.6 and explorer ≤ 0.8 stolen ÷ looted (mean of ≥ 6 seeds); late raid net per training hour ≥ 25% of collector income at Keep 15; regular Keep 15 still 100-140 days.
- Don't break: the "fortress ≤ 0.62× rusher" gate; the farming bound; defense rewards ≤ 1/5 of a day's raid loot; `campaign-gates` fingerprint and bounds.

### GT-07 — One army wins: the raid-bot mix (= the Suggested army) dominates at Keep 15, and Keep 12 has one best answer to every temper (inferred earlier D-3; WORLDWIDE S2)
- Severity: MEDIUM
- Status: FAIL
- Kind: DESIGN
- Compartment: gameplay/data, gameplay/sim
- Checklist refs: Checklist 17b (equilibrium meta, "solved line"); Masterclass 17 Dominant strategies
- Evidence:
  - `ARMY_BALANCE.md` Keep 15: mix 84 (33%) against artillery 69, shadow 57, breach 53, support 51, light-support 50, air 44, melee 39, siege 37. Keep 12: mix 67 against 52 next.
  - `kits-tiers.test.ts:67` lists `it.todo('KNOWN GAP (P4-06): one army is best on all four temper profiles at Keep 12')`.
  - The casual "suggested army" is the raid bots' roles (`CAMPAIGN.md`), so the game itself recommends the dominant line.
  - An older searched mixed army reached 87-98% against every temper profile (`TEMPERING_CALIBRATION_2026-11-09.md:52,66`; rules 6-7, stale for rules 8).
  - Live counter effects move most cells by ±3 points (`ARMY_BALANCE.md` counters table).
  - WORLDWIDE_AUDIT "2026-11-20 exploit and strategy audit" S2 is OPEN.
- Fix:
  1. Keep 12: tune `battle.json temper` axes (Watch/Blast/Reach) until no army is best on all four profiles. Use the harness `docs/audit/balance-2026-11-08/scripts/design/temper_calibration.ts`.
  2. Make the Suggested army scout-aware (read `ScoutReport.profile`) rather than one mix.
  3. Pull GT-03 and GT-04 in first: they widen the viable set.
  4. Put a searched attacker in CI (GT-11).
  5. Bump `SIM_RULES` after `rules:snapshot`.
- Tests: turn the `it.todo` into a real test (per temper profile, the best army differs at Keep 12), and add an army-lab gate: at Keeps 12 and 15 at least 3 compositions within 10 points of the best.
- Done when: at Keeps 12 and 15, ≥ 3 of the 9 compositions are within 10 points of the best on untempered bases; no single army is best on all four profiles at Keeps 12 and 15 (lab, 4 seeds).
- Don't break: the 92% / 60% army gates; the single-warrior < 85% gate; rules bump procedure; generated rival tempers (`rivalTempers`) stay labelled; the server deploys first.

### GT-08 — The Keep 15 cliff is real in every seed, and the pair rule hides it (earlier "Keep 15 cliff gate", 4.8)
- Severity: MEDIUM
- Status: FAIL
- Kind: TOOLING + DESIGN
- Compartment: tests, gameplay/data
- Checklist refs: Checklist 17c (difficulty cliffs); Masterclass 4.8 Flow
- Evidence:
  - 8-seed regular means, Keep 14 → Keep 15: 1.72 → **1.25★** (drop 0.47 ± 0.08, min 0.33); 84% → 68% won; 3★ 8%.
  - The committed seed is the second-worst: 1.10★ / 62% / 3%.
  - regular_fortress Keep 15: 0.96★ / 57% / 0% three-star. casual_explorer Keep 15: 0.62★ / 38%.
  - `campaign-gates.test.ts:73-77` checks Keep 8+ pairs ≥ 1.2★. The Keep 14-15 pair is (87 × 1.69 + 61 × 1.10) / 148 = 1.45, which passes. Keep 15 alone is never gated at 1.2.
  - Cause (inferred): at Keep 15 `hallsAbove` cannot lift the base Keep, but honor (4,687) lifts the level bias to maxed Keep 15 bases, while army strength is capped at 14.0 (`attackerStrength`). `powerSlackByKeep[14]` = 0.5.
- Fix:
  1. Add a single-Keep lower bound for Keep 15 (regular, regular_defender, regular_fortress): ≥ 1.2★ and ≥ 65% won, pooled over seeds.
  2. Design options:
     - Raise `powerSlackByKeep[14]`.
     - Cap the honor-driven level bias at Keep 15 (`matchStrength` with `strengthJitter`).
     - Add Keep 15-only research headroom (troop level cap +1 via `levelCapOffset`), so the endgame has a climb.
  3. Re-measure with `balance:campaign` over multi-seed.
- Tests: the Keep 15 single-Keep gate. It fails today for the committed regular (1.10★, 62%) and fortress (0.96★, 57%).
- Done when: regular Keep 15 ≥ 1.4★ and ≥ 70% won (8-seed mean, lower 95% bound ≥ 1.25★); Keep 14→15 drop ≤ 0.25★; farming bound still holds.
- Don't break: the farming bound (≤ 50% three-star at any Keep ≥ 6 with ≥ 10 raids); matched-raid bounds (`matched.test.ts`); server fallback slack (`docs/backend/REQUESTS.md`).

### GT-09 — The Shadow Trials ladder is a sawtooth: each Keep's last tier is unclearable with a capped army, and the next tier is trivial (inferred earlier D-5 / "regressing tiers")
- Severity: MEDIUM
- Status: FAIL
- Kind: DESIGN
- Compartment: gameplay/sim, gameplay/data
- Checklist refs: Checklist 17a ("every Trial tier beatable", solver proof), 17c (spikes); Masterclass 4.8 Flow
- Evidence:
  - `sim/trials.ts:78-82`: `levelBias = within / (tiersPerHall − 1)`, so within each Keep the four tiers go from level bias 0 to 1.
  - My probe (capped raid-bot mix at the tier's Keep, hero, 4 battles a tier), average stars and clears:

    | Tier | Stars | Clears |
    |---|---|---|
    | 23 | 0.25★ | 0/4 |
    | 24 | 0.75★ | 1/4 |
    | **25** | **3.00★** | **4/4** |
    | 27 | 1.0★ | 0/4 |
    | 28 | 0.25★ | 0/4 |
    | **29** | **3.0★** | **4/4** |
    | 32 | 0.0★ | 0/4 |
    | **33** | **3.0★** | **4/4** |
    | 36 | 0.0★ | 0/4 |
    | 37 | 2.25★ | 3/4 |
    | 40 | 0.25★ | 0/4 |
    | **41** | **3.0★** | **4/4** |
    | 47 | 0.5★ | 0/4 |
    | 48 | 0.25★ | 0/4 |
    | **49** | **2.75★** | **4/4** |
    | 60 (elite) | 0.25★ | 0/4 |
    | 62 | 0.25★ | 0/4 |
    | 64 | 0.25★ | 0/4 |
    | 65 | 2.0★ | 4/4 |

  - Clears need 2★ (`trials.json starsToClear` 2). Rewards grow with the tier while difficulty does not (`rewardLog2Growth`).
  - No test proves each tier is clearable by any plan. The bot plan is weak (humans do better), but no search exists.
- Fix:
  1. Spread level bias over the ladder rather than resetting per Keep. For example, tier t uses Keep `floor((t − 1) / tiersPerHall) + 1` with bias `0.25 + 0.5 × within / 3`, and tier 4k+1 starts at the bias where tier 4k ended, minus the new Keep's step.
  2. Or order tiers by measured difficulty: compute `defenseStrength × layoutPower × power` (`trials.ts:61-75`) and require it non-decreasing.
  3. Add a CI proof with a small search over infiltration points: best of 6 points × 2 orders × 2 seeds ≥ 2★ for every tier ≤ the documented cap, with an army at the tier's Keep caps.
  4. Re-measure the probe and `achievements-reachable.test.ts TRIAL_CAP`.
- Tests:
  - A monotonicity gate in `tests/gameplay/balance/`: mean destruction of the capped bot mix over 4 battles never rises more than 15 points from tier t to t+1 inside 1-60. It fails today: 32 → 33 is +66, 28 → 29 is +58.
  - A clearability gate: best-of-search ≥ 2★ for tiers ≤ 58.
- Done when: both gates pass; tier 58 is still the measured ceiling or is re-documented; Trial looks (20/40/55) are still reachable (`achievements-reachable.test.ts`).
- Don't break: `trials.test.ts` (growth, no skipping, rewards once, forged bases ignored); `trialEnd` seeds from `trialBattleSeed`; the campaign fingerprint includes Trials (the model plays them), so rerun `balance:campaign`; no `SIM_RULES` change unless the battle rules change (the base is generated data, not combat data).

### GT-10 — A declared 3★ stake is partly a lottery and the stake screen shows no odds (17g)
- Severity: MEDIUM
- Status: PARTIAL
- Kind: DESIGN + UI request
- Compartment: gameplay/data (+ presentation request)
- Checklist refs: Checklist 17f (randomness and skill, commitment); Masterclass 17 Risk, reward, randomness
- Evidence:
  - The deploy jitter `battle.json deploySpread` 0.3 is drawn from `sim.rng` (`battle.ts:306-308`). Further `sim.rng` draws are at `battle.ts:668-669,725` and crits at `warriors.ts:338`.
  - My luck probe (fixed deployments, battle seed only, 12 seeds a cell):
    - Destruction SD: K6 4.7, K10 9.3, K15 2.6. Results off the modal star count: 29% / 16% / 8%.
    - Worst cells: K15 base0 side-2 gave 6/12 three-star (coin flip). K10 base3 side-2 gave stars 0/1/2/3 = 1/5/3/3, SD 19.5. K10 base0 side-2 gave 10/12 three-star, side-1 only 1/12.
  - Stakes 1.3 / 1.75: break-even hit rates 77% / 57% (`raids.json stakes $commentP208`). The regular 3★ rate at Keep 15 is 8% ± 4 over 8 seeds.
  - The UI text (`locales/en/ui.json:174-179`) shows no hit rate.
  - The server comment "a guessed seed predicts a raid's win or loss about 98% of the time" (`pvp.ts` match) holds for win/loss, not 3★.
- Fix:
  1. Either drop `deploySpread` to 0.15 (rules bump; re-measure seed SD), or keep it and show "your last 10 raids reached 3★ N times" on the stake picker (`recentRaidRates` exists for tasks). Request the display from presentation in `docs/art/REQUESTS.md`, text via `t()`.
  2. Consider making the 3★ stake pay partial (×0.5) at 2★ instead of 0. Re-measure EV with the P2-08 harness.
  3. Add the luck probe to the slow suite (12 seeds × 5 bases × K6/10/15).
- Tests: a slow test that for the capped bot mix on 5 bases, the seed-only share of 3★ results that flip vs the modal result is ≤ 10% at K10 and K15. It fails today at K10 (16%).
- Done when: seed-only star flips ≤ 10% at Keeps 6/10/15, or the stake screen shows the player's own recent hit rate; EV of a 3★ stake for the bot plan stays < 1 (no free money).
- Don't break: any `deploySpread` change is combat data (`rules:snapshot` then a `SIM_RULES` bump); the online stake is fixed at `/attacks/start` before the seed; `stakeMet` is shared with the server.

### GT-11 — Methods gap: single-seed campaigns, no searched attacker in CI, no Jade lifetime model, no telemetry plan (17h)
- Severity: MEDIUM
- Status: FAIL
- Kind: TOOLING
- Compartment: tools/progression, tests (tools/balance)
- Checklist refs: Checklist 17h (methods); Masterclass 17 Methods
- Evidence:
  - `ModelPlayer` has `rep` (`tools/balance/playerModel.ts:67,108`), but `tools/balance/campaign.ts` and `run-campaigns.mjs` never pass it.
  - My 8 regular seeds:

    | Measure | Mean ± 95% CI | Range |
    |---|---|---|
    | Keep 12 day | 49.9 ± 1.0 | 47.4-51.6 |
    | Keep 15 day | 103.7 ± 1.3 | 100.2-106.2 (gate ≥ 100: one seed sits on the bound) |
    | Keep 15 stars | 1.25 ± 0.11 | 1.07-1.44 (committed seed 1.10) |
    | Keep 15 three-star | 0.08 ± 0.04 | 0.01-0.18 |
    | Keep 3 stars | 1.94 ± 0.16 | 1.40-2.14 (gate 1.2) |

  - My 6 casual seeds:
    - Keep 15 day 176.9, range 166.4-183.4 (committed seed 179.4).
    - Keep 6 day 14.7-19.7.
    - Keep 4 cells of 3-7 raids that swing 0.14-0.75★ between seeds.

  - So single-seed gates such as "Keep 3 ≥ 1.2" and "Keep 15 day ≥ 100" sit inside one-seed noise.
  - No adversarial search in CI: searches live only in `docs/audit/balance-2026-11-08/scripts/design/coevo.ts`, `doctrine2.ts` and `defence_math/*`.
  - No Jade field in `campaign.json`. The model only buys artisans (`playerModel.ts:179`).
  - No online defense-loss telemetry. "Real-player playtests are still owed" (`campaign-gates.test.ts:12`).
- Fix:
  1. `tools/balance/campaign.ts`: add `reps` (default 4 in CI, 8 for releases). Write per-Keep means, SDs and pooled raids to `campaign.json`. Make `campaign-gates.test.ts` read pooled rows and use lower confidence bounds. Run reps in parallel processes as `run-campaigns.mjs` already does.
  2. `tools/balance/search.ts`: a deterministic best-of-N attacker (infiltration point × squad order × 2 seeds). Gate in slow tests: searched destruction ≤ 95% on capped same-Keep bases at K8/12/15, and Trial clearability (GT-09).
  3. Track Jade in `KeepRow` / totals: earned by source (chest, streak, calendar, tasks, Scroll free, leagues, wars, Trials, achievements) and spent. Add the Jade lifetime table to `CAMPAIGN.md`.
  4. Telemetry request (BACKEND / owner, adults who opt in only): per-Keep raid stars, defense held share and stolen ÷ looted, compared with campaign bands.
- Tests: `campaign-gates.test.ts` "reps ≥ 4 and every gate reads pooled rows", and a Jade table present in `campaign.json`.
- Done when: CI campaigns run ≥ 4 seeds, with gates on pooled lower bounds; the searched attacker runs in `test:slow`; the Jade lifetime table is generated; a telemetry spec is in `docs/backend/REQUESTS.md`.
- Don't break: the campaign fingerprint (extend `SOURCES` if new files feed it); CI time (about 3 min a seed set on 4 cores; mine took ~15 min for 8 regular seeds on 4 cores); privacy (opt-in adult statistics only, random id).

### GT-12 — The Power Ranking is mostly Keep, and the rating's power term uses the Keep, not research (earlier D-4)
- Severity: MEDIUM
- Status: PARTIAL
- Kind: DESIGN
- Compartment: gameplay/sim, server
- Checklist refs: Checklist 17e (ranking fit, Goodhart)
- Evidence:
  - `rating.ts powerRating` = `attack.rating + powerWeight × (keep − 1)`, with `ranks.json rating.powerWeight` 150. Keep 1 → 15 adds 2,100 points; the convergence test's whole skill spread is 700 (`rating-convergence.test.ts:38`).
  - Bots never move AR (`pvp.ts:777-783`), so at low population AR stays 1500 and the board is Keep order. `powerBoardMinBattles` 5 counts rated (real) battles only (inferred from rating path).
  - `orderByRating` / `rateBattle` pass `me.hallLevel` / `ticket.base.hallLevel` as power (`pvp.ts:362,580,780`). A Jade-rushed Keep with level-1 research reads as full power, so its expected score is overstated and its AR falls.
- Fix:
  1. Use the attacker's `attackerStrength` (on the server, the stored village's) as power in `expectedScore`, and the base's defense strength (`defenseStrength`-like) for the defender.
  2. Power board: rank by AR within Keep bands, or lower `powerWeight` on the board only (e.g. 50).
  3. Rerun `rating-convergence.test.ts`, extended with mixed Keeps 3-15 and noise from the measured luck SD (GT-10).
- Tests: convergence with Keeps 3-15: Spearman(Power board, true skill) within each Keep band ≥ 0.85, and the board's top 10% includes ≥ 30% players below Keep 15 with top-decile skill (inferred target).
- Done when: the extended convergence test passes and the Power board is shown as "skill within your Keep band".
- Don't break: the server uses the same functions, so changing `rating` numbers changes live matchmaking (note it in `docs/backend/REQUESTS.md`); bots never move a rating; under-13 board rules.

### GT-13 — War chests reward a token attack (free riders and slot griefing) (inferred earlier D-6 in part; E14)
- Severity: LOW
- Status: PARTIAL
- Kind: DESIGN
- Compartment: server, gameplay/data
- Checklist refs: Checklist 17d (free riders, griefing); Masterclass 17 Multiplayer incentives
- Evidence:
  - `server/core/groveRaid.ts:163-165` (`foughtIn` counts attacks) and `gangWars.ts:419-420`: any reported attack qualifies, even one warrior. The chest is the same for every member by outcome (`social.json groveRaid.rewards`, `gangWar`).
  - A side's attack cap is `roster × attacksPerMember` (`groveRaid.ts:45-47`), so a token attack burns a team slot.
  - Alt Gangs fighting each other still pay 3-15 Jade a war (WORLDWIDE #10 Limits).
- Fix:
  1. Count an attack toward `chestMinAttacks` only if it deployed ≥ `minDeployShare` (0.8, as in `lossStreakSlack`) of the camp housing or won ≥ 1★.
  2. Scale the chest by own stars: a base share plus a per-star share.
  3. Server-side check on the re-simulated `result.used`.
- Tests: a server test that a war attack deploying one warrior does not unlock the chest. It fails today.
- Done when: the test passes; Alliance and Gang War chests split ≥ 30% by own stars; a generated-Gang war pays no Jade (already true).
- Don't break: protocol and contract tests (`docs/PROTOCOL.md`); `claimGangChest` replay; chests are never sold and never random.

### GT-14 — Rating placement and smurf handling unproven at launch population
- Severity: LOW
- Status: NEEDS-PLAYERS
- Kind: TOOLING
- Compartment: tests, server
- Checklist refs: Checklist 17e (placement speed, uncertainty, smurfing, queue at low population)
- Evidence:
  - `rdShrinkPerBattle` 0.93 takes RD from 350 to 60 in about 24 rated battles. Only real-player raids rate (`pvp.ts:777-783`).
  - The convergence test samples a full Keep 3-6 population of 120 with ±0.15 outcome noise (`rating-convergence.test.ts:31-51`), smaller than the measured luck (GT-10).
  - No simulation covers 10-50 concurrent players or smurfs (a skilled player held at a low Keep).
- Fix:
  1. Extend `rating-convergence.test.ts` with a sparse-population mode (20 players over Keeps 3-15, 70% generated fill), a smurf cohort and measured noise. Assert that smurfs' victims see an expected score ≤ 0.7.
  2. Plan an online measurement (telemetry) of rated battles a player per week.
- Tests: the sparse-population simulation.
- Done when: smurfs face expected ≤ 0.7 against same-Keep players within 10 battles in the simulation; telemetry spec exists.
- Don't break: `rating` numbers are shared with the server.

### GT-15 — Content runway after Keep 15 is thin for a regular player (≈ day 104)
- Severity: LOW
- Status: NEEDS-PLAYERS
- Kind: DESIGN
- Compartment: gameplay/data
- Checklist refs: Checklist 17 content runway
- Evidence:
  - Keep 15 at day 103.7 ± 1.3 (regular, 8 seeds), 106.4 casual_queues, 179.4 casual, 207.4 explorer (`CAMPAIGN.md`).
  - After that: research to caps (Keep 15 bot-mix caps ≈ 290M Provisions ≈ 6.8 days of income, economy E23); the roster under a year (`progression-model.test.ts`); Trials to about tier 58 (`TRIAL_CAP`); weekly Gauntlet; monthly leagues.
  - Mastery has no stat bonus (DECISIONS line 71). Fifteen counters, three heroes and the Hero Hall are built but not live (P4-10).
- Fix:
  1. Decide the go-live order for built-not-live content (`tests/gameplay/planned/golive-gate.test.ts`).
  2. Model hours of play per day per policy in the campaign (sessions × minutes) to state the runway in hours.
- Tests: none until a playtest; record the runway in `PROGRESSION_MODEL.md`.
- Done when: the owner has a runway figure from the campaign plus a playtest plan.
- Don't break: built-not-live content stays behind `withPreview` until its gate passes.

### GT-16 — Smoke Bomb, the signature tactic, adds little
- Severity: LOW
- Status: PARTIAL
- Kind: DESIGN
- Compartment: gameplay/data
- Checklist refs: Checklist 17b (dominated abilities)
- Evidence: P4-03 is open. Smoke gain under Rally B is +0.9 to +4.3 points (`PROGRESS.md:80`). The rule is unchanged (DECISIONS line 79).
- Fix: tune `battle.json` smoke (`range × 0.4`, 8 s, charges) toward +6 to +8 points at K10/15, measured with the P4-03 harness; batch it into the GT-03/04 rules bump.
- Tests: a slow test gating smoke's gain ≥ +5 at K10 and K15.
- Done when: that gate passes and the farming bound holds.
- Don't break: the `SIM_RULES` procedure; `tactics.test.ts` limits.

### GT-17 — Alt-account feeding through server villages and troop gifts is bounded only by caps
- Severity: LOW
- Status: NEEDS-PLAYERS
- Kind: DESIGN
- Compartment: server
- Checklist refs: Checklist 17d (collusion, alt accounts)
- Evidence:
  - Uploaded-base loot is capped (exploit #7) and device donors are refused (#8). A **server-held** alt village still pays real loot up to `storageLootCapByHall` (9.6M at Keep 15) when raided. Lodge gifts move trained troops.
  - Honor feeding by lost raids is capped at 40 a day a pair (`pvp.ts:703`). Resource feeding has no per-pair cap.
  - Matchmaking is random at low population, so pairs meet by chance (inferred).
- Fix:
  1. A per-pair daily loot cap (attacker ← same defender) on the server.
  2. A flag on pairs with repeated mutual raids or donations for staff review (`/admin`).
  3. Measure with telemetry.
- Tests: a server test that a second raid on the same defender within 24 h pays ≤ the pair cap.
- Done when: the pair cap is live; the staff tool shows the pair report.
- Don't break: the exhaustion rule (already halves repeat loot); privacy rules on what staff see.

## 3. Verified sound

- **Battle end conditions** (`battle.ts:827-848`): destroyed / time (180 s × 10 ticks) / no_troops, plus surrender. Smoke charges are separate from `remaining`, so unused smoke does not stop `no_troops`. Stars at `battle.ts:850-854`.
- **Deterministic, integer-only RNG** (`rng.ts` mulberry32, `mixSeed`). Server seeds are `crypto.randomBytes` (`server/nodeContext.ts:76`). Trial, bounty and rematch seeds must come from the village's window (exploit L4).
- **No economic soft-lock**:
  - No demolish/sell command.
  - The largest single cost fits max storage at every Keep 1-15 (Keep 1: 4.5k cap vs 1k; Keep 14: 316.7M vs 24.1M Keep 15 cost; research max 25.9M vs 490.9M).
  - Refund debts are repaid by income.
  - The daily drill pays without spending warriors.
  - `trialCatchUpTier` lifts a late starter out of trivial tiers.
- **Missed days never wipe a streak** (`daily.ts:67-82`: one free skip a week, then one step per missed day, never below step 1; `daily.test.ts:82,89`). The 28-day calendar loses nothing on a miss.
- **Quit = forfeit**: online, an unreported started raid is settled as a loss (`pvp.ts` match loop, `REPORT_GRACE_MS`). Offline, `abandonBattle` counts as a lost attack.
- **Generated opponents are labelled**: `kind.generated` / `kind.rival`, Gauntlet and festival "(generated)" (`locales/en/ui.json:70-71,269-273,307`). Server fallback rival outposts keep `kind: 'bot'` (`pvp.ts:383-391`).
- **Bots never move a rating** (`pvp.ts:777-783`). A generated Gang war pays no Jade (`social.json gangWar.generatedOpponentJade` false).
- **Queue dilution (LD-1) closed**: `attackerStrength` is housing-weighted over the fighting army only (`matchmaking.ts:126-150`).
- **Sandbagging does not pay**: gate passes; sandbagger Keep 15 day 106 vs regular 103.6.
- **Loss-streak slack is not a farm**: the 0.51-0.62× loot-per-army record (WORLDWIDE P2-10) and the camp-housing rule (`matchmaking.ts:168-186`).
- **Honor inflation is bounded per season** (`ranks.ts rollSeasons`: halving above 400, `seasonCatchUpMax` 2).
- **Layouts must leave a way in** (`entryRoom.ts`); generated bases keep all 8 approaches (`entry-room.test.ts`).
- **The balance suite is green at HEAD**: `tests/gameplay/balance` 11 files / 105 tests, including `campaign-gates` (fingerprint current) and `rating-convergence`.
- **Regular pace is stable across seeds**: Keep 12 day 49.9 ± 1.0, Keep 15 day 103.7 ± 1.3, stolen ÷ looted 0.53 ± 0.03 (8 seeds, 95% CI).
- **Regular Keep 3 is no longer a cliff**: 1.94 ± 0.16★ across 8 seeds (gate 1.2); one seed gave 1.40.
