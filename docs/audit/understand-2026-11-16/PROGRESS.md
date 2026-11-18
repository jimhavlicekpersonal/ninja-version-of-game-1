# Progress ledger: the 2026-11-16 replayability, game-theory, economy and publishability pass

The agent prompt is `docs/prompts/BEAST_MODE_2026-11-16.md`; this is its section 3.9 ledger. One row per work
item: status (`todo`, `doing`, `done`, `reverted`, `skipped: no longer true`, `open: needs owner`), the commit,
the before and after numbers, new or changed locale keys, and notes for the next session. A session that starts
reads this first; a session that runs out of context writes its state here before stopping.

Branch: `claude/magical-cray-wkpcl1`. It merged `origin/main` at `0c5eeb7` ("Harden game economy and battle
exploit handling", a partial fix of XPL-03/05/06 and the Trial `startDamage` refusal made by another session).

**Release note for every phase of this pass:** until the pass's last stored field has landed, no build of this
branch is released and no server holds villages written by it (section 3.2).

## Baseline (P0-01)

`npm ci` then `npm test` at `bb08e62` (main merged), Node 22.23.4, no Postgres: 204 files passed, 1 failed, 1
skipped; 1,939 tests passed, 1 failed, 19 skipped. The failure was main's `0c5eeb7`: the import refused to
confirm a verified purchase whose save relabelled its product, so the provenance test (written in that same
commit) expected 3,300 Jade and got 2,000. Fixed in Phase 0 (confirmation by transaction id; worth from the
server's own row). The prompt's baseline (205 files, 1,934 tests) predates `0c5eeb7`.

## Items

| Item | Status | Commit | Before → after | Locale keys | Notes |
|---|---|---|---|---|---|
| P0-01 | done | 80d180d | 205 files/1,934 tests at 9bf76af → 204 passed + 1 failed (main's 0c5eeb7) → fixed |  | Baseline above; main's import regression fixed in the Phase 0 commit |
| P0-02 | done | 80d180d | deploy check failed on ar/community.html → passes all 49 translated languages of a local build (vite preview) |  | tools/release/page-language.mjs; test in release-tools.test.ts |
| P0-03 | done | 80d180d | Postgres suites: 3 consecutive runs, 66 files / 692 tests each, 87-94 s, all green (local Postgres 16 + Redis 7, --maxWorkers=2) |  | 30 s test/hook timeout only when TEST_DATABASE_URL is set; --maxWorkers=2 in deploy.yml and server.yml. Not done: a template schema per worker (not needed for green). Not shown here: that the old 5 s limit fails on this machine |
| P0-04 | done (cause not found) | 80d180d | det.ts: Node 22.23.4, Node 24.22.3 (Dockerfile pin; also today's latest 24.x), 24.22.3 --no-turbofan --no-maglev, 24.22.3 --no-turbofan --no-maglev --no-sparkplug, 24.22.3 --jitless (bundled with esbuild) and 22 --jitless: all byte-identical to det-node22.txt (md5 231afcfc…). matched Keep 8 lag 0 = 2.167 |  | No engine fault found on any compiler tier of the pinned Node. .node-version (24.22.3) read by every workflow; Dockerfile pins the same (test). matched.test.ts asserts levels and opponent Keep before stars and prints each battle's hash. New pins tests/gameplay/battle/matchmaking-pins.test.ts, run a second time in CI with --no-turbofan --no-maglev. tk_desyncs_total alerts already existed. Step 6 (the 2.2 gate's one-star margin) is P4-08: not widened. Could not run: the GitHub runner itself (no Actions access from here) |
| P1-01 | done | 12561ca | premium Scroll, 20 tiers unlocked unclaimed, season roll: Jade +0, Coins +0 → every unclaimed free and premium tier granted at the roll, premium recorded on the purchase (refund takes it back), overflow reported, pass.lastSeason shown in the welcome back | ui:welcome.scrollEnded | Introduced the pass's one SAVE_VERSION bump (24). Save v24 also carries stats.timedUpgradesDone (P1-08) and keepReachedAt (P1-21); repairStats fills any STAT_KEYS counter on every load, so later counters need no second bump. NO BUILD OF THIS BRANCH MAY BE RELEASED until the pass's last stored field lands (section 3.2) |
| P1-02 | done | f82f2fd | the same look every season; an owner's look tier granted nothing while the estimate listed it → 8 seasonal looks by season number, repeatJade 60 for an owned one, estimate leaves owned looks out | data:cosmetics.hallSkins.{crimson_maple,snow_pine,indigo_tide,jade_bamboo,plum_blossom,golden_harvest,storm_cloud}.name | docs/store/LISTING.md reworded (no single look named) with a test against pass.json; docs/store/<code>/LISTING.md still name the Lantern Festival look: re-translate in the Phase 1 translation batch. Free Jade added: at most 60 a season, only for a returning Scroll buyer |
| P1-03 | done | c95cb86 | player doing everything reached tier 30 on day 19; 36% of points paid nothing → every 300 points past tier 30 pay 3,000 Coins + 3,000 Provisions × Keep scale, at most 17 a season (51,000 each at scale 1 against the free track's 90,000) | ui:pass.bonus.title, ui:pass.bonus.detail | No Jade; not in passPremiumValue. Not measured with r1.mjs (that harness hard-codes the audit's pass data); the bound against the free track supply is a test |
| P1-04 | done | 4c53e56 | four huts: offer fired for a 1,000-Jade hut with 650 Jade → no offer with four huts; two and three as before |  | canHireArtisan reads the bundle's Jade from offers.json |
| P1-05 | doing (first half done; open until P3-08) | ce12987 | Keep 15: '≈ 18,176 Jade' for $4.99 (65× the pack) → 260 Jade shown with the supplies listed by amount (guard on at Keeps 5, 10, 15; Keep 3 shows 1,407 = 5.0× the 280-Jade pack); reachable tiers follow the player's own pace (0.6 default in the first 3 days) |  | pass.json estimate {defaultPace 0.6, minDaysForPace 3, guardPackMultiple 6}. Second half after P3-08: re-check the supplies' price and the guard |
| P1-06 | done | 6dae78d | trialcap (raid bots' mix, maxed Keep 15, bot plan, hero; 2+ stars in ≥4 of 8 fortress/seed combos, every 2nd tier): growth 0.06 → last 58 (60: 2/8, 62: 2/8, 64: 1/8, 66: 0/8); 0.03 → 58 (62: 3/8, 64: 2/8); 0.02 → 58 (62: 3/8, 64: 2/8, 66: 0/8). Shipped 0.02; trial_walker [5,25,60,100] → [5,25,40,53]; taskMaxGrowth 1.1236 → 1.0404; rewards past tier 60 +0.3%/tier | messages:ui.an_endless_ladder… (changed) | The ladder's real wall is a maxed Keep 15 fortress at tier 60 (2/8 at zero growth): growth is not what ends it; a stronger Keep 15 army (Phase 4, mastery ranks) would. 'No top' line replaced by a true one reading the numbers from data. Reachability test tests/gameplay/balance/achievements-reachable.test.ts (TRIAL_CAP 58). Script: /tmp/claude-0/scr/trialcap.ts (not committed; same method as scripts/pacing/trialcap.mjs) |
| P1-07 | done | 6dae78d | Ironclad only ever on Open Courtyard (0 walls), doubled with Elite every 10th tier → Ironclad on Walled Keep tiers (offset 2), no tier with two modifiers in 1-120, three rival-temper modifiers | data:trials.modifiers.rival_*.{name,description} | trials.test.ts modifier pins restated (authorised) |
| P1-08 | done | ccc6272 | collect target vs a maxed village's hourly output: Keep 3 8,000 (2.1 h) → 23,000 (5.9 h); Keep 8 23,000 (0.4 h) → 340,000 (6 h); Keep 12 35,000 (0.08 h) → 2,500,000 (5.9 h); Keep 15 44,000 → 11,000,000. Upgrade tasks: 10 wall levels counted → 0 (stat timedUpgradesDone, save v24) |  | ofDailyProduction 0.25 with base/perHall as the floor; targets rounded to 2 significant digits without log10. Not run: scripts/retention/r1.mjs (that harness reads the audit's data shape) |
| P1-09 | done (mostly no longer true) | b0aeb17 | Revalidated: the device already showed the end date translated (de '21.11.2026, 00:00 UTC', ja, ar) through message-parameters kind utcBare; it relied on Date.parse of a truncated English date → read exactly by a regex (utcFragment in locales/runtime.ts), tested with Date.parse disabled |  | No new string. The reminder still carries the canonical English; delivery formats it (the prompt's 'pass the timestamp' was effectively already the design) |
| P1-10 | done | 2949be2 | 14 store products incl. the retired offer_rebuild → 13 (store.json storeProductIds, Products.storekit, SHIPPING table) |  | Confirmed nothing was sold: no store listing exists (SHIPPING section 6, owner steps open) and the offer rule has been retired since the re-audit. The retired offer rule stays in offers.json (grantPurchase of an old test record still works) |
| P1-11 | done | 0a99f87 | Keep 1 village cleared Trial 1-40 with startDamage and no army; a level-9 hero at Keep 1 three-starred Trial 1 → both refused (INVALID_BATTLE), also through replayVillage |  | sanitizeBattleSetup (village.ts): whitelist seed/base/army/levels/reinforcements/mastery, infiltration forced, hero = heroFor at most at its level, startDamage dropped; used in trialEnd, bountyEnd, rematchEnd, groveBattleEnd, abandonBattle, ticketless battleEnd. Trial clear, Bounty step and rematch win need warriors. 8 old tests deployed off the points: moved to pointDeploys (tests/gameplay/sim/helpers.ts) |
| P1-12 | done | 0a99f87 | 20 alternating commands on two old Bounty occurrences paid 700 Jade → refused |  | battleBegan(): record.at bounded below by battle length + raids.battleResumeHours (72; an interrupted Alliance War attack settles after the war, online-authority test). bountyEnd refuses an occurrence older than the stored one. rematchEnd and groveBattleEnd bounded too |
| P1-13 | done | 0a99f87 | forged save: 500 Jade → 280,500 after two commands; 3,000,000 seasons 9.1 s → stipend refused (main 0c5eeb7), topUp/armyPaid stripped, timer cost clamped, at most seasonCatchUpMax (2) chests, season 0 settles in ms |  | ranks.seasonCatchUpMax 2 (honest: a long absence pays the last two seasons, not every month); validateVillage: season integer ≥ 0, grove.settledWeek integer; settleRaids starts near now |
| P1-14 | done | 0a99f87 | Provisions −2,000 + 500 Jade → 0 + 500 Jade via top-up/train/cancel → top-up refused while a needed resource is negative |  |  |
| P1-15 | done | 0a99f87 | hero-only battleEnd was practice (free Next), hero-only abandon kept opponent+seed → both lost attacks (honor, shield, scout) |  | Server attack() forfeit was done in main 0c5eeb7. DZ-3 test restated (authorised: P1-15 changes the rule it pinned) |
| P1-16 | done | adbc983 | client picked tomorrow's chest (57 tries); main's 0c5eeb7 drew server entropy but the game never learned it and the log kept the client's value → outcome carries chestSalt, game applies it (setChestSalt), log keeps the replayed command |  | hello feature chest-entropy; docs/PROTOCOL.md 'Exploit fixes 2026-11-18'; contract test. main's attacks-economy chest test was vacuous (its batch reused seq 1-4, nothing applied): fixed with its own device |
| P1-17 | done | 6dae78d | Math.pow growth and floor(log2) rewards → repeated multiplication, exact log2 for powers of two, floor with 1e-7; rewards at tiers 2/4/16/32/64 pinned (550, 600, 4,900, 82,728, 3,886,154) |  | Trial bases change for tiers past 60 and modifier tiers: the server replays trialEnd with its own trialBase, so server and game deploy together (REQUESTS) |
| P1-18 | done | 0a99f87 | 3 Jade bought 50 Coins that stayed → the top-up buys Provisions for a Provisions-paid action |  |  |
| P1-19 | done | adbc983 | upgrade dated 11 h back started 11 h back → starts at now − 10 min (MAX_TIMER_BACKDATE_MS); other commands keep 12 h |  | Backend decision recorded in REQUESTS.md and PROTOCOL.md: the conservative bound. Cost: a timer command queued offline for hours is corrected on sync. Three tests that pinned the old bound or synced 6 h late restated (authorised: this item changes the rule) |
| P1-20 | done | adbc983 | missed stake shielded the defender 14-16 h and exhausted its stores; lost raids gave unlimited honor → no shield/exhaustion without loot; ≤ 40 honor per attacker per defender per UTC day |  | balance-round2.test.ts |
| P1-21 | done | 989ac53, 87bff7f | setProfile(null) unlocked a minor; donate 1.5 ok; groveBattleEnd trusted base and target → refused / rebuilt from enemyGrove |  | Left for the save bump (Phase 1 honesty batch): bountyEnd's Keep − 1 fortress choice needs the time the Keep finished (a stored field) |
| P1-22 | done | adbc983 | shared replay setup.mastery copied unchecked → dropped unless features.mastery; hero validated |  |  |
| P2-01 | partial | 8b072ca | per raid (typical raider, 24 raids a cell, storages half full; /tmp/claude-0/scr/def_live.ts reads the live record): net K5 lvl1/b0/b50/b100 −58/−37/−58/−71k → −23/−6/−6/−4k; K9 −940/−593/−469/−441k → −940/−482/−25/+33k; K12 −3823/−2032/−1776/−1682k → −3823/−1095/−184/+64k; K15 −22.5/−13.8/−10.7/−9.8M → −22.5/−8.3/−1.2/+0.15M. Full storages: caps base −9/−30/−196/−1077k. Daily (def_daily, one visit, live rules): K9 loss/day 0.90/0.64/0.19/0.16M; K12 3.89/1.75/1.06/0.81M; K15 21.9/8.2/4.0/3.3M (old: maxed K15 lost 29% more than caps−2). Max base reward/day (4 visits) K12 0.41M vs ~6.7M regular raid loot (6%), K15 3.4M vs ~25M (14%) |  | Criteria 1, 2, 4, 5, 6 hold. Criterion 3 NOT met (caps base within ±10% of a hold): half-full storages K5 −38%, K9 +28%, K12 +15%, K15 +5%; full −37..−45%; shareOfRaidLoot 0.15 kept (lowering it pushes the full-storage case further negative). Review 2026-11-18: PvP hold reward now once per attacker per defender per UTC day (e3faea0) |
| P2-02 | done | 8b072ca | raider a point mass at Keep−1's weakest at campaign honor, Keep+1 above 350×Keep honor → strength uniform over Keep−2..Keep−1 at every honor; never above the defender's Keep (test at honor 0/1,500/4,300/6,000, Keeps 5/9/12/15) |  | raids.test 'get stronger as the defender climbs' restated (authorised: this item changes the rule) |
| P2-03 | done | b8791c1 | avg destruction vs caps-1 bases, line/air/shadow-siege: K8 49/29/39%, K12 53/32/29%, K15 67/38/49%; all 20-85%. Air raid without anti-air: K8 29→47%, K12 32→57%, K15 38→97% |  | Keeps 1-6 keep the line only |
| P2-04 | done | 0c27555 | fortress: held K9-15 45%, stolen/looted 0.55x rusher, Keep 12 1.15x rusher (gates 37%, 0.62x, 1.25x) |  | KNOWN FAILING PS-1 replaced. Model keeps its last 10 raid records. CARRIED RED into Phase 3: regular K3 0.83★ + K3 cliff, casual K4 0.86★, defender K7 0.88★, casual K8 3★ 59% |
| P2-05 and P2-06 | done | 64b32b4 | share of stored resources lost (away.ts): 30 days away K9 30% full 96.6% → 24.9%, K12 93.7% → 15.9%; same for 3 and 7 days; full storages 7.5% / 4.8% |  | maxRaidsPerCatchUp 24→3; exhaustion window 24→36 h; round2-rules exhaustion test restated (authorised) |
| P2-07 | partial | ace7673 | 3★ rematch vs a normal raid (lost raids, 30% full): K5 0.33x→0.76-0.81x; K10 0.28x→0.81-1.26x; K12 0.26x→0.73-1.08x; K15 0.46x→1.07-1.96x; at 2.5★ 0.61-1.63x |  | recoverShare 1.0 (not 0.75). 3★ at Keep 5 pays 0.76-0.81x a normal raid with storages 30% full (target: a little more): NOT met at Keep 5; met at 10-15 for the typical case. Review fix e3faea0: Coins/Provisions only, capped at 2x storage loot cap, no future-dated records. Note (review #9): a lost bot raid + 3★ rematch now breaks even minus the army |
| P2-08 | done | 14c8a88 | two-star stake EV (regular, raid-weighted K5-15, bot plan) 0.658→0.777, three-star 0.131→0.184; casual 0.755→0.892; 80% hitter 0.88→1.04 |  | bot plan gains at Keeps 5 and 9 (regular), 5/14/15 (casual) |
| P2-09 | done | 822033b | bonus / avg raid banked, regular: K5 22.3→17.9%, K10 4.8→11.3%, K12 1.6→8.5%, K15 0.7→18.4%; all K5-15 within 6.8-18.4% |  | Keeps 5-15 6.8-18.7% (regular). Casual at Keep 5 (Cedar) 4% < 5%: gate is on the regular model's league. Storm/Ember/Obsidian 0.095 after the final campaign (37cebf3^) |
| P2-10 | done | e4266cd | deliberate-loss strategy (lose four, then raid) loot per army vs straight: K9 0.62x, K12 0.60x, K14 0.51x |  | device only; review fix e3faea0: deployment measured against camp housing (one-warrior armies no longer count); not re-measured per hour |
| P2-11 | done | fc1c03d | fee / mean offer K5 4.82→1.93%, K9 1.56%, K12 1.60%, K15 3.32→1.88% |  | review fix e3faea0: priced from Keep/army/research only (server and device share them); same fees at Keeps 5/9/12/15 |
| P2-12 | open | bb33c72 |  |  | NOT BUILT: design in docs/backend/REQUESTS.md. Online, defense does nothing until it ships |
| P2-13 | skipped | bee66b1 | regular and casual Keep days unchanged (0%) with towers/support payable in Provisions |  | optional; reverted: the model player never pays in Provisions, so the pace could not be measured (review #6) |
| P2-14 | done | 5371905 | fortress Keep 12 day 66 (1.34x rusher) without crew → 57.6-59 (1.15-1.17x) with crew 2; Keep 15 222.6 → 137.6-140.6. Regular Keep 15 day 114 |  | support joins the crew; second builder queue is P6-12 |
| P2-15 | done | 5364aed | first raid (Dojo 1, one role) carried 85% → 100%; one-role army at Keep 5 still 85% |  | result screen reads record.carry; showing the share before the raid is P6-13 |
| P3-01 | todo | | | | |
| P3-02 | todo | | | | |
| P3-03 | todo | | | | |
| P3-04 | todo | | | | |
| P3-05 | todo | | | | |
| P3-06 | todo | | | | |
| P3-07 | todo | | | | |
| P3-08 | todo | | | | |
| P3-09 | todo | | | | |
| P3-10 | todo | | | | |
| P3-11 | todo | | | | |
| P3-12 | todo | | | | |
| P4-01 | todo | | | | |
| P4-02 | todo | | | | |
| P4-03 | todo | | | | |
| P4-04 | todo | | | | |
| P4-05 | todo | | | | |
| P4-06 | todo | | | | |
| P4-07 | todo | | | | |
| P4-08 | todo | | | | |
| P4-09 | todo | | | | |
| P4-10 | todo | | | | |
| P4-11 | todo | | | | |
| P5-01 | todo | | | | |
| P5-02 | todo | | | | |
| P5-03 | todo | | | | |
| P5-04 | todo | | | | |
| P5-05 | todo | | | | |
| P5-06 | todo | | | | |
| P5-07 | todo | | | | |
| P5-08 | todo | | | | |
| P5-09 | todo | | | | |
| P5-10 | todo | | | | |
| P5-11 | todo | | | | |
| P6-01 | todo | | | | |
| P6-02 | todo | | | | |
| P6-03 | todo | | | | |
| P6-04 | todo | | | | |
| P6-05 | todo | | | | |
| P6-06 | todo | | | | |
| P6-07 | todo | | | | |
| P6-08 | todo | | | | |
| P6-09 | todo | | | | |
| P6-10 | todo | | | | |
| P6-11 | todo | | | | |
| P6-12 | todo | | | | |
| P6-13 | todo | | | | |
| P6-14 | todo | | | | |
| P6-15 | todo | | | | |
| P6-16 | todo | | | | |
| P6-17 | todo | | | | |
| P6-18 | todo | | | | |
| P7-01 | done | b6845eb | a test required the publisher facts to be empty; nothing stopped a store build with 'not published yet' pages → facts must be empty or well formed (values parsed); npm run release:preflight lists 23 open items (6 blocking) and fails the signed Android/TestFlight jobs on blocking ones; notice on the web build |  | tools/release/check-store-ready.mjs, legal-config.mjs; test in release-tools.test.ts |
| P7-02 | done | 7b6e7a4 | id in 5 places, signed Android job would upload com.toadstoolkingdoms.app → one APP_ID variable; signed jobs stop while unset/legacy unless ALLOW_LEGACY_APP_ID=1 |  | Not run: a Gradle build or Xcode (no Android SDK / Mac here). strings.xml and Xcode identifier stay legacy until the owner changes the id (SHIPPING 6) |
| P7-03 | done | b6845eb | native lists lacked @capacitor/haptics and @capacitor-community/in-app-review → npx cap sync output committed; test checks every plugin dependency in the three native files |  | Not built with Gradle/Xcode here |
| P7-04 | done | 2627bf6 | Contests None → Frequent; age assurance No → present; parental controls No (reasoning beside each) |  | Apple page re-read 2026-11-18 by a web-fetch helper whose read of the two sections came from a page summary (the body text was cut off): an owner must re-read the page in App Store Connect before submitting. No closure record for C05 yet: in the Phase 7 record |
| P7-05 | todo | | | | |
| P7-06 | todo | | | | |
| P7-07 | todo | | | | |
| P7-08 | done | 2627bf6 | policyUpdated 2026-11-05 (page changed 2026-11-14) → 2026-11-14; test ties it to a hash of the English privacy strings |  |  |
| P7-09 | todo | | | | |
| P7-10 | done (docs) | b6845eb | REQUESTS 'Open' listed 9 backend + 7 game-theory entries, most answered → backend 2 open / 7 done, game theory 4 open / 3 done; dated reassessment table in WORLDWIDE_AUDIT |  | docs/art/REQUESTS.md left as is: its re-audit table is reference and the squad-orders ask is genuinely open (P6-01) |
| P7-11 | todo | | | | |
| P7-12 | todo | | | | |
| P7-13 | todo | | | | |
| P7-14 | todo | | | | |
| P7-15 | todo | | | | |
| P7-16 | doing (draft) | b6845eb | docs/store/OWNER_CHECKLIST.md written from STATE_OF_THE_GAME 6, publish.md 4e and this pass; preflight checks the machine-checkable lines |  | Extend with later phases' owner items (festival names, preview URL decision, local-day stats) |

## New and changed locale keys (for section 13)

| Key | Phase | What it is for (screen, placeholders) |
|---|---|---|
| `ui:welcome.scrollEnded` | 1 | Welcome-back dialog list item (P1-01): followed by resource chips of what an ended Season Scroll auto-granted. No placeholders. |
| `data:cosmetics.hallSkins.crimson_maple.name` | 1 | Name of a Season Scroll Keep look (P1-02), shown in the Store, the Scroll panel and the looks grid; a short label, Japanese-inspired nature theme |
| `data:cosmetics.hallSkins.snow_pine.name` | 1 | Name of a Season Scroll Keep look (P1-02), shown in the Store, the Scroll panel and the looks grid; a short label, Japanese-inspired nature theme |
| `data:cosmetics.hallSkins.indigo_tide.name` | 1 | Name of a Season Scroll Keep look (P1-02), shown in the Store, the Scroll panel and the looks grid; a short label, Japanese-inspired nature theme |
| `data:cosmetics.hallSkins.jade_bamboo.name` | 1 | Name of a Season Scroll Keep look (P1-02), shown in the Store, the Scroll panel and the looks grid; a short label, Japanese-inspired nature theme |
| `data:cosmetics.hallSkins.plum_blossom.name` | 1 | Name of a Season Scroll Keep look (P1-02), shown in the Store, the Scroll panel and the looks grid; a short label, Japanese-inspired nature theme |
| `data:cosmetics.hallSkins.golden_harvest.name` | 1 | Name of a Season Scroll Keep look (P1-02), shown in the Store, the Scroll panel and the looks grid; a short label, Japanese-inspired nature theme |
| `data:cosmetics.hallSkins.storm_cloud.name` | 1 | Name of a Season Scroll Keep look (P1-02), shown in the Store, the Scroll panel and the looks grid; a short label, Japanese-inspired nature theme |
| `ui:pass.bonus.title` | 1 | Season Scroll panel, heading of the row shown after the last tier (P1-03). One word: Bonus. |
| `ui:pass.bonus.detail` | 1 | Season Scroll panel, under 'Bonus' (P1-03): tasks keep paying after tier 30. {left} = task points to the next bonus (plural; =0 when all are collected), {got} = bonuses collected this season, {max} = the season's limit. Followed by resource chips of one bonus. |
| `data:trials.modifiers.rival_crimson_lotus.name/.description` | 1 | Shadow Trials panel: name and one-line description of a fortress modifier (P1-07): the fortress's towers carry that rival clan's tempers (clan name as in names.rivalClans) |
| `data:trials.modifiers.rival_iron_tide.name/.description` | 1 | Shadow Trials panel: name and one-line description of a fortress modifier (P1-07): the fortress's towers carry that rival clan's tempers (clan name as in names.rivalClans) |
| `data:trials.modifiers.rival_moon_veil.name/.description` | 1 | Shadow Trials panel: name and one-line description of a fortress modifier (P1-07): the fortress's towers carry that rival clan's tempers (clan name as in names.rivalClans) |
| `messages:ui.an_endless_ladder_of_practice_fortress_5c41313067 (changed)` | 1 | Shadow Trials panel intro (P1-06): was 'endless … no top'; now {tier} = the last tier of the Keep ladder (60), {pct} = how much stronger defenses get per tier past it (2) |

## Open ideas and items left open on purpose
