# Rebuild analysis: Toadstool Kingdoms → Kagemura: Ninja Clans

**Source repo:** `jimhavlicekpersonal/toadstool-kingdoms` (branch `main`, commit `2970bf0`)
**Target repo:** `jimhavlicekpersonal/ninja-version-of-game-1`. It does not exist yet, and a cloud session can't create GitHub repositories. The work is on branch `ninja-rebuild` of the source repo. Create the empty repo and push that branch to it (see `HANDOFF.md`).

## 1. What already exists (audited 2026-11-02)

The project is not half-complete. It is at **Phase 6 of 6**, with 244 passing tests, a working production build, and a playable PWA.

| System | State | Notes |
|---|---|---|
| Village grid, placement, moving, obstacles | Working | 40×40 iso grid, `src/sim/village.ts` |
| Collectors, storage, builders, upgrade timers, skip/top-up | Working | Injected `Clock`, timestamp timers |
| Offline progress and bot raids against the player | Working | Fixed raid slots, shields, defense log with replays |
| Troop training, army camps, troop research (levels 1-5) | Working | Research lives in the Barracks (there is no separate research building) |
| Battle sim | Working | 10 tps, seeded RNG, A* around walls, wall breaking, traps, splash, air. Replays are exact. |
| Matchmaking, trophies, leagues, loot penalties | Working | 20-item balance pass, each item pinned by a test |
| Economy and monetization | Working | Store, offers, pass, cosmetics, daily chest, streaks, events. Mock payments on web, StoreKit 2 on iOS, **Android purchases disabled** |
| Social | Working (bots offline / real online) | Groves, chat, donations, weekly Grove Raid |
| PvP server | Working, but **not hosted** | Fastify + Postgres. Re-simulates every attack. Contract tests. |
| Native | Working, needs owner accounts | Capacitor 8 iOS/Android, TestFlight workflow |
| Heroes | **Missing** | Only Elder Toadstool skins exist. Shadow Captain is therefore deferred. |
| Nightsap (3rd soft currency) | **Defined but never used** | Unlocks at hall 7, but halls stop at 6 |
| Visible upgrade progression | **Missing** | One generated image per building type. Every level looks the same. |
| Real art loading | **Missing** | Asset keys and "skip if a texture exists" are in place, but there is no preload or manifest |
| Cloud saves / server-side economy | Not done (documented) | Villages are per device. Save codes move them. |

## 2. Pitfalls of the rebuild (ranked by damage if ignored)

1. **Rewriting from scratch.** Discarding a finished Phase 6 throws away 244 tests, server re-simulation, StoreKit and the balance pass. *Mitigation:* re-theme in place, keep every working system.
2. **Renaming internal IDs.** `acorns`, `dew`, `elder_toadstool`, `grove` and others are in v9 saves, Postgres rows, the wire protocol, stored replays and analytics. *Mitigation:* IDs stay, display names change. `docs/rebuild/ID_MAP.md` is the single lookup.
3. **Breaking determinism.** Smoke and sabotage change combat. If they are not part of `seed + deployments`, the server's re-simulation disagrees with the client and stored replays drift. *Mitigation:* abilities are recorded in the same deployment stream, use only integer ticks and + − × ÷ √, and `PROTOCOL_VERSION` goes 2 → 3.
4. **Silently changing old replays.** Save v7 already had to drop replays once because numbers changed. *Mitigation:* no existing troop or defense number changes. New content is additive.
5. **Balance tests pin numbers.** The model player, the dominance tests and the curve tests fail if a strong new troop arrives early. *Mitigation:* new troops are formula-derived and gated, and every new curve gets its own test.
6. **Everything is indexed by "6 halls".** `scoutFeeByHall`, `generatedLootByHall`, `rewardScaleByHall`, `hall.json`… A 50-warrior game and endless difficulty need more than 6 Keep levels. *Mitigation:* a formula-driven progression model (`progression.json`) that can be read at any level, with the live tables kept for levels 1-6.
7. **Infinite difficulty breaking the economy.** Unbounded HP or damage overflows the UI. Rewards per tier that grow linearly become a farm. *Mitigation:* difficulty grows geometrically at a slow rate (+6%/tier), every 5th tier adds a modifier, rewards grow logarithmically and are paid **once per tier**.
8. **Separate AI sessions colliding.** `hud.ts` (1,245 lines), `village.ts` (994) and `types.ts` are shared hotspots. *Mitigation:* three compartments, contract files, an import-boundary test that fails CI, one branch or worktree per AI, and a CLAUDE.md per compartment.
9. **IP proximity.** Ninja games sit close to famous franchises: hidden "villages" named after leaves or mist, Genin/Chunin/Jonin rank ladders, forehead-protector headbands, spiral clan symbols. CoC UI layouts are also off limits. *Mitigation:* original names (Kagemura, Clan Keep, Bamboo→Obsidian leagues), no copied ranks or symbols, and no manji symbols. Kamon-style crests are drawn from original geometry only.
10. **Store identity.** Changing the name or bundle ID creates a **new app**: new App Store Connect record, new product IDs, new StoreKit config. *Mitigation:* the display name changes now. The bundle ID and product IDs change only when you are ready to make a new App Store record (owner step).
11. **Bots presented as players.** The rules require clear labelling. *Mitigation:* every generated opponent says "Practice", trials say "Shadow Trial", and online-only features say "needs a server" when no server is set.
12. **Exploits from new mechanics.** Without limits, sabotage could chain-disable a defense forever, smoke could stack, and rapid taps could double-deploy or double-pay. *Mitigation:* finite charges, a recovery-immunity window after every sabotage, no smoke stacking, deploys validated in the sim, and trial rewards keyed by tier and paid once.
13. **Interrupted raids.** If the app is killed mid-battle, loot could be paid twice or lost. *Mitigation:* the existing flow banks the result once through the battle outbox. This is documented as a recovery rule and tested.
14. **Performance.** More units, smoke clouds and per-level building art on a mid-range phone. *Mitigation:* tier textures (3-4 per building, not 11), shared smoke texture, no per-frame allocation.
15. **The art pipeline is procedural only.** An ART AI that outputs PNGs needs keys, sizes and anchors. *Mitigation:* `docs/art/ASSET_KEYS.md`, an icon manifest, and a preload hook that loads files under the same keys.

## 3. Game mechanics that need to be rebuilt or upgraded

| # | Mechanic | Why | Where |
|---|---|---|---|
| 1 | Ability system (Smoke Bomb) | New action type in the replay stream: charges, area, duration, range floor | `gameplay/sim/battle` |
| 2 | Defense status effects | Disabled / recovering / immune states for sabotage | `gameplay/sim/battle` |
| 3 | Specialist troop (Saboteur) | Seeks defenses, uses a limited charge, then fights weakly | `gameplay/data/troops.json` |
| 4 | Troop roster scale | 6 live troops → a 50+ warrior catalog derived from one power-budget formula | `gameplay/data/progression.json` |
| 5 | Keep levels beyond 6 | Needed for the roster tiers and long progression. Defined by formula. | progression model |
| 6 | Warrior EXP / mastery | Long-tail progression beside research levels | progression model (design) |
| 7 | Endless difficulty (Shadow Trials) | Tier N = layout archetype × power multiplier × modifiers | `gameplay/sim/trials.ts` |
| 8 | Opponent layout archetypes | Each layout calls for different tactics (walls, kunai ring, mortar core, gates, open court) | `gameplay/sim/battle/layouts.ts` |
| 9 | Visible upgrade progression | Per-tier building art | `presentation/art` |
| 10 | Tutorial | New guide character and flow: build → train → raid with smoke and sabotage | `presentation/ui/tutorial.ts` |
| 11 | Hero (Shadow Captain) | No hero system exists. Deferred and fully specified in the roster. | future |
| 12 | Scroll-theft objective | First alternative mode, after standard raids are solid | future |
