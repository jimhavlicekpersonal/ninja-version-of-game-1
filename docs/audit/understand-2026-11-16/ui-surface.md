# Player-facing surface: investigator notes (key: ui-surface, ids UIS-)

Read-only pass over `src/presentation/ui`, `src/presentation/render`, `src/app.ts`, `src/main.ts`, `locales/en/*.json`
and the data files the HUD reads, on 2026-11-16 (checkout at `9d9ade9`, working tree clean before and after).
Nothing in the repository was changed. Version numbers are not quoted here; `docs/STATUS.md` is the source.

How each claim was checked:

- **read-in-code**: file and line in today's checkout.
- **measured**: a script ran over the live data or the live i18n runtime. Scripts and outputs are in
  `docs/audit/understand-2026-11-16/scripts/ui-surface/`
  (`i18n-probe.test.ts` + `probe.out`, `objective-lengths.cjs` + `objective-lengths.out`, `vitest.config.mjs`).
- **inferred**: arithmetic from CSS and string lengths, or a sequence read from code. No browser was available:
  `playwright` is not installed (`node_modules/.bin` has only `vite` and `vitest`; no `~/.cache/ms-playwright`),
  so nothing here is a rendered measurement. Layout findings need a Playwright pass at 320×568, 360×640, 390×844
  and 844×390 before they are closed.

## 1. What the surface is today

- Village HUD (`ui/hud.ts`, 2,298 lines): top bar (Coins, Provisions, Jade, Artisans, Honor, shield, News, net pill),
  objective chip + Keep-unlock chip, side rail (Daily, Store, Events, Pass, Goals, Alliance, Friends, Trials), bottom bar
  (Settings, Battle log, Army, Attack, Build), building sheet, modals.
- Battle HUD (`ui/battleHud.ts`, 760 lines): opponent card, timer/stars/%, scout drawer with point chips and the stake
  row, troop cards, first-raid coach line, results dialog.
- Composition: `src/app.ts` opens every battle kind (raid, trial, bounty, rematch, practice, duel, Alliance War, Gang
  War, replay) through one `open()` and decides what `onFinished` returns to the results dialog.
- Tests: `tests/presentation/ui` has 7 files; none constructs `Hud`, `BattleHud` or `Tutorial`
  (`grep -rn "new Hud(\|new BattleHud(\|new Tutorial(" tests` returns nothing). They test pure helpers and read source
  text. `package.json` devDependencies: no jsdom, happy-dom or playwright.

## 2. Answers to the brief's questions

### After a raid: what the result screen shows, and whether it gives a reason to raid again

`battleHud.ts:627-677`. Shown: stars slamming in one by one with sound and haptic (`celebrate`), a "100%" banner,
destruction %, the mode's note, loot counting up to what was really banked (or "confirming with the server" for an
online raid), Honor delta, the declared stake's outcome, the diversity share, league bonus, event bonus, close-call
notes (`closeCalls`, only when true), warriors used, explicit overflow.

Buttons: "Watch replay" and "Return home" (`:665-676`). That is all.

Not shown: league name or progress to the next league; a promotion; daily/weekly task or Season Scroll progress
moved by this raid; the Bounty ladder; the next Trial tier. No "raid again", no "refill this army", no "next tier",
no "try a different fortress". After a cleared Trial the player goes Home, rail Trials, "Scout tier N+1"
(`app.ts:353-362` returns only a note).

So the screen celebrates well and is honest, and then ends the loop instead of starting the next lap.

### Defense log, replays, revenge

- `Hud.openLog` (`hud.ts:2001-2042`) merges attacks and defenses, newest first; each row has stars, Honor delta, age,
  loot, "Held" reward, Replay (only when `replayable`), Share (online, not under 13).
- "Settle the score" appears for a simulated raider within 72 h, once (`rematch.ts:30-37`, `raids.json` `rematch`).
  It needs `record.simulated`, so a real attacker can never be answered; `grep -rl revenge server src docs/backend
  docs/PROTOCOL.md` finds nothing.
- Nothing advertises an open rematch: the Battle log button has no badge (`hud.ts:321`); the welcome-back dialog's
  button reads "See defense replays" (`hud.ts:2074-2081`); the objective chip has no such kind.

### Scouting: real decisions?

Yes. Loot and Honor at stake on the card, one chip per Infiltration Point with the number of defenses on its path and
anti-air/splash tags, tap to highlight the path, up to three tips already filtered to the army brought
(`scoutReport(base, data, army)`), the base's temper profile, the rival clan's bio, "Next" for a fee, and the stake row.
Two gaps:

- The stake chips are always visible (`battleHud.ts:386`, `:391-408`) but what a stake means ("miss it and carry
  none", `stake.help`) is inside the drawer (`:367`), which is closed by default (`scoutOpen = false`, `:107`;
  `more.hidden = !this.scoutOpen`, `:374`). A 3★ stake can be declared in one tap without that sentence on screen,
  and nothing in the live HUD shows the declared stake afterwards.
- The diversity carry (85 % for a one-role squad, `raids.json` `diversity`) is shown only after the raid
  (`battleHud.ts:689-690`). The squad is chosen at training time; neither the Army panel nor the scout drawer says
  what this squad will carry. The tutorial raid is all Shinobi (the only warrior at Dojo 1), so D = 0 and the first
  result screen a player ever sees says "Your squad carried 85 % of the loot" (`carry.ts:27-48`, no Keep gate).

### Taps from the village

| Feature | Path | Taps | Notes |
|---|---|---|---|
| Army refill (last raid / saved army) | Army, Army tab (remembered), Train | 2-3 | `armyUi.ts:418-430`; presets cannot be named from the UI (`name: ''`, `:436`) |
| Practice battle | Army, "Try" on a warrior | 2 | own mix with 30 % of that warrior (`practiceArmy`); unlocked warriors only (`armyUi.ts:339`) |
| Shadow Trials | rail Trials, "Scout tier N" | 2 | rail button only after the first raid (`hud.ts:527,536`); icon is `icons.leaf`, the Honor pill's icon (`:283`, `:374`) |
| Trial alternate | same dialog after a failed try | 2 | `hud.ts:2172-2175` |
| Settle the score | Battle log, button | 2 | no badge, no prompt |
| Tempering | tap a Kunai or Shuriken Tower, scroll the sheet | 1 + scroll | Keep 5 (`battle.json` `temper.unlockKeep`); no announcement when it opens |
| Stakes | Attack, a stake chip | 2 | see above |
| 28-day calendar | rail Daily, scroll to the bottom | 1 + scroll | appended last (`dailyUi.ts:188`), under the odds table |
| Achievements | rail Goals | 1 | |
| League, leaderboards | Honor pill in the top bar | 1 | a `div role="button"` with no tabindex, label or chevron (`hud.ts:283-284`) |
| Bounty Hunt | rail Events, "Attack the bounty fortress" | 2 | Events badge is hard-coded 0 (`hud.ts:594`) |
| Season Scroll tasks | rail Pass | 1 | |
| Codex | Army, Codex | 2 | |
| Squad orders | none | - | no UI at all |

All side-rail buttons are icon-only (`hud.ts:353-360`): the name is in `aria-label` and `title`, which touch never
shows. They appear silently as progressive disclosure reveals them.

### Sim features with no UI

- Squad orders: `BattleSession.orderSquad`, `holdSquad`, `squadWaiting` (`control/battleSession.ts:105-121`);
  `grep -rn "orderSquad\|holdSquad\|squadWaiting" src/presentation src/app.ts src/main.ts` returns 0 lines. The ask
  is open in `docs/art/REQUESTS.md` ("nothing on screen uses it yet").
- The hero in the village: the Shadow Captain joins from Keep 7 (`battle.json` `heroes.shadow_captain.unlockKeep`),
  but the only place he appears is a battle card. The unlock ceremony scans `gd.troops` only (`hud.ts:497`),
  `hallUnlocks` lists buildings only (`sim/preview.ts`), and no panel shows his level or Rally.
- Live battle speed: `BattleSession.speed` scales live ticks (`battleSession.ts:75`) and deployments keep their tick,
  but only replays get the button (`battleHud.ts:467-475`).
- Replaying any cleared Trial tier: the panel says "You can replay any cleared tier" and offers only "Replay tier
  {best}" (`hud.ts:2170,2174`); `onTrial(tier)` accepts any tier.
- `villageToBase` (`sim/defense.ts:43`) and `raidVillage` exist, but there is no way to test one's own layout or
  tempering except waiting to be raided.
- Naming an army preset (`saveArmyPreset` takes `name`; the UI always sends `''`).
- Mastery and hero choice: preview only, by design.

### Tutorial

Nine steps (`tutorial.ts:44-110`): welcome; place a Coin Mint, then Collect; upgrade the Keep; wait or Jade; build
Dojo, Courtyard and a Kunai Tower; train Shinobi; wait or Jade; first raid; end (points at the daily chest). In the
first raid the battle HUD's coach line (`battleHud.ts:708-741`) teaches, from live sim state: tap a glowing ring, the
ring is full so use another, they are under fire so pick the Smoke Bomb, now tap on your warriors, and what smoke
does. Sabotage is not taught in play; the end text mentions it, and the first battle with Saboteurs shows one toast
(`battleHud.ts:169-171`). Stakes, the scout drawer, tempering, research, presets and Trials are never introduced.

Timing from data (measured by arithmetic, sequence inferred):

- Step 2: Mint builds in 10 s. The text says "When a coin floats over it, tap it, then Collect". The bubble shows at
  `max(minCollectAmount, capacity × collectBubbleMinFraction)` (`VillageScene.ts:351`) = max(1, 200/h × 8 h × 0.02)
  = 32 Coins = 576 s after the Mint is built. Collecting through the sheet works after 18 s (1 Coin).
- Step 4 (`finishKeep`, `tutorial.ts:63-73`): done only when the Keep is level 2. Keep 2 takes 240 s
  (`buildings.json`). The ring targets `.sheet[data-type=Keep] .btn.gold` (the Jade "Finish now" button), then the
  confirm's primary button. Skip price about 2 Jade (`store.json` `skipCurve`: 60 s = 1, 3,600 s = 15); 500 Jade at
  start. Two Artisans exist at start (`economy.json` `startingLayout`), and Dojo, Courtyard and Kunai Tower are all
  buildable at Keep 1 (`hall.json` level 1 limits), so step 5 could run during the wait; the linear step does not
  let it.
- Guided, without Jade, time to the first raid is about 28 + 240 + 44 + (20 s per Shinobi) ≈ 7 minutes or more;
  with the non-blocking step it would be about 3.

### Feedback on the moments that matter

| Moment | Today | Where |
|---|---|---|
| Star earned in battle | slam, sound, haptic | `BattleScene.ts:1113-1127` |
| Keep falls | collapse sound, heavy haptic, shake, slow motion | `BattleScene.ts:996-1003` |
| Result: stars, 3 stars, 100 % | slam per star, `perfect` sound, heavy haptic, banner, loot count-up | `battleHud.ts:627-664` |
| Daily chest | honest lid reveal, sound, haptic | `dailyUi.ts:121-130` |
| New warrior | ceremony card, haptic, Train button | `unlockCeremony.ts` |
| Any building done | "Level N!" float, pop, confetti, `levelUp` sound; no haptic | `VillageScene.ts:153-163` |
| Keep level reached | the same as any building; the only Keep-specific UI is the paid Keep Celebration offer | `controller.ts:473`, `offers.json` `keep_pack` |
| League promotion or demotion | nothing; no code compares the league before and after | `leagueFor` is used only in `openLeague`, `hud.ts:1978` |
| Hero joins (Keep 7) | nothing | see above |
| Tempering opens (Keep 5) | nothing | `hud.ts:1621` shows the locked line only on a tower's sheet |
| Trials open | a rail icon appears | `hud.ts:536` |
| Calendar day, achievement, Scroll tier, task | a toast and the `star` sound | `dailyUi.ts:74`, `economyUi.ts:554,582`, `main.ts:809` |
| Season chest | a toast | `main.ts:806` |
| Loot arriving in the top bar | numbers swap instantly; the `collected` bus event has no listener | `hud.ts:472`, `VillageScene.ts:718` |

Haptic call sites: battle, results, chest reveal, warrior ceremony, troop-card pick, the Settings switch. None in the
village.

### Dead ends, modal traps, overflows

- Dead ends: objective kind `builders` is a disabled chip (`hud.ts:1337-1338,1348`); the scout screen with no army
  shows a disabled "Train warriors first" button (`battleHud.ts:456-465`) with no route to the Army panel; "Next" is
  disabled with no reason when the fee cannot be paid (`:452`).
- Modal traps: none found. Every `Hud.modal` has a close button, Escape and backdrop close; the results dialog is not
  closable but has two buttons; `BattleHud.modal` (`battleHud.ts:743-759`) has no Escape or focus trap (keyboard users).
- Touch-invisible explanations: `title:` attributes carry the only explanation for troop cards and the Smoke card
  (`battleHud.ts:498,523`) and the opponent's Honor line (`:152`); there are 27 `title:` attributes in all across
  `hud.ts` (12), `battleHud.ts` (5), `armyUi.ts` (8) and `economyUi.ts` (2). No long-press anywhere in the battle HUD.
- Overflow risks (inferred): the objective chip is one line with an ellipsis (`styles.css:828-830`); `.army-actions
  .btn` is `white-space: nowrap` in a four-column grid (`styles.css:633-634`).
- No keyboard shortcuts in battle (no `keydown` handler in `BattleScene.ts` or `battleHud.ts`); the brief names a
  Windows laptop as a target.

### Hard-coded English outside `t()`

The text layer is in very good shape. Measured with the live runtime and the compiled Spanish pack
(`uis/probe.out`): 53 of 57 English-source strings that the UI builds or receives from the sim translate; the other
four are "+1", "+5" and "Honor" (the same word in Spanish). What is left:

- `hud.ts:701`: `` ` · ${queued} to send` `` is concatenated onto the net pill. `sync.pending` already exists.
- `battleHud.ts:134`: `'Alliance War'` goes in raw as `arg1` of `ui.vs_2d68ca8191`; Spanish renders
  "Alliance War contra X" (measured).
- `codexUi.ts:61`: `nextUp.status.replace('Needs ', 'needs ')` on a translated string.
- `app.ts:317,346`: `'s'` plural suffixes still passed as arguments; the ICU strings ignore them (dead arguments).
- English source typo: "More honor bring tougher opponents" (`ui.win_raids_to_earn_honor_...` in `messages.json`).

### Is the objective chip always pointing at something doable?

No (`sim/objective.ts`, `hud.ts:1308-1350`).

- Kinds: chest, raid (only when the army is full), upgrade, save, research, train, builders, none. Nothing for a
  claimable task, Scroll tier or achievement, the next Trial tier, an open rematch, a running Bounty, War attacks left.
- `builders` has no action. `none` hides the chip.
- `upgrade` and `save` emit only `select` (`hud.ts:1328,1331`); the camera pans only on `camera:focus`
  (`VillageScene.ts:167-173`), so the sheet can open for a building that is off screen.
- `save` reads "{need} more for {building} Lv {level}: collect or raid": 76 characters in English, 35 to 106 across
  the 50 languages, median 84 (measured, `uis/objective-lengths.out`). The chip shows about 20 to 40 characters on
  a phone 320 to 390 px wide (inferred: `head-row` max-width `calc(100% - 58px)` at `styles.css:576`; under 400 px
  the row does not wrap, the chip is `flex: 1 1 auto; min-width: 0` at 12 px bold and shares the row with the
  unlock chip, `styles.css:1040-1055`; about 20 characters at 320 px with the unlock chip, about 40 at 390 px
  without it). The action half of the sentence is cut in every language. The 2026-11-13 GUI batch record lists
  "objective chip truncates" as its intended narrow-screen behaviour, so this is a consequence of a deliberate
  choice, not a regression.
- Its tap lands on a sheet whose only enabled purchase path is "Buy missing" for Jade.

## 3. Problems (ordered)

UIS-01 high. The result screen ends the loop: no next action and no progress shown.
UIS-02 high. The tutorial stops for four minutes at step 4 with its ring on the Jade button; step 2 waits for a bubble that needs 9.6 minutes.
UIS-03 high. Squad orders have no screen.
UIS-04 medium. The objective chip is cut off on phones, does not move the camera, and dead-ends.
UIS-05 medium. A stake can be declared without its downside on screen.
UIS-06 medium. League promotion, Keep level, hero, tempering and Trials unlock have no moment; no haptics in the village.
UIS-07 medium. The diversity carry is revealed only after the raid, first on the tutorial raid.
UIS-08 medium. Side modes are hard to find: unlabeled rail icons, a shared icon, missing badges, a buried calendar, an unadvertised rematch.
UIS-09 medium. No behavioural tests or browser tooling for the HUD.
UIS-10 low. Scout dead ends and explanations that only exist as hover titles.
UIS-11 low. Trials panel offers one replay tier while saying "any".
UIS-12 low. Remaining text-layer leaks.
UIS-13 low. No Escape, focus trap or hotkeys in battle on a keyboard.

Details, evidence and fixes are in the structured output.

## 4. New strings each fix needs (49 other languages each)

| Fix | New strings |
|---|---|
| UIS-01 progress block and next-action buttons | 0 (reuse `ui.refill_in_one_tap_…`, `battle.next`, `ui.scout_tier_…`, `ui.try_a_different_fortress_…`, `ui.more_honor_to_reach_…`, task texts from data); 1 optional for a promotion line |
| UIS-02 tutorial | 0 |
| UIS-03 squad orders | about 11 |
| UIS-04 objective chip | 0 (reuse `rail.*`, panel titles, cost chips) |
| UIS-05 stake clarity | 0 (`stake.help`, `stake.option`) |
| UIS-06 milestone card | 3 to 5 |
| UIS-07 carry preview | 1 |
| UIS-08 discoverability | 0 |
| UIS-09 tests | 0 |
| UIS-10 scout dead ends | 0 |
| UIS-11 Trials stepper | 0 |
| UIS-12 text leaks | 0 (the typo fix re-keys one hashed string) |
| UIS-13 keyboard | 0 |

## 5. Elements to protect

See the structured output: the honest result screen, the scout drawer and Infiltration Point presentation, read-only
battle motion, the source-text translation layer, the Army panel's redraw discipline, progressive disclosure with
honest labels, the modal and lazy-panel plumbing, the first-raid coach.

## 6. Lower-priority items that did not fit

- The opponent's Honor line on the battle card is " {theirs} · +{win} / −{loss}" with its meaning only in `title`.
- The battle toast "Tactic: send Saboteurs first…" repeats at the start of every battle with Saboteurs.
- `Hud.openLeague` has no progress bar to the next league, only a sentence.
- The Honor pill and resource pills are `div`s with click handlers (not focusable).
- The results dialog's "Watch replay" leaves the results for good (no way back after the replay).
- The welcome-back dialog has one button ("Great"); it could carry the objective's action.
- Battle log keeps 10 attacks and 10 defenses (`battle.json` `maxReplays`, `raids.json` `maxDefenseLog`); no pinning.
- `main.ts:646` recognises the Settings dialog by its translated title; `battleBack` finds buttons by translated text
  (`main.ts:661-663`). Both work today and would break silently if a label changed; `data-id` would be sturdier.
- The diversity penalty on the first raid is a rule question (`carry.ts`), passed to the economy and combat
  investigators: gate it until a second role can be trained.
