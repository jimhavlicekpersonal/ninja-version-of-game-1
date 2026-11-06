# Kagemura: state of the game (2026-11-05)

Third independent audit of `jimhavlicekpersonal/ninja-version-of-game-1`, at commit `2a4b222` (the tip of `main` on 2026-11-05). Goal set by the owner: find bugs and improvements in ten areas, from the smallest holes to the largest overview problems, with the aim of making money worldwide, and list the real-world human tasks needed to publish.

This is a report, not a fix pass. Nothing in the game, server or data was changed. The seven detailed area reports with file-and-line evidence are in [`areas/`](areas/); screenshots taken from the running sandbox are in [`screenshots/`](screenshots/). Every finding here is marked **verified** (read in code, run, or seen on screen) or **suspected** (inferred, or depends on a device or legal fact not in the repository).

How to read this next to the earlier audits: `docs/store/WORLDWIDE_AUDIT.md` records two passes on the same day that closed roughly 130 findings in code. This pass re-checked a sample of those claims against the current code (section 4 lists the ones that do not hold) and then looked for what those passes did not: exploits that survive the fixes, product and commercial gaps, and the structural problems behind the symptoms.

---

## 1. Verdict

**Kagemura is a technically serious, honestly designed game that is not yet a publishable product and not yet a business.** It can be soft-launched in a few English-speaking markets after a short engineering pass; it cannot be launched worldwide or marketed with paid installs in its current state.

What is true today:

- The whole codebase (about 53,000 lines of TypeScript plus 17,000 lines of tests) was written by AI sessions in four days (95 commits, 2–5 November 2026). No human has played it on a phone. No real player has ever played it. No server has ever been deployed anywhere (the "staging deploy" step in CI is a no-op that reports success).
- The web build is live on GitHub Pages and boots. The test suite passes (1,027 tests, 14 skipped for lack of Postgres and Redis in this container). The production web build, server type check and server build pass. CI on `main` is green, but two of its green jobs do nothing: the signed Android release is skipped because no upload key exists, and the server staging deploy has no target.
- Every one of the roughly 25 publisher facts the legal pages need (operator, address, support email, representatives, governing law, retention periods) is empty. The game cannot be listed in the EU, UK, Japan or Germany, and cannot pass Apple's "published contact information" rule anywhere, until a human fills them in.
- The game renders in English only. Zero of 648 extracted strings are translated in any of the 49 other languages, and the user-interface strings (around 500) are not even in the translation worksheets yet.
- There is no way to learn whether anyone keeps playing. Analytics stay on the device, crash reporting is off by default, and nothing exports retention, funnel or revenue numbers.

The three blocking classes, in the order they should be attacked:

1. **Owner identity and store setup.** Nothing in code can substitute for a legal entity, filled legal pages, developer accounts, products, keys, a hosted server and a trademark check (section 6).
2. **Economy and competitive integrity.** Five exploits survive the earlier fix passes: hiding losses by never "starting" a raid, importing a hand-made Keep-15 village, redeeming purchases around the under-18 cap, refunding offers after spending their resources, and minting Jade offline by moving the phone clock and then importing (section 3, areas 3–4 and 6).
3. **Product and measurement.** No hero, no cast, no story, a generic icon, four repeating events, a four-week casual wall at Keep 5, bots labelled as bots in a ladder that will be empty on day one, and no telemetry to judge any of it (section 3, area 9).

### Readiness by area

| # | Area | State | Blocking issues | Detail |
|---|---|---|---|---|
| 1 | Hardware and network compatibility | Good foundation, unbounded memory | Texture memory grows all session with no eviction; quality picked by RAM only; slow-network boot runs into its own 25 s "retry" card | [areas/01](areas/01-hardware-and-runtime.md) |
| 2 | Art, GUI, animation | Polished indie, not market tier | Two leftover Toadstool assets visible to players; battle opens on a postage-stamp base with hard-edged mountains; single-frame warriors; no faces anywhere a shopper looks | [areas/02](areas/02-art-gui-animation.md) |
| 3 | Economy and monetization | Honest, under-monetized | Free Jade (~540/month) equals the $9.99 pack; the $2.99 stipend is 3× better than any pack; first-purchase offer is usually lost; offers never reach undeclared-age players | [areas/03-04](areas/03-04-economy-monetization-game-theory.md) |
| 4 | Game theory and difficulty | Measured by model, not people | Keep 3 dip on day 2; casual Keep 5→6 takes 26–28 days; late-game casual stars under 1; defense value never measured | same |
| 5 | App Store / Google Play compliance | Drafted, not fileable | Publisher facts empty; Play age-signals plugin skips the mandatory access step; iOS age-range API handling incomplete; under-13 accounts online with a 13+ declaration; StoreKit test file lists the old product ids | [areas/05-07](areas/05-07-store-compliance-and-international.md) |
| 6 | Backend server | Well built, exploitable at the edges | Loss hiding, import of forged progression, cap bypass at redeem, refund floor, no graceful shutdown, rate limiter fails open without Redis, whole-village JSON rewrites | [areas/06](areas/06-backend-server.md) |
| 7 | International availability and languages | English only | 0/50 languages; fonts Latin-only; number formatting hard-coded en-US; 30-word English profanity list; single-region server | [areas/05-07](areas/05-07-store-compliance-and-international.md) |
| 8 | Code efficiency and anti-slop | Unusually clean code, drifting docs | 0 `any`, near-zero duplication, strict TS; but briefs state wrong protocol versions, HANDOFF is frozen at day one, a Redis dump is committed, package still named `toadstool-kingdoms`, one 1.5 MB bundle | [areas/08](areas/08-code-quality.md) |
| 9 | Addictiveness and marketing | Ethical, faceless, unmeasurable | No telemetry export, no A/B, no referral, no shareable replays, no landing page, no store assets, no soft-launch plan | [areas/09](areas/09-retention-and-marketing.md) |
| 10 | Missed items | See section 3.10 | CI green-washing; device→server bridge; cold-start plan; documentation as a liability | this file |

### What is genuinely good

It matters to say this, because the fix lists below are long. The simulation, economy authority, anti-cheat scaffolding, save safety, compliance drafting and ethical engagement rules are ahead of a typical indie base builder. Concretely: a deterministic battle sim re-simulated server-side in worker threads; versioned rules and saves with migrations; one-writer-per-village saves with backups; receipts verified against Apple's root and Google's API; atomic under-18 spend reservations; no loot boxes, honest countdowns, real odds, no faked near-misses; reporting, blocking, auto-hide, staff tools and DSA-style notices; a two-profile renderer with a low-end mode; a boot guard with polyfills that genuinely covers iOS 15 and Chrome 80; strict TypeScript with zero `any`, almost no duplication, no `@ts-ignore`, and 1,041 substantive tests. The 50 warrior badges are distinct, the palette is coherent, no text is baked into art, and the whole game ships with no image files (first visit is about 480 KB).

---

## 2. Verification baseline for this pass

| Check | Result |
|---|---|
| `npm test` (no Postgres/Redis) | 116 files passed, 1 skipped; 1,027 tests passed, 14 skipped; 94 s |
| `npm run build` | Passed; main chunk 1,476.8 kB raw / 422 kB gzip, CSS 50 kB, fonts 48 kB |
| `npm run typecheck:server`, `npm run server:build` | Passed |
| GitHub Actions on `main` at `2a4b222` | Deploy, Server release and Android workflows green. The `aab` job skipped every step (no upload key). The server `staging` job's Deploy step ran 0 s and its contract tests were skipped (no staging host). `production` skipped. |
| Live web build | `https://jimhavlicekpersonal.github.io/ninja-version-of-game-1/` returns 200 with the Kagemura title |
| Running game | Driven with Playwright at 360×640, 320×568 and 844×390 in the sandbox with a Keep-10 showcase village: village, Build, Army, Codex, Store, battle, Settings (screenshots in `screenshots/`) |
| Not done | Physical phones, signed store builds, real storefronts, App Review or Play review, real players, legal review |

---

## 3. Findings by area

Each area lists the highest-value items. IDs in brackets refer to the numbered findings in the area reports, which carry the file-and-line evidence and the concrete fix.

### 3.1 Compatibility with all ages and prices of hardware

The prior client-runtime pass is real (boot guard, polyfills, IndexedDB resilience, service-worker rules, sliced texture painting). What remains is structural.

- **Texture memory is unbounded over a session** (verified, [F1]). Every building type × level painted on first use is kept forever, in GPU memory and as a CPU canvas. 276 type-level looks come to about 208 MB on the high profile and 75 MB on low, before the island (37 MB high) and before the ×2 for kept canvases. Scouting other Keeps, replays, Trials and Build thumbnails all add to it. Nothing ever evicts. On a 2 GB Android the WebView renderer is killed around half a gigabyte; on iOS, Safari silently returns blank canvases past its budget. The audit's "62 MB / 26 MB" figures are first-frame numbers. **This is the single most likely cause of the game dying on a cheap phone.** Fix: an LRU on per-level textures, release painting canvases after upload, cap painted bytes per profile.
- **Quality is chosen by RAM alone on every Chrome and WebView** (verified, [F2]). The 2 ms canvas benchmark the re-audit added never runs when `deviceMemory` is reported, which is all of Android. A cheap 6 GB phone with a weak GPU and a 1080×2400 screen gets a 3× canvas, 60 FPS and seven full-screen parallax layers. There is no run-time downgrade when frames drop.
- **The slow-network boot defeats itself** (verified, [F3]). After 25 s a "taking a long time" card replaces the progress line and offers Retry, which reloads. On the audit's own 2G profile (240 kbps, 415 KB gzip, texture painting) the card appears while painting is 70–90 % done. Retry loops.
- **Every launch on a slow link waits 3.5 s** before the cached shell is used, and the service worker re-downloads about 400 KB of icons and legal pages on every build (verified, [F4], [F5]).
- **The iOS "keep it safe" advice sends players to a Home Screen app with a separate, empty storage** (verified, [F6]): the village stays in Safari, where the 7-day eviction still applies.
- **Music is synthesised even when muted** (verified, [F9]): the scheduler keeps creating oscillators every eighth note; mute only zeroes the gain. CPU and battery for nothing.
- **Canvas renderer fallback would draw role rings, flashes and smoke untinted** (suspected, [F13]), because Phaser's Canvas renderer has no tint. On a device without WebGL, battle readability collapses to white shapes.
- Smaller: `fx.ts` still uses `createCanvas` for scenery and ruins, keeping the ImageData copies the re-audit said were removed ([F8]); the `lazyTiers` flag is dead so the advertised low-profile saving does not exist ([F16]); thumbnails are synchronous PNG encodes of every shop building and all 50 warriors on first open ([F11]); autosave serialises the whole village every 15 s with no dirty check ([F14]); damaged-save backups accumulate without limit ([F15]); 61 px font sizes and no rem, so iOS large text never applies ([F21]); the Android minimum WebView is Capacitor's default 60 while the ES2020 bundle needs 80 ([F12]).

### 3.2 Art style and animations

Tier: upper "polished indie". One coherent palette, readable HUD, distinct building families, 50 distinct badges, no text in art, zero image files. Clearly below Clash of Clans / Boom Beach / Rise of Kingdoms. Two leftovers from the previous IP are visible to players today.

- **"Not enough resources (needs 5448274 acorns)"** on the Keep sheet (verified, [F1], `screenshots/keep-sheet-acorns-360.png`). The internal id `acorns` and unformatted numbers leak into the most-visited upgrade surface through `costText` in `village.ts`.
- **Store → Looks sells Keep skins previewed as toadstool mushroom caps with spots** (verified, [F2], `screenshots/store-looks-mushroom-caps-360.png`). The only cosmetic revenue surface shows the old game's art and gives no idea what is bought.
- **Battle opens on a postage-stamp base under hard-edged mountain rectangles** (verified, [F3], [F4], `screenshots/battle-start-landscape-844.png`). The parallax ridges are finite 1600×300 textures with visible left, right and bottom edges; the fit floor of 0.14 zoom makes buildings 8–14 px and warriors 6 px while the opponent card covers 20–30 % of the screen. This is the frame every store screenshot of a raid would show.
- **Warriors are single-frame sprites**: no walk, attack, hit or death frames, only procedural bob and squash (verified, [F6]). **Buildings show no damage until they become a near-black crater** (verified, [F7], `screenshots/battle-ruins-closeup-360.png`).
- **The two main resource pills look identical** (gold coin and tan bale, same shape and size) (verified, [F9], `screenshots/village-keep10-360.png`).
- **New-player first frame is an empty green plateau with two buildings** (verified, [F13], `screenshots/new-village-first-frame-360.png`). **The top HUD stack covers 31 % of a 320×568 screen** (verified, [F14], `screenshots/village-320-hud-stack.png`); the re-audit measured only 390×844.
- **Fonts are Latin subsets**; the display font has no CJK, Arabic, Thai or Devanagari glyphs, so titles in 40+ target languages fall to whatever system font exists ([F15]). Infiltration points are labelled A–H in the canvas and HUD, foreign letters for most of the world ([F16]).
- **Music is a 7.5 s loop in battle** (about 25 repeats per fight) ([F17]). "Treasurys" plural by appending "s" ([F18]). Army filter dropdowns clip their labels at 360 px ([F19]). Dialogs animate in but vanish with a hard cut ([F10]). Per-level "visible change" is often one more stone lantern ([F11]). Battle troop cards use the dark field sprite instead of the readable badge that already exists ([F12]).
- **App icon and splash are a building, not a character** ([F23]). In this genre the icon, screenshots and ads lean on faces. There is none.
- No store screenshots exist in the repository; the generator would currently capture the ridge artefact and the tiny base ([F28]).

### 3.3 Game economy and monetization

The economy is honest and well guarded against dark patterns. As a business it is under-monetized, and the two biggest offer triggers mostly never fire.

- **Free Jade roughly equals the $9.99 pack every month** (verified by arithmetic, [E05]). Streak, chest, free pass track, bot Alliance War chests, Bounty Hunt, league chests, achievements and obstacles give about 540 Jade a month to a daily player, plus 500 at start. Skips are priced at about twice the genre norm (24 h = 300 Jade, about $5). The rational source of Jade is therefore free play, and the model player reaches Keep 15 in 121 days without spending one Jade.
- **The $2.99 Clan Stipend gives 600 Jade, the same as the $9.99 pack, at 200 Jade per dollar against 45–75 for packs** (verified, [E03]). Missed days are never lost and it is rebuyable when empty, so a rational spender's ceiling is about $3 a month and it does not drive daily logins.
- **The first-purchase Starter Pack is a one-shot trigger that is usually lost** (verified, [E01]). The flag is consumed before the offer is checked; the Artisan's Bundle fires on nearly every timed upgrade with busy builders and takes the one offer slot per session; players under 24 h of account age, offline players and anyone who has not yet declared "adult" lose it forever.
- **Offers exist only for players who have already said "adult"** (verified, [E02]), and age is asked only at a purchase attempt or before going online. The pre-purchase funnel is dead for offline and undeclared players; for under-18 bands the Offers tab is permanently empty with no explanation.
- **Rushing the Keep is the cheapest large sink and actively harmful to the buyer** (verified, [E06]): about $635 of top-ups and skips reaches Keep 15 with level-1 research, which the matchmaker then pits against Keep 14–15 bases and full bot armies. Paying makes the game worse.
- **The offline bot Alliance War pays Jade every week with no participation, for every missed week, unbounded** (verified, [E12]): a returning player collects a year of chests at once (~1,300 Jade). Daily bot Gang Wars are a 15 Jade/day faucet ([E13]). Online war chests are free-rider friendly ([E14]).
- **Device villages have zero clock-tamper protection and an imported village keeps all clock-skipped progress** (verified, [E11]). Jump the phone clock day by day, reach Keep 10–12 with capped research and thousands of Jade from chests, connect, import, raid real players. The import check holds only Jade above a generous allowance (16,000 at Keep 15).
- Smaller: pack ladder has no anchor or hero card ([E04]); pass tier resources scale with the Keep at claim time, a small timing exploit ([E07]); `docs/SHIPPING.md` 3b omits the two newest products, so an owner who creates products from that table ships a store where $0.99 and $2.99 show "Not sold here" ([E08]); league win bonuses are flat and meaningless from Keep 8 ([E10]); online "Next" is a client-honoured fee, the match route itself is free 30×/min ([E15]); abandoning an offline battle is a free probe ([E16]); Jade sinks are thin: builders, three skins, skips, top-ups, nothing else ([E19]).

### 3.4 Game theory and difficulty

- **Keep 3 is a dip in the day-2 window** (verified from the generated campaign, [E24]): regular model 0.88 stars and no three-stars; casual explorer 0.00 stars over six raids. Keep 2 gives 2.67 stars, so the second day feels like a cliff.
- **The late-game failure loop is still open for casual players** ([E25]): casual explorer averages 0.14–0.33 stars at Keeps 9–14 and honor collapses; the regular model never three-stars at Keep 15. The balance tests have upper gates (no army too strong) but no lower gate on the model player's win rate.
- **The casual Keep 5→6 wall of 26–28 days lands exactly where D30 retention is measured** ([Growth 18], [E23]). The Keep timers alone sum to 36 days; the real walls are collectors, camps and research, and the offers are not keyed to them.
- **Whether defense is worth building is never measured** ([E26]): with losses capped, a 12 h shield after any 30 % raid and a 5 % held-defense reward, the rational player probably builds minimal defense.
- **Cold start** ([E29], [Growth 12]): with no players, every online raid is "Generated rival", Gang Wars go to a generated Gang after three minutes. Honest, but the first review will say "it's all bots". There is no plan to seed the ladder with named rival clans.
- Weekly "clear 2 Trial tiers" tasks become unreachable past tier 60 ([E27]). All daily boundaries are UTC midnight, which is dinner time in the Americas ([E28], [Growth 9]).

### 3.5 Compliance with App Store and Google Play rules

Good baseline (neutral age screen, one-way stricter bands, under-13 preset chat and non-findability, atomic under-18 cap, Sign in with Apple, in-app and web deletion, no ads, no tracking, Billing 9.1.0, target SDK 36, no native libraries). What blocks filing:

- **Every publisher fact is empty** (verified, [C13]): `public/legal-config.js` has 16 empty strings and a test asserts they are empty. No controller identity, no Impressum, no Japanese seller notice, no governing law. Blocks EU, UK, Japan and Germany listings and Apple's "published contact information" rule everywhere ([C03]).
- **The Play Age Signals plugin skips the mandatory `requestAgeSignalsAccess` step** (verified, [C01]), so it never obtains a signal in user-choice regions and cannot distinguish "verification required" (Texas-type states) from "unavailable". The game then silently falls back to self-declaration where the law expects the store signal.
- **iOS Declared Age Range handling is incomplete** (verified, [C02]): only sharing/declined are handled; regulatory features, the significant-update acknowledgement and the `RESCIND_CONSENT` server notification are not. Needs the Xcode 26.5 SDK; CI targets `macos-15` ([C07]).
- **Under-13 accounts play online, get push tokens and read adults' free-text chat while the Play target audience is declared 13+ and no COPPA consent exists** (verified code, suspected ruling, [C04]). The middle path is the weakest position: pick offline-only for under-13, a full Families programme, or internal-operations-only data.
- **Terms are a draft with no acceptance flow**; community-rules acceptance is per device in localStorage, never on the server, which Play's UGC policy expects to be evidenced ([C14]).
- **The StoreKit test configuration lists the old `moonstones_*` ids and lacks the two newest products**, so local StoreKit testing cannot work ([C08], verified).
- Apple age-rating answers need "Contests: Frequent" and "Age assurance: Present" ([C05]). Under EU CPC virtual-currency principles, Jade-priced items show no real-money equivalent ([C16]). Japan's prepaid-balance report is specified but not built, and the Japanese notices are keyed on device language instead of storefront ([C17]). Brazil's ECA Digital rejects self-declared age for minors' social features ([C19]). India's IT Rules grievance officer is nowhere in the market docs ([C22]). The server deletion page says "Kagemura" while the Play listing name will be "Kagemura: Ninja Clans"; Play requires the match ([C06]).
- Account deletion does not purge idempotency bodies that can hold the whole village, and frees the deleted name immediately ([Backend A12]).

### 3.6 Backend server

The server is well built: stateless API, Postgres as truth, optional Redis, numbered migrations, worker-thread re-simulation, structured logs, metrics, alerts, encrypted backups with a restore drill, a production config guard, staff tooling. Twenty-two of the re-audit's claims hold as described. The gaps are at the edges, and several are money.

- **Loss hiding is still free** (verified, [A1]). `match` returns the full base and the server seed; `start` is a separate client call; only started tickets forfeit; `match` voids the previous unstarted ticket without penalty. A modified client simulates locally with the real seed, reports only wins, re-matches on losses, 30 times a minute. Honor, ratings and both leaderboards become monotonic for cheaters. Fix: make issuance the commitment (summary first, base and seed only on `start`).
- **Village import accepts any legality-checked progression and is repeatable through delete-and-reregister** (verified, [A2]). A hand-made Keep-15 save with capped research and 16,000 Jade passes. Nothing compares account age with Keep, and nothing rate-limits import per IP or device.
- **Battle commands (Trials, Bounty, rematch) run a full battle on the request thread inside a row-locked transaction** (verified path, suspected scale, [A3]). 200 free accounts × 6 battles/min × 0.45 s saturates an instance. The worker pool does not cover these.
- **The under-18 cap is enforced only when the client attaches the intent; intent-less receipts are credited** (verified, [A4]). Regulators judge the server rule, not the honest client.
- **Refund take-back creates debt only for Jade; other resources floor at zero** (verified, [A5]). Buy an offer, spend the coins on an upgrade, refund: nothing is recoverable. The three-refund pause is per free account. Apple's `CONSUMPTION_REQUEST` is unanswered, which favours the refund.
- **No graceful shutdown** ([A9]): every deploy kills requests mid-flight and re-sim jobs in flight. **Rate limiting fails fully open while Redis is down** with no local fallback ([A8]). **Outbound calls to Google Play, FCM and JWKS have no timeout** ([A10]). **Per-player rate limits are keyed by token hash and a player can mint unlimited tokens** ([A7]).
- **Whole-village JSON rewrites on every command batch** (~290 KB per write, plus one INSERT per ledger line) will be the first thing that hurts Postgres at scale ([A17]); retention deletes are unbatched under a 30 s statement timeout and will silently stop ([A18]); matchmaking sorts by `random()` over a widening window ([A19]); the Power leaderboard is a full scan per HUD open ([A20]); periodic jobs run on every instance uncoordinated, so two instances double-push war reminders ([A21]).
- Two late reports against one defender can both settle (no defender row lock) ([A6]); sign-in tokens are not nonce-bound and can be replayed for their lifetime ([A15]); bearer tokens never expire or rotate ([A16]); friend requests by player id bypass the under-13 and findability rules ([A14]); Google purchase checks trust the client's product id ([A11]); idempotency replay ignores method and route ([A13]); anonymous accounts are free, permanent and never pruned ([A23]); the $10 sandbox-purchase cap is per free account ([A24]).
- Operations: can run a one-region soft launch under 10k MAU today if shutdown and the limiter fallback are fixed; not ready for 100k MAU worldwide without A1, A2, A3, A5, A17 and A18. Hosting cost at 100k MAU is roughly $250–500 a month; the constraint is engineering time, not hosting.

### 3.7 International availability and foreign languages

- **The game ships in English only** (verified, [L01]). 49 target languages, 0 of 648 game-data strings done in every one; the roughly 500 UI strings are not extracted at all; `index.html` is `lang="en"`; the planned text layer does not exist. The listing must stay English-only.
- Plurals by appending "s" and 22 `? 's' : ''` patterns; number formatting is forced to en-US everywhere; dates use the device locale ([L02], [L03]).
- Fonts cover Latin only; no RTL layout anywhere; the display font cannot render most target scripts ([L04], [Art F15]).
- **The profanity filter is 30 English words** (verified, [C23]); the engine supports every script, the list does not. Community rules, moderation notices and the eight under-13 preset phrases are English only ([C24]). Names are not run through the contact-stripping rule ([C25]).
- Single-region server, region undecided, data residency undeclared; a sync is about six sequential calls, so 2–3 s from Jakarta or Lagos on good cellular ([I01], [Backend ops 6]). Every web update re-downloads everything ([I03]).
- The market matrix in the compliance report says: ship today only in English-speaking, no-licensing markets (US outside Texas-type states once publisher facts exist, Canada, Australia, UK after OSA items, South Korea in English, India in English, parts of Africa). EU, Japan, Brazil, Indonesia need owner and legal work; Vietnam and mainland China need a licensed local partner or exclusion.
- "Kagemura" has had no trademark search; the bundle id is still `com.toadstoolkingdoms.app`, and a Play package name can never change ([T01]).

### 3.8 Code efficiency and anti-slop

Code health is unusually good for an AI-built repository of this size: strict TypeScript, 0 `any`, 0 `@ts-ignore`, 0 bare empty catches, 4 duplicate 8-line windows across 53k lines, 1 real TODO, dependencies all used, custom Phaser build actually trimmed, substantive tests. The rot is in what surrounds the code.

- **The compartment briefs state the wrong versions** (verified, [8]): `src/backend/CLAUDE.md` says protocol 8 (code: 9); `docs/PROTOCOL.md` says rules 3 plays rules 2 and `X-Protocol` 7 (code: rules 4, protocol 9). These are the first files a new session reads.
- **`docs/rebuild/HANDOFF.md` is frozen at 2 November** while root `CLAUDE.md` calls it the state of the build ([9]): save v10 (now v16), protocol 6 (now 9), "6 warriors live" (50), "286 tests" (1,041). The two REQUESTS files that `AGENTS.md` makes the cross-compartment channel do not exist ([10]).
- **Documentation is now a liability**: 42 Markdown files, about 47,000 words of "required" reading per session, root `CLAUDE.md` at 5,200 words of change log changed in 37 of 95 commits ([11]). Nine of the last 95 commits are "WIP" integration dumps that touched every compartment at once, so the one-session-per-compartment scheme was not what actually happened ([35]).
- **A Redis dump (`dump.rdb`) is committed at the repo root** ([2]); `package.json` is still named and described as Toadstool Kingdoms ([1]); 49 empty locale worksheets (3.4 MB) are committed ([3]); `server/rules/v3` is a 29,000-line copy of the sim that was edited after being "frozen" ([4]); tool-generated JSON files carry no "generated" marker ([5]); no linter or formatter exists ([6]).
- God objects: the `Repo` interface has 174 methods implemented twice (memory and Postgres, 1,500–1,900 lines each, Postgres untested in the default CI run) ([16], [26]); `hud.ts` 2,160 lines; `main.ts boot()` 508 lines with 28 closures, untestable ([17], [18]); `server/app.ts` registers 108 routes with no schemas and 33 `as never` body casts ([19]).
- Performance: the battle tick is O(defenses × troops × support troops) because aura, smoke and hidden state are recomputed per pair per tick ([28]); the client is one 1.48 MB chunk with the chunk-size warning raised to silence it, despite the "one bar" goal ([31]); the server Docker image installs Phaser and all Capacitor packages ([32]). `applyDefenseLosses` swallows any exception from the battle sim and silently takes all loot from storage ([33]).
- Tests: three model-player files take 105 of 165 CPU seconds; several wall-clock millisecond assertions can flake on loaded CI ([24], [25]).

### 3.9 Addictiveness (ethical retention) and marketing

The ethical scaffolding (no loot boxes, honest timers, opt-in reminders, healthy-play reminder, real odds) is a marketable identity. The product behind it has no face and cannot be measured.

- **Analytics never leave the device** (verified, [1]): D1/D7/D30, funnel and ARPDAU are uncomputable; the server counts errors, battles and purchases, not players. **Crash reports are opt-in and off** ([2]): near-zero crash visibility at launch. **No A/B capability**: balance bundles are one global patch ([3]). Nothing else in this report can be judged without this.
- **No fiction hook, no hero, no cast** beyond one mentor portrait ([5]); heroes exist only as catalog entries. **Cold start**: a PvP game whose server falls back to "Generated" opponents on day one, with no plan to seed the ladder with named rival clans ([12]).
- **Notifications are off by default with no in-context ask at the moment of value**; the daily-chest and events types stay off even after opt-in ([8]). **All daily resets are UTC midnight**, dinner time in the Americas ([9]). **No "next objective" chip** on the village screen ([7]).
- **Live-ops cadence**: four distinct events, 14-day loop, every event seen by day 14; no seasonal or holiday content at all ([10], [11]). The 7-step streak tops out at 5 Jade and then stays flat; no 28-day calendar ([19]).
- **No referral reward, no invite incentive, replays local-only, nothing shareable, leaderboards buried in Settings, no news/inbox panel** ([13]–[17]). **No landing page, no Open Graph tags, no manifest screenshots, store listing English-only with uncaptioned screenshots, no app-preview video, generic keywords, no in-app review prompt** ([23]–[26]).
- **No soft-launch plan, no pre-registration plan, no KPI or kill criteria anywhere** ([30]). The web/PWA role is undecided: it gives the full game for free forever with no store ([28]).
- Monetization depth is sound but narrow: no per-Keep progression bundle, cosmetics are four roof colours ([20]); teens see no offers, so model that in the forecast ([21]).

### 3.10 Anything missed

- **CI green-washing.** Three green badges on `main` hide that no Android release has ever been built, no server has ever been deployed, and no contract test has ever run against a deployed host. A skipped release job should fail or warn loudly, not pass.
- **The device-to-server bridge is the economy's soft underbelly.** The server-held economy is sound; everything a device village earns is client-trusted until import, and import trusts legality rather than plausibility (areas 3–4 [E11], [E21]; backend [A2]). Before any competitive launch, either cap the importable Keep or create online villages server-side at first contact and treat the device village as a backup.
- **Nobody has looked at it on a phone.** Every "fixed" runtime item was verified in Chromium emulation; the two highest-risk items (texture memory, GPU fill and batch count) cannot be seen there. One afternoon with a 2 GB Android Go phone and a 2019 iPhone is worth more than another audit.
- **The owner-task backlog is larger than the engineering backlog.** Of the roughly 80 items in section 6, none can be done by code.
- **Documentation has become the main source of wrong beliefs.** Three audits in one day, 42 Markdown files, and briefs that disagree with the code on versions. Future sessions will "fix" things that are not broken and trust statuses that are stale. One generated STATUS file and a root brief of invariants would cost a day and save every session after it.
- **The web build is both the best funnel and a revenue leak.** It is instant, link-able and sells nothing, and the server village follows sign-in, so a browser player has the full game free forever. Decide its role before marketing.

---

## 4. Prior-audit claims that do not hold

Consolidated from the area reports. Each was checked in the current code.

| Claim in `WORLDWIDE_AUDIT.md` | What is actually true |
|---|---|
| Attack-commit: a started raid never reported settles as a loss (listed as "partly") | A client that never calls `start` pays nothing and can re-match freely; no protection against the one population that matters (backend A1) |
| Textures 115 → 23.5 MB; "~62 MB high / ~26 MB low" | First-frame figures. Nothing bounds growth; a session can reach 200+ MB on high (device F1) |
| `low` profile "generates building tier art only when shown" | The `lazyTiers` flag is unused; both profiles paint per level on first use (device F16) |
| Auto quality: new rule plus a 2 ms canvas fill test | The fill test never runs where `deviceMemory` exists, which is every Chrome/WebView (device F2) |
| Service worker "downloaded everything twice → fixed" | Fixed for `/assets/` only; ~400 KB of icons and legal pages re-fetched on every build (device F5) |
| "Code art added with `addImage`, never `createCanvas`" | `render/fx.ts` uses `createCanvas` for ridges, fog, ruins, villagers, birds, petals, cloud shadows (device F8, art F21) |
| Village idles at 20 FPS, CPU 102 % → 37 % | The frame loop does; the music scheduler, 15 s full serialisation and village-life tweens continue (device F9, F14, F20) |
| Safari eviction: "Keep it safe" banner → Home Screen | The Home Screen app has a separate, empty storage on iOS (device F6) |
| Top HUD stack 21.8 % → 11.4 % | Measured at 390×844 only; it is 31 % at 320×568 and 25 % at 360×640 (art F14) |
| GLOBAL-004: under-18 cap enforced across devices before the store is asked | True for honest clients; a receipt without an intent is credited past the cap (backend A4) |
| Spend-then-refund → debt | Debt only for Jade; coins, rice and the rest floor at zero (backend A5) |
| Held tickets can no longer bypass a shield | True, with a race: the check runs outside the transaction and there is no defender row lock (backend A6) |
| Battle commands capped at 6/min; `abandonBattle` no longer simulates | True, and Trials/Bounty/rematch still simulate on the request thread under a row lock (backend A3) |
| Redis outage: fail-open limiter | Fail-open with no local fallback: all limits off on all instances during an outage (backend A8) |
| Sandbox purchases capped at $10 on production | Per free account (backend A24) |
| Play Age Signals plugin added | It skips the mandatory access-request step and never obtains a signal in user-choice regions (compliance C01) |
| "16 KB safe, no native libraries" | Plausible from `build.gradle`; Firebase Messaging comes in through the push plugin; verify the signed AAB (compliance baseline) |
| `docs/rebuild/HANDOFF.md` is "the state of the build" | Frozen at 2 November: save v10, protocol 6, 6 warriors, 286 tests (quality 9) |
| Compartment briefs are the authoritative first read | `src/backend/CLAUDE.md` and `docs/PROTOCOL.md` state protocol 8 / rules 3 (quality 8) |

Confirmed as described (sample): refund notices before redeem; backdating clamp; ticket burn after refused reports; TRUST_PROXY handling; Game Center fetch restriction; refused-command logging; idempotency after auth; Postgres pool and TLS; one open raid per attacker; purchase rate bucket; legacy batch refusal; token revocation and JWKS throttle; admin tokens; compression; boot guard and polyfills; IDB timeout; custom Phaser build; page zoom; input sizes; Android Back; art-manifest deadline; store-price timeout; role silhouettes; Keep tiers; village life, ruins, hit flashes; haptics and sound exist (not listened to); Sensei portrait; GLOBAL-009/010/012/013/016.

---

## 5. Recommended order of engineering work

Each step is sized for one focused session and names the area-report IDs it closes.

1. **Stop the bleeding in the ledger** (backend A1, A2, A4, A5, A6; economy E11, E12, E13): issuance is the commitment; plausibility and rate limits on import, or cap the importable Keep; refuse or hold intent-less receipts for under-18 players; debt for every resource and refund counting per store identity; defender row lock; bot war chests require an attack and settle at most two weeks; no Jade from bot Gang Wars.
   - *Status, commit `1f559ef`:* done in code except refund counting per store identity, with E15 (free rerolls) added for server-held villages. The seed turned out to hide little (a guessed seed predicts win or loss 98% of the time), so offline cherry-picking now costs Next instead of being impossible. Imports above Keep 5 wait for account age rather than being refused. Closure record with evidence and limits: `docs/store/WORLDWIDE_AUDIT.md`, "ledger fixes".
2. **Make the server deployable** (backend A8, A9, A10, A21; CI): local limiter fallback, graceful shutdown, outbound timeouts, advisory locks on periodic jobs, and make skipped release and deploy jobs fail or warn visibly.
   - *Status, commit `fb81097`:* done in code. Periodic jobs use database leases rather than advisory locks (a pool cannot hold a session lock for a job's length). Skipped staging and Android releases warn on the run and in its summary; a production deploy without a hook fails. Closure record: `docs/store/WORLDWIDE_AUDIT.md`, "deployability".
3. **Make the game survive a cheap phone** (device F1, F2, F3, F6, F9, F13): texture LRU and canvas release, always-run fill benchmark plus a screen-pixel budget and a run-time downgrade, progress-aware boot guard, iOS storage advice, stop the muted music scheduler, refuse Canvas or pre-tint.
   - *Status, commit `2b202b5`:* done in code, with Canvas kept (pre-painted ring colours) rather than refused, so phones without WebGL still play. The downgrade applies from the next start. Checked in Chromium only; every threshold still needs a physical cheap phone. Closure record: `docs/store/WORLDWIDE_AUDIT.md`, "cheap phones".
4. **Remove what a reviewer sees first** (art F1, F2, F3, F4, F9, F18, F19; economy E08): resource names and formatting on sheets, real Keep-skin previews, tiled and faded ridges, a larger battle fit floor and a one-line opponent card, distinct resource icons, plurals, filter layout; add the two missing products to the shipping table.
5. **Measure** (growth 1, 2, 3): a consented, pseudonymous event export with a nightly D1/D7/D30 and funnel job; store crash tools in the rollout plan; a cohort field on balance bundles.
6. **Fix the funnel and the faucets** (economy E01, E02, E03, E05, E19): ask age at tutorial end, re-armable Starter that outranks the Bundle, reprice the stipend, trim passive Jade and lower skip prices, add sinks (per-Keep bundles, cosmetics).
7. **Store age APIs and compliance code** (compliance C01, C02, C08, C14, C25; backend A12, A14): the access-request step, regulatory features and consent revocation, StoreKit config, server-side rules acceptance, name contact stripping, deletion purges idempotency bodies and holds the name, friend-request checks by id.
8. **Return hooks and a face** (growth 5, 7, 8, 9, 12, 19; art F13, F23): next-objective chip, contextual notification ask, local-midnight task days, a 28-day calendar, named rival NPC clans fronting generated bases, one playable hero, a dressed starting village. The hero and the faces need a human artist (section 6).
9. **Text layer** (compliance L01–L04; art F15, F16): extract UI strings, keyed messages with plural rules, locale-aware number formatting, per-script font subsets, RTL layout, locale-aware point labels; only then run the translation sessions.
10. **Structural debt** (quality 1–4, 8–11, 16, 17, 28, 31, 32): remove `dump.rdb`, rename the package, fix the briefs, archive HANDOFF, shrink the root brief, generate a STATUS file, split the Repo interface, code-split the HUD panels, cache per-tick battle state, slim the Docker image.
11. **Balance gates with real numbers** (economy E24, E25, E26): a lower bound on model-player stars per Keep, a Keep-3 slack, stolen-resource and defense columns in the campaign; then real-player playtests.

---

## 6. Human tasks in the real world needed to publish

None of these can be done by code. Grouped by what they unblock. "Blocks" says what cannot happen until the task is done.

### 6.1 Identity and legal entity (blocks every listing)

- Decide the publisher: individual or company (an LLC or similar is recommended; Apple prefers an entity for payment-heavy apps). Open a bank account and get tax details ready for both stores.
- Trademark and app-store name search for "Kagemura" (USPTO, EUIPO, JPO at least; Nice classes 9 and 41; 影村 is a plausible Japanese surname and place name). Pick a fallback name now.
- Choose the final bundle id and Android package name (a Play package name can never change), replace `com.toadstoolkingdoms.app` in the Capacitor config, both native projects, the Java package folder and the server's bundle lists.
- Register a domain. Decide the hosting region and the crash-report region and write both into the privacy policy.
- Fill every field in `public/legal-config.js`: operator name, postal address, phone, responsible person, support email, deletion URL, EU and UK representatives (needed when selling in the EU/UK without an establishment there), hosting and crash-report regions, governing law, the four retention periods, the terms effective date. Then remove the test that asserts they are empty.
- Appoint the UK Online Safety Act responsible person and, for Brazil, a legal representative and a data-protection officer (LGPD *encarregado*). For India, name a grievance officer with a contact and response commitment.

### 6.2 Legal reviews (blocks EU, UK, Japan, Brazil, Germany, India)

- Lawyer review of the privacy policy and terms per target market: GDPR Article 13 completeness (controller identity, processors with regions, automated decisions note), CCPA notice at collection, German Impressum, UK Children's Code DPIA, Brazil ECA Digital (self-declared age is not accepted for minors' social features), India IT Rules and DPDP, Japan 特定商取引法 notice and 資金決済法 prepaid-balance obligations (the ¥10M report is specified in `docs/legal/JAPAN.md` but not built).
- Decide the under-13 strategy: offline-only, a full COPPA/Families programme, or internal-operations-only data. The current middle path (online play, push tokens, adult chat visible, 13+ declared) is the weakest position.
- Decide whether to display real-money equivalents for Jade-priced items in the EU (CPC virtual-currency principles, active enforcement in 2025–2026).
- Decide the European Accessibility Act position (micro-enterprise exemption or an accessibility statement plus WCAG 2.1 AA purchase flow).
- Decide the Apple `CONSUMPTION_REQUEST` policy (answering it needs customer consent the game does not collect; not answering favours refunds).
- Define what counts as a "significant update" for the iOS age-range acknowledgement flow.
- Adopt the terms (set the effective date) and the community rules in each launch language.

### 6.3 Store accounts and declarations

- Apple Developer Program: Paid Apps agreement, bank and tax, Small Business Program. App Store Connect: the new App ID with Sign in with Apple, Game Center, Push and Declared Age Range capabilities; keys for Sign in with Apple, App Store Server API and APNs; the server-notifications URLs (production and sandbox) and the Sign in with Apple server-to-server notification URL; EU DSA trader declaration with an address that matches the legal pages; the age-rating questionnaire (Contests: Frequent; Age assurance: Present; Messaging and UGC: Yes); privacy label per `docs/store/PRIVACY.md`; export compliance; Korea rating derives automatically.
- Google Play Console: identity verification, payments profile, the new package; upload keystore and Play App Signing; the three upload-key secrets in GitHub so the `aab` job actually builds; Data safety form; account-deletion URL (must show the listing name); target-audience decision (see 6.2); IARC questionnaire; Age Signals API access request; SKU age ratings for Texas; a service account for the Play Developer API and the RTDN Pub/Sub subscription; license testers; closed testing with 12 testers for 14 days (new personal accounts).
- Create the in-app products in both consoles with the store ids in `store.json` (eleven products including `jade_pinch` and `clan_stipend`; update `docs/SHIPPING.md` 3b first), typed consumable, with the stipend described as "30 Jade payments", never "monthly". Set regional price templates and decide a low-income-market pricing policy. Fix `ios/App/Products.storekit` to the new ids before local StoreKit testing.
- Firebase project for FCM and `google-services.json`; OAuth web client for Sign in with Google; optionally Play Games.
- Set `VITE_APP_STORE_URL`, `VITE_PLAY_STORE_URL`, `VITE_PUBLIC_URL`, `VITE_SERVER_URL`, `VITE_SUPPORT_EMAIL` and the privacy/support/community URLs in the build secrets; add them to the release checklist.
- Register territories: exclude mainland China, Vietnam (unless a licensed partner exists), Indonesia until PSE registration, and sanctioned markets; expect no payments in Russia and Belarus.

### 6.4 Hosting and operations (blocks online play)

- Choose and pay for: a Postgres with point-in-time recovery in the primary region, a Redis, two API instances, object storage for backups, Sentry, Prometheus/Grafana or an equivalent. Set every production secret (`DEPLOY_ENV=production`, per-person `ADMIN_TOKENS`, `ADMIN_ALLOW_IPS`, `METRICS_TOKEN`, `SENTRY_DSN`, `SUPPORT_CONTACT`, `CORS_ORIGIN`, `TRUST_PROXY` verified with two phones, `MIN_CLIENT_BUILD` policy, Apple and Google keys, APNs and FCM keys).
- Point `api.<domain>` with A and AAAA records at it, verify HSTS and IPv6 with `tools/ops/check-domain.mjs`, set the `staging` and `production` GitHub environments with their deploy hooks and required reviewers, so the server workflow actually deploys.
- Move backups off GitHub artifacts to an owned bucket on a schedule next to the database; keep the backup key outside GitHub; run one real restore into a fresh database before launch.
- Run `npm run server:bench` and `npm run server:load` on the real host to size workers, queue, instances and rate limits; record the numbers.
- Set up a pager for the existing alert rules, an on-call rota, a status/notice process, and a weekly review of desyncs, refunds, forfeits and staff actions.
- Staff: at least one trained moderator for the report and deletion queues (DSA and UK OSA timelines), the support mailbox, and written refund, chargeback and cheating-ban policies.
- Deploy the server before the first store build, from the same commit, with migrations run first.

### 6.5 Devices and store testing (blocks "it works on cheap phones")

- Buy or borrow: a 2 GB Android Go phone, a common 3–4 GB Android, a 2019-class iPhone on iOS 15–16, and one current flagship each. Measure cold start, peak memory over a 30-minute session (scouting several Keeps, a Trial, a replay), sustained FPS in a full battle, battery per hour, behaviour on airplane mode, 3G throttling, low storage, suspension and kill, and the Canvas fallback with WebGL disabled. Set the quality thresholds from these numbers.
- Signed builds: TestFlight external testers and a Play closed track. Test sandbox purchase, pending purchase, cancellation, repeat consumption, restore, refund and refund reversal on both stores; Sign in with Apple and Google reinstall and second-device recovery; push delivery and quiet hours; Android Back; App Links and Universal Links; the Play Age Signals prompt and the iOS Declared Age Range flow in Sandbox (needs Xcode 26.5 or later; move CI to `macos-26`).
- Check the signed AAB with APK Analyzer for 16 KB page-size compliance (Firebase Messaging arrives via the push plugin) and record the installed size.
- Listen to the sound and music on a phone speaker and with headphones; nobody has.
- Pinch-zoom, large text, screen-reader and reduced-motion checks on real devices.

### 6.6 Art, content and audio (blocks a competitive store presence)

- Commission a human artist for: four to six hero and warrior faces (Sensei Hoshi plus a playable hero and three rival clan leaders) for the icon, splash, store, packs and result screens; ground and environment painting (grass, dirt, moss, paths, paddies, tree clusters, cliffs); animation key poses for the ten roles (walk, attack, hit, fall) that the procedural painter can turn into frames; a concept pass for the Keep, Dojo and Courtyard at tiers one and two; a visual language for damaged buildings; a character-led icon with A/B variants.
- Commission or compose two 60–90 s music tracks (village, battle) plus stingers, exported as OGG/AAC; keep the synthesised engine for effects.
- A native Japanese speaker's cultural review of names, kamon, buildings and the mentor (already an owner item); decide whether to keep "Jade".
- Writing: a story premise, the hero's and rival leaders' two-line bios, named rival clans for the generated opponents, event names for a 12-month calendar including seasonal content.

### 6.7 Localization (blocks every non-English market)

- Only after the text layer exists (section 5, step 9): run the translation sessions per `locales/CLAUDE.md` for the wave-1 languages (Spanish, Portuguese-Brazil, French, German, Japanese, Korean, Traditional Chinese, Indonesian, Turkish), then a native-speaker review of each.
- Translate the store listing, screenshots captions, community rules, moderation notices and the eight preset chat phrases.
- Build per-language profanity, slur and grooming/contact blocklists with native speakers; the current list is 30 English words.
- A localised typography review for Japanese, Chinese, Korean, Arabic, Thai and Hindi.

### 6.8 Marketing and launch (blocks making money)

- Build a landing page (features, screenshots, store badges, privacy link, "play in browser"), add Open Graph tags and manifest screenshots so shared links unfurl.
- Produce store assets per wave-1 language: title, subtitle, short and long description, keywords without duplicates, six to eight captioned screenshots at the sizes the screenshot tool already produces (after the battle-frame fixes), a 1024×500 feature graphic, a 15–30 s vertical preview video.
- Decide the web build's role: a browser demo capped at Keep 4 that hands off to the app via sign-in, or full web with web payments later.
- Set up Google Play pre-registration with a non-random reward (a Keep skin delivered by server grant) and Apple pre-order, three to six weeks before launch.
- Open a Discord (announcements, replays, bug reports), a subreddit and one short-form video channel; link them from the support page; staff them (this is also a moderation duty).
- Plan the soft launch: wave A in the Philippines, Canada, Australia and New Zealand (English UI, cheap installs for funnel data plus tier-1 monetization signal, no licensing issues), 8–12 weeks; wave B adds Brazil, Türkiye and Indonesia after the legal items, Japan after the seller facts, balance report and translation.
- Budget: roughly $15–40k paid acquisition for the soft launch (5–10k installs at $3–5 CPI, enough for D7 confidence) plus $5–10k creative; global spend only if the KPIs pass. These are vendor benchmark figures and should be checked against Adjust or AppsFlyer reports before committing money.
- Set KPIs and kill criteria before spending (needs the telemetry in section 5, step 5): tutorial completion, first raid, D1/D7/D30, payer conversion by day 7, ARPDAU in tier-1, crash-free sessions from Play Vitals and Xcode; a written "pause and fix" threshold.
- Plan review responses within 48 hours, watch for "all bots" and "pay to win" themes, and schedule an in-app review prompt only after a win.
- Yearly: rotate keys, renew the Apple membership, track SDK and target deadlines (Billing 9 is supported to August 2028; Play target API rises every year).

---

## 7. Method and limits

Seven independent read-only investigations (hardware and runtime, art and GUI, economy and game theory, store compliance and international, backend, code quality, retention and marketing) each re-checked a sample of the earlier audits' claims and then searched for new problems with file-and-line evidence. Arithmetic on the economy came from small scripts over the JSON data files; the art pass drove the sandbox with Playwright and judged screenshots; the compliance pass re-read current official policy pages on 2026-11-05 and cites them. Chromium emulation is not a device; a model player is not a player; policy drafts are not legal advice. Numbers from vendor benchmark blogs are marked as such in the marketing report.

Not done in this pass, and still not done anywhere: physical phones, signed store builds, real storefronts, App Review or Play review, live URLs, legal review, real players, real revenue.
