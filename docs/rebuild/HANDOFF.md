# Handoff: Kagemura rebuild (2026-11-02)

## Repos

- **Home:** `jimhavlicekpersonal/ninja-version-of-game-1`, branch `main`. It holds the full history: the original Toadstool Kingdoms commits, the rebuild commits, and the repo's initial README commit merged in.
- **Origin:** `jimhavlicekpersonal/toadstool-kingdoms`. Branch `ninja-rebuild` has the same rebuild; its `main` is untouched. Do new work in the ninja repo.
- **Pages:** in the ninja repo, Settings → Pages → Source: **GitHub Actions**. Then every push to `main` publishes https://jimhavlicekpersonal.github.io/ninja-version-of-game-1/

## What works (verified)

| Area | Status | How it was verified |
|---|---|---|
| Three compartments + boundary rules | Done | `tests/architecture/boundaries.test.ts` |
| Ninja identity: names, descriptions, chat, tutorial, menus, icons, palette, music | Done | Full UI walk-through at 390×844 |
| Procedural art: Japanese buildings with 3 visual tiers each, chibi ninja troops, kunai/shuriken/firework projectiles | Done | Art gallery (`npm run art`) and in-game screenshots |
| Village: build (through the Build menu), upgrade, skip, collect, move | Kept, working | Browser playthrough |
| Train → scout (with scout report) → raid → results → loot banked → troops spent | Working | Browser playthrough, 0 console errors |
| **Smoke Bomb**: marked area with time left; range ×0.4, never below 2 tiles; 8 s; 1–3 charges from army size; no stacking | Working | `tactics.test.ts` (7 tests) + live taps in the browser |
| **Sabotage**: Saboteur jams a defense 6 s (dimmed, jam marker, recovery ring), then 10 s immunity; one jam each; can't keep a defense silent | Working | `tactics.test.ts` + browser (`jammed now 1`) |
| Early sabotage then main attack through the normal troop bar | Working | Saboteur card is first; tactic hint shown |
| Five opponent layout archetypes (Kunai Ring, Walled Keep, Mortar Core, Twin Gates, Open Courtyard) | Working | Used by Shadow Trials; scout tips differ per layout |
| **Shadow Trials** (endless difficulty): 24 tiers through every Keep level, then +6% per tier forever, modifiers every 5/10 tiers, reward once per tier | Working | `trials.test.ts` (11 tests) + browser |
| Rewards: no duplicates (trial tier paid once; battle banked once; rapid taps can't double-throw smoke) | Working | tests above + `interrupted.test.ts` |
| **Interrupted raids** play out on next launch, banked once | Working | `interrupted.test.ts` + browser reload mid-raid |
| Save v9 → v10 migration; save and reload | Working | `trials.test.ts`, `migration-full.test.ts`, browser reload |
| Multiplayer server and protocol v3 (abilities) | Kept, working in tests | 52 backend tests locally; GitHub CI `server` job (Postgres + contract test) green on this branch |
| Practice opponents clearly labelled | Done | "Practice target · Generated rival (offline)", "(simulated raider)", "Shadow Trial" |
| Progression model + 50 warriors + 4 heroes + 34 buildings | Design complete, 6 warriors live | `progression-model.test.ts`: the model reproduces the live troops within 3% |
| Icon manifest (504 images) + ART AI brief + real-art loader | Done | `npm run docs:progression`; `public/art/manifest.json` loads in game |
| Mobile sizes | Checked | 390×844, 360×640, 844×390 screenshots |

**Checks (original rebuild):** `npm test`: 42 files, 286 tests, all passing. `npm run build`, `npm run typecheck:server` and `npm run server:build` all pass.

## Not verified here (needs your devices or accounts)

- Real phones (Pixel 7, iPhone) and 60 fps on a mid-range device: only headless Chromium at phone sizes was used.
- Sound and music by ear (synthesized; checked only that it compiles and plays without errors).
- iOS / Android native builds, TestFlight, StoreKit sandbox purchase.
- GitHub Pages deploy: it depends on the Pages setting above.

## Defensive depth and clarity pass (2026-11-03)

Roadmap: 1 clarify systems → 2 five defensive counters → 3 measure army balance → 4 progression flow → 5 external playtest. Steps 1–3 are done; 4–5 are next.

1. **Clarity.** The Codex said "Unlocked" from the Keep level alone. `troopUnlock()` (`sim/army.ts`) now checks Keep and Dojo, and the Codex and Army list both use it. The Codex has tier/role/status filters, an "N of 50 unlocked" count and a "Next:" line. The Army list shows unlocked warriors by default. In battle, abilities and counters show short floating callouts.
2. **Five counters live in combat** (`sim/battle/fortifications.ts`): Paper Lantern Line (stealth detection), Clockwork Repair Crane (jam recovery), Bitter Incense Burner (anti-healing), Kite-Cutter Ballista (anti-air control), Longbow Yagura (artillery counter). The Yagura's designed range of 8 could never reach a Siege Bombardier (range 11), so its range is now 13. Code-drawn art, scout chips and tips are included. Protocol is now **v5** (the server must be redeployed). Tests: `counters.test.ts` (21).
3. **Army balance.** `npm run balance:armies` writes `docs/game-theory/ARMY_BALANCE.md` (7 equal-housing compositions × Keeps 4–15 × 6 layouts × 3 seeds, with and without counters). Findings:
   - **Fixed:** from Keep 9 every composition scored 100% / 3★. Building levels past Keep 6 grew ~1.17×/Keep while armies grew ~1.4×. Levels first unlocked after Keep 6 now get HP and damage × 1.56 × 1.15^(Keep − 6). Keep 1–6 numbers are unchanged.
   - **Fixed: Air won ~100% at every Keep.** Flyers had a full power budget but skip walls and every ground-only defense, and they wiped out the 8 anti-air buildings with half the flock still alive. Air troops now have 0.45× HP and 0.75× damage (Sky role efficiency 0.85 → 0.494, HP/DPS 4.5 → 2.7). Kite Raider is included, so it no longer keeps its original level 1–5 stats. The Sky Bow Tower goes to level 10 with a third tower from Keep 11, and Sky Bow and Ballista HP is ×1.6. Air now scores 37–91% (it was 97–100%).
   - **Open: artillery-heavy is now the strongest army** (84–93%), and the counters barely touch it (0–3 points). It is mostly 3.5-range skirmishers (Shuriken Storm cleave) behind a front line. The Yagura only prefers range ≥ 4 and arrives at Keep 12. Options: Mortar splash/coverage earlier, or `prefersBeyond: 3.5`.
   - Support-heavy (42–74%) and Shadow (41–76%) are the weakest. The counters cost them the most at Keeps 8–15 (Incense 5–15 points, Lantern 5–9).
4. **Placement strategy (Infiltration Points).** Brute force used to work: dump the whole army at one spot. Now warriors enter only through the base's 6 points, and each point hides a third of the army, so a full army needs at least 3 squads. The scout panel shows how many defenses cover each path. Measured on the same armies and bases: mixed squads beat single-type squads by 8–25 points, and the best approach beats the worst by 15–40. Everything through one point lands a third of the army and fails. A planned attack was now too easy (84–91%), so defense damage is ×1.3 and HP ×1.15 at every level. Also fixed: troop cards showed ×0 during attacks (they were refreshed by display name instead of troop id).
   - **Open: Keep 9** is ~90–100% for every plan (Tier 3 power spike); placement doesn't matter there yet.
5. **Next (progression flow):** retrain presets (save the last army; needs a `SAVE_VERSION` bump), a clearer next objective on the HUD, teaching Trials (one counter per tier with a hint), and extending the model player's pacing check through Keep 15 (with the new late-Keep curve).
6. **Next (external playtest):** real-phone performance (Pixel 7 / iPhone), interrupted battles on protocol v5, save recovery from a corrupt slot, update flow for the service worker, and a hosted server verified end to end.

## Gameplay audit fixes (2026-11-03)

An external gameplay audit of `c457aa7` (37 findings, 4,435 simulated battles, two 300-day campaigns) was fixed in one pass. The root `CLAUDE.md` has the finding → fix → test table. Highlights:

- **Settlement and lifecycle:** online raid losses come out of the collector that lost them; research, task days and league seasons settle while the game is open; overnight work counts for the day it finished; donated troops keep their level; counters are off while upgrading (and scouting agrees); results and rewards report what was really banked and what overflowed, with a warning before one-time claims; replays carry the battle rules (`SIM_RULES`) and stale ones are shown as unavailable; Alliance War attacks are protected against interruption and replayable.
- **Online authority (protocol 6):** online loot is banked only from the server's answer (refused = practice); tickets are idempotent; uploaded bases must be legal for their Keep; armies must be trainable at the attacker's Keep (donated troops within the Lodge); wars pair equal rosters with a side attack cap and a destruction tiebreak. Time skips and the free test store live only in the testing sandbox (`?sandbox`).
- **AI and teaching:** Repair Cranes and Incense Burners are generated next to defenses; wall-breakers break only the wall in their way and the Siege Bombardier fires on defenses; healers break through when every ally is walled in; the tutorial teaches smoke over your warriors (what the rule rewards).
- **Pacing:** Dojo training speed and a next-army queue (a full late army refills in about 1.5 h, was 13 h); batch training, saved armies, retrain-last, dismiss, practice battles; research lanes and one research curve for all 50 warriors (the roster maxes in about 268 days, was 2,462); tasks only from what's possible; Keep-scaled Season Scroll rewards; leagues to 5,200 honor and achievements to Keep 15; Shadow Trials use median-strength fortresses, layout factors and an alternate fortress after a failure.
- **Balance and measurement:** opponents never fall below the attacker's earned strength; Throwers pay for range (0.7× damage), DPS taxes on the Bombardier, Thousand Needle and Hawk Tamer, kite kit trims (the Dragon Kite now outperforms the Thunder Kite), a control-tower Ballista, and a measured mid-Keep defense bump. Keep 7 was a hole the audit's Keep 7 raids showed (27/27 three stars): its bases fielded Keep 6 levels while armies gained two research levels and a new tier, so Keep 7 now unlocks Kunai Tower level 9, Shuriken Pagoda level 8 and Firework Mortar level 6, the step into the late-Keep curve is smoothed, and `attackerStrength` reads a new tier's level 1 at its research-scale level, so fresh Keep 7 warriors meet Keep 7 bases. The army lab measures counters by switching only their effects off (same bases and entry points), reports investment and counter activity, and outcome gates guard the matrix. The model player has defender, explorer and engaged (Trials, tasks, pass) policies; `npm run balance:campaign` writes `docs/game-theory/CAMPAIGN.md`.

Measured after the fixes (`ARMY_BALANCE.md`, `CAMPAIGN.md`): see those files. What the audit asked for that stays an **owner decision**: whether online play is trusted-local or competitive (a competitive launch needs a server-side inventory/research/timer ledger, protocol 7), and a real web/Play payment path.

Further checks from the audit, now handled: the last deployments are saved at once when the app is hidden or closed; a failed save shows a warning; a flyer grounded by a Ballista can set off traps; the Ballista's catalog matchups list only flyers, and the Repair Crane really answers the Hawk Tamer (it cuts the slowing short). Not yet covered: an automated check that every Infiltration Point is reachable on unusually dense player bases.

## Unfinished (prioritised)

1. **Make more warriors live.** 44 of 50 are design-only. Each needs `troops.json` stats from `warriorStats()`, Dojo/Keep gating, and its ability in the battle sim with a test. Suggested next five: Herbalist (heal), Ram Crew (wall bonus), Shadow Stalker (stealth), Hound Handler (summons), Twin-Fang Dancer (cleave).
2. **Keep levels 7–15**, Shadow Ink, the new buildings (Scroll Library first) and heroes (**Shadow Captain**). There is no hero system yet. Each needs a save migration.
3. **Mastery EXP** is in the model and docs but not yet tracked in the live game.
4. **Scroll-theft mission**: the first alternative objective, now that standard raids work.
5. **Real art:** hand `docs/art/ART_AI_BRIEF.md` + `ICON_MANIFEST.json` to an ART session. Live items first.
6. Owner steps: turn on Pages (above); trademark search for "Kagemura"; new bundle id and store listings when ready (`docs/SHIPPING.md`); host the server; Google Play Billing decision.

## Online features: honest status

Real PvP, real Alliances and Alliance Wars work **only with a hosted server** (`VITE_SERVER_URL` or Settings → Online play). Without one, everything social is bot-driven and labelled as practice. Smoke Bombs work online (protocol v3), but the server must be deployed from this branch: a v2 server would score smoke battles differently, so v3 clients refuse it.

## Next sessions

Use `AGENTS.md`: start a new Claude session per compartment with the prompt in its row. Each session works on its own branch, and an INTEGRATION session merges them.
