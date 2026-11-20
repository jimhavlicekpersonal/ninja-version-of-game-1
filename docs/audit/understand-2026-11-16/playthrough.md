# Playthrough notes (investigator "playthrough", 2026-11-16)

Read-only. The game was run from the Vite dev server (`npx vite --port 5199`) and driven with Playwright
(headless Chromium, SwiftShader WebGL) at 360x640 touch/mobile, DPR 1, plus one 844x390 landscape pass.
Scripts: `docs/audit/understand-2026-11-16/scripts/playthrough/`
(`daemon.cjs` long-lived driver, `pre.js` real-finger tap helper that refuses covered targets, `raid.js`, `raid2.js`, `panels.js`, `distboot.cjs`).
Screenshots: 171 were taken; the 76 this report cites are kept as JPEG in `docs/audit/understand-2026-11-16/scripts/playthrough/shots/`.
Dev server and driver were stopped afterwards; `git status --short` in the repo is empty.

Limits: headless software WebGL is not a phone. Frame rates below are not device results. Taps were real
touch events at element centres (no auto-scroll), paced about 1 s per tap and 2.5 s per new bubble.
Mid-game villages came from `tools/store/showcaseVillage.ts` (Keep 5 and Keep 10, full army, tutorial done) put
into the sandbox save with `tk.controller.replace`; that is not an organically grown village.

## Boot, WebGL, console

| What | Result |
|---|---|
| Dev server, fresh storage, to `#boot.done` | 2.3 to 5.5 s over 7 boots |
| Production `dist/` (as built by the baseline run at 06:52), cold browser | 3.97 s, 16 requests, about 0.84 MB uncompressed |
| Production `dist/`, second context | 1.42 s |
| WebGL | context created, no WebGL errors, canvas 360x640 |
| Console errors / page errors / failed requests / HTTP >= 400 | none in any session (about 40 minutes of play, 7 boots) |
| Console warnings on every boot | `Capacitor plugin "TkAge" already registered. Cannot register plugins twice.` (registered in both `src/backend/platform/auth.ts:53` and `src/backend/platform/ageRegulatory.ts:35`); `Canvas2D: Multiple readback operations using getImageData...` at `src/presentation/render/quality.ts:160` |
| Frame rate in software GL during battle | Keep 5: 55 then 34; Keep 10: 54 then 23 (`game.loop.actualFps`; not representative) |

## First run, normal URL, 360x640 (session "run", human paced)

| Moment | Script time | Taps so far | Notes |
|---|---|---|---|
| Step 1 "I am ready" | 0:04 | 1 | storage banner already on screen |
| Coin Mint placed | 0:10 | 4 | |
| First coin collected, step 3 | 0:40 | 10 | 5 Collect taps answered "Nothing to collect yet." |
| Keep upgrade started | 0:48 | 15 | needed a swipe inside the sheet to find Upgrade |
| Keep 2 (2 Jade) | 0:56 | 17 | no celebration |
| Third building placed | 2:57 | 34 | about 80 s lost to the stale Build panel (40 s wait plus my probing); roughly 1:40 without it |
| Training finished (4 Jade), step 8 | 3:46 | 39 | |
| "Attack!" pressed (first raid starts) | 4:37 | 46 | about 3:15 without the stale-panel stall |
| First win, 3 stars 100% | 6:48 | 65 | battle 132 s; about 5:30 without the stall |
| Tutorial finished | 7:28 | 67 | Finish opens the daily chest |
| Raid 2 starts | 11:37 | about 95 | after age question, Dojo upgrade, 3 Jade to finish training |
| Raid 3 result | 17:20 | 161 | 4 Jade |

Jade spent: 2 + 4 + 3 + 4 = 13 of 500. Without Jade the first raid waits 4 min (Keep 2) plus 6 min 36 s
(20 Shinobi at 20 s) on top: about 14 minutes to the first battle.

Raid results:
- Raid 1 "Iron Tide · Silent Harbor" Lv 1: 3 stars, 100%, loot 2,140 / 2,130, honor +30, "Your squad carried 85% of the loot", event bonus 356 / 355.
- Raid 2 "Moon Veil · Moonlit Terrace": 2 stars, 69%, banked 129 / 733, **"Did not fit in your storage: 1,833"** coins. Battle 154 s.
- Raid 3 "Iron Tide · Willow Harbor" with a 2-star stake: 2 stars, 81%, 2,769 / 1,247, "Stake reached: 2★ carried ×1.1 loot", "Only 2 buildings stood between you and 3 stars.", **"Did not fit in your storage: 1,258"** provisions. Battle 119 s.

## What happened, in order (confusion, dead ends, overlap)

1. Second 0 (f01, boot-done-plus2s.jpg): the Sensei bubble and the "This browser may delete your village if you stay away for a week." banner are both up. The banner (24..284 x 430..535) sits on the Keep.
2. Step 2 (f05-mint-placed.jpg): after placing the Mint its sheet opens by itself and the tutorial ring (aimed at the Mint on the map) is drawn on top of the sheet's title. Bubble text says "striking Coins" while the sheet says "Being built".
3. Step 2 collect (r10-collect-zero.jpg): Mint finishes at 10 s, first coin exists 18 s later (200/hour). Collect answers "Nothing to collect yet." five times.
4. Step 3 (f07-collect0.jpg): text says "tap the castle, then Upgrade" while the Mint sheet is still open; the map ring for the Keep is drawn over the Mint's "Upgrade to Lv 2" button. A new player can spend 300 on the wrong upgrade.
5. Step 3 (f08-find-keep.jpg, f09-banner-dismissed.jpg): after closing the sheet the ring surrounds the storage banner; the Keep is under the banner until "Not now".
6. Step 3 (f10-keep-sheet.jpg, f10b, f11): the Keep sheet is 457 px of content in a 384 px scroll box (`.sheet { max-height: 60vh; overflow: auto }`, `styles.css:232-237`). "Upgrade to Lv 2" is at y 531..597, the sheet ends at 538, and the bubble (docked low, 501..628) covers the rest. Hit test at the button's centre returns the canvas. After a full swipe 43 px of the button show; the price stays under the bubble.
7. Step 4 (f12-keep-upgrading.jpg): the sheet keeps its scroll, so the title and the close X are clipped at the top.
8. Keep 2 (r01-keep2-*.jpg): the sheet's badge changes to "Level 2". Nothing else happens. The side rail grows from 2 to 6 buttons at the same moment (Events with a countdown, Pass, Goals, Alliance).
9. Step 5 (r11): the sheet's close X (294,131) is now under the rail's fold toggle (306,152, 36x36). A finger on the X hits the toggle. Tapping the map closes the sheet.
10. Step 5 (r12-artisans-busy.jpg, r12b-still-busy.jpg, r12c-tap-disabled.jpg): with two artisans, Dojo (10 s) and Courtyard (22 s) keep both busy. The Kunai Tower card is disabled "All your Village Artisans are busy." and carries the tutorial ring; the reason text is under the bubble. 52 seconds later the top bar says 2/2 free and the card is still disabled; tapping it toasts the same error. Switching tabs redraws it.
11. Step 6 (f24-tower-placed.jpg, f25): "Open the Army panel" while the Tower's sheet is open. Bubble is docked at the bottom over the bottom bar. "Skip tutorial" (71,573 89x44) lies over the Battle log and Army buttons (70..178 x 578..628). A tap on the Army button's position skipped the whole tutorial with no question. I did this twice by accident. Afterwards the age dialog says "You finished the training."
12. Step 6 (r15-army-panel.jpg): the target "+1" (ring 29..110 x 507..564) is under the bubble (483..628). "Suggested army: 20 Shinobi [Train]" is visible and works.
13. Step 7 (r16-training.jpg): 6 min 36 s or "Finish 4" Jade. The name in the training strip is cut to "S…".
14. Step 8 (r19-step8-raid.jpg): seven lines of text in one bubble.
15. Scouting (r20-attack-tapped.jpg): opponent card folded: "Iron Tide · Silent Harbor Lv 1 ▸". "(computer rival, offline)" appears only after a tap (r22-scout-open.jpg). Stake chips (No stake / 2★ ×1.1 / 3★ ×1.25) are on the first raid. Edge labels "E · 15" and "B · 15" are cut by the screen edge.
16. Battle (r24, r27-D-full.jpg): camera at the entry fit; the island is about 340x190 px; Shinobi are 4 to 5 px. Each tap sends one warrior; holding streams them (10 in 1.5 s). "That path is full: each point hides 15 space of warriors. Use another point." is clear.
17. Result (r33-result-3s.jpg): "Perfect raid! 100% EVERY BUILDING DOWN ★★★ 100% destroyed". Count-up on loot. Buttons: Watch replay, Return home.
18. Home (r35): the shield chip (23h 56m before the raid) is gone. Army 0/20: all 20 Shinobi are spent on a flawless win.
19. Finish (r36, r37-chest-open-0.4s.jpg): Finish opens the daily chest panel; "Open today's chest (free)" answers "Storage is nearly full ... anything that does not fit is lost."
20. Objective chip (r41, r61, r62): "Your daily rewards are ready" at 3,871/4K and again at 4,000/4K coins. The useful next step (Keep 3 costs exactly 4,000) is not suggested.
21. Age question arrives about 30 s after the tutorial, over whatever is open. Year select, "Not now" / "Continue". Fine.
22. Dojo sheet (r46-dojo-sheet.jpg): "Level 2: 440 HP +60". It does not say that level 2 unlocks Kunai Adept and Saboteur. The ceremony 22 s later does (r48-dojo-done.jpg).
23. Research tab (r44-research-tab.jpg): Shinobi Lv 2 costs 4,000 provisions with a 4K cap; three filter selects are shown with one warrior unlocked.
24. Store on the normal URL (e1-store.jpg): eight cards, all "Not available"; the explanation is the last line of the panel.
25. News (e1-news.jpg): "Messages this session" lists five "Nothing to collect yet." and "All your Village Artisans are busy."

## Mid-game (sandbox, generated Keep 5 and Keep 10 villages)

- Village art at Keep 5 and Keep 10 is strong and readable at 360 px (k5-village.jpg, k10-village.jpg).
- Keep 5 raid "Crimson Lotus · Crimson Valley" Lv 4: 139 warriors, deploy 33 s, battle ran the whole 3:00, 70%, loot 16,570 / 10,242 (league bonus 3,333 each, event bonus 2,206 / 1,151). Camera zoom 0.14 from tick 29 to the end (k5-raid-mid.jpg).
- After it: Army 0/180. "Refill in one tap: Last raid" then 59 min 26 s, or "Finish 25" Jade (k5-army-queued).
- Shadow Trial 1 at Keep 5 (k5-trials.jpg, k5-trial-result.jpg): "Clan Keep 1" difficulty, reward 500 / 500 against 200,000 in storage; cleared with 20 warriors, 66%, 2 stars. Tier 2 pays 550 / 550. Header when unfolded: "Practice · Kunai Ring · 2★ to clear".
- Keep 10 raid with a 3-star stake: 214 units, deploy 51 s, battle 162 s, 67%, 2 stars. Result (k10-raid-result.jpg): "Stake missed: you declared 3★, so no loot came home." directly under "Loot: 13,333 / 13,333" (that is the league bonus), and **"Warriors used: 1 shadow_captain, 105 Moonblade Master, ..."**.
- Simulate 8 hours away (k10-after-8h-b.jpg): "Welcome back! You were away for 8h. Your collectors gathered 643,570 Coins and 444,508 Provisions. Rin Okada (simulated raider) raided you: ☆☆☆ 21%, took 167,676 Coins and 108,575 Provisions (+40 honor). [See defense replays] [Great!]".
- Panels opened at Keep 5 portrait and Keep 10 landscape: Build (4 tabs), Army (Train / Army / Research), Codex, Daily chest + 28-day calendar, Store (4 tabs), Events, Season Scroll, Goals, Alliance, Trials, News, Battle log, Honor (leagues), Settings. My overflow audit (off-screen boxes, clipped leaf text, raw keys, snake_case ids, undefined/NaN) was clean on every one except the `shadow_captain` line above.
- Honor panel copy: "honor above 400 are halved", "More honor bring tougher opponents".
- Build card copy: "Upgrade your Clan Keep to level 3 to build another Firework Mortar." with 0 built.

## Landscape 844x390

- First frame (ls-01-first.jpg): the Sensei bubble lies on top of the storage banner; "I am ready" (490,193) is directly above the banner's "Keep it safe" (467,232), whose text is cut.
- Step 2 (ls-04-placed-sheet.jpg): bubble (202..642 x 251..378) covers the sheet's whole action row (Finish now, Cancel, Move); the ring floats over the sheet text.
- Army panel (lsp-army.jpg): status strip, tabs, suggested army and three filters fill the 390 px height; no warrior row is visible on open.
- Battle (ls-20-scout.jpg, ls-21-battle.jpg): zoom 0.14 again; the island is about 360 px wide on an 844 px screen.
- Ended battle result (ls-23): "Defeat ... Loot: None ... Your squad carried 85% of the loot."

## Did I want one more raid?

Partly. What pulled: the stake (declare 2 or 3 stars for more loot, lose it all on a miss), the true near-miss line,
two new warriors to try after the Dojo, and the count-up on loot. What stopped it: the whole army is spent on every
raid, so the next raid is 6 to 7 minutes away at Keep 2 and an hour away at Keep 5 unless Jade is paid; storage was
full after raid 1 so raids 2 and 3 threw away 1,833 coins and 1,258 provisions; the fight itself is 100 to 160
seconds of watching dots after 15 to 50 seconds of input; and the result screen ends in "Return home".

Tomorrow I would look forward to: Keep 3 finishing (10 min), Saboteurs, chest day 2 (+10%), calendar day 2,
Bounty Hunt ladder, Trial tier 2. Most of that is collecting. Only the Bounty and Trials are things to play.

## What looked excellent

- Result screen honesty and teaching: banked loot, explicit overflow, stake outcome, squad carry %, near-miss only when true.
- Daily chest panel: exact odds listed, streak that steps back instead of resetting, 28-day calendar "never random and never sold".
- "Try" on every warrior row: a free practice battle labelled "Practice battle · nothing is spent or won".
- Infiltration Points with squad space, scout drawer, stake declaration, hold-to-stream deployment.
- Unlock ceremony card and the 50-class Codex with "Next: ... needs Clan Keep 11 + Training Dojo 10".
- Welcome-back report with defense replays and "(simulated raider)".
- Army panel shortcuts: Suggested army, Refill last raid, Fill N, Save this army.
- Art and HUD finish; zero console errors.

## Lower-priority items that did not fit the structured list

- Defense tab "Walls and traps: Pay with Coins / Pay with Provisions" wraps onto two rows at 360 px and appears in tutorial step 5 (f22-defense-tab.jpg).
- Army tabs wrap to two rows beside the Codex button at 360 px (r15).
- Build opens on the Resources tab while the tutorial asks for Army; the ring does point at the Army tab.
- Every placed building opens its own sheet with a gold "Finish now 1" for a 10 s build; three buildings cost 15 taps.
- Goals rows have bars but no "3/5" numbers; "Coin Collector: Collect 10,000 Coins" did not move from 4,000+ raid loot (it counts collector output).
- Season Scroll daily tasks (win 2 raids, 3 stars, 120% destruction) were all complete after the first three raids.
- Suggested army after a Keep 5 raid with Shinobi proposed "67 Twin-Fang Dancer, 54 Shuriken Storm, ..." (different classes from the raid just fought), which trains for an hour.
- A battle keeps running to the clock when every deployed warrior is dead and undeployed ones remain (correct, but 2:45 of nothing unless the player presses End battle).
- Top-bar chips measure 28..36 px tall (objective chip 222x32, unlock chip 51x32, news 28x30, rail toggle 36x36); they may have `::after` hit areas, not checked.
- Welcome-back report: a 0-star 21% raid "took 167,676 Coins and 108,575 Provisions (+40 honor)": a won defense that lost a quarter of the collectors' output reads oddly.
