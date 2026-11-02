# Toadstool Kingdoms – project instructions

## Device targets (added by the owner after the original spec)

The game must be easy to download and run on:

- a **Windows 11 laptop** (mouse, keyboard, trackpad),
- a **Google Pixel 7** (Android, Chrome),
- an **Apple iPhone 17** (iOS, Safari).

How this is met:

- **Phases 1–5:** the game ships as an installable web app (PWA) hosted on **GitHub Pages** at
  https://jimhavlicekpersonal.github.io/toadstool-kingdoms/, deployed by `.github/workflows/deploy.yml` on every push to `main`.
  The Vite build uses `base: './'` so the same build works on Pages, any static host and later inside Capacitor.
  A hand-written service worker (`src/pwa/sw.template.js`, emitted by a small plugin in `vite.config.ts`) makes it work offline.
- **Local testing:** `npm run dev` on the laptop; `npm run dev:lan` exposes it to phones on the same Wi-Fi.
- **Controls:** touch first (drag to pan, pinch to zoom, tap), plus mouse wheel zoom, click, Esc/Enter on the laptop.
  The layout respects iPhone safe areas (Dynamic Island, home bar) and works in portrait and landscape.
- **Saves are per device** until the Phase 6 backend. Settings has Copy save code / Load from code to move a village between devices.
- **Testing on device without dev tools:** Settings has an FPS display, time-skip tools ("+1 hour", "Simulate 8 hours away") and an analytics event viewer.
- **Phase 6:** Capacitor for **both iOS and Android**. iOS builds need a Mac or a cloud macOS build (e.g. GitHub Actions macOS runners or Codemagic) plus the Apple Developer Program for TestFlight and StoreKit sandbox. Ask the owner whether to add Google Play Billing behind `PaymentProvider` for Android.
- Keep npm scripts cross-platform (Windows): no bash-only syntax in `package.json`. `.gitattributes` normalises line endings.

## Decisions made during Phases 2-6

- Art direction (owner request): smoother, softer, Nintendo-like look. All art is still generated in code (`src/render/art/`).
- Save format is versioned (`src/sim/save.ts`, currently v6) with a migration step per version. Bump `SAVE_VERSION` and add a step for every state change.
- Progression pacing is checked by a model-player test (`tests/balance/`). Rerun it after changing costs, times or loot.
- Offers have a `minAccountHours` field so brand-new players are not shown the builder offer in their first minutes.
- Real prices appear only in the Store and its confirm step (pass and offer popups link to the Store).
- Phase 6: Capacitor 8 (iOS + Android). iOS purchases use a local StoreKit 2 plugin (`ios/App/App/TkStorePlugin.swift`, registered in `TkViewController.swift`). **Android purchases are disabled** (`UnavailablePaymentProvider`) until Google Play Billing is added; ask the owner before adding it.
- PvP server: Fastify 5 + `pg`, bundled with Vite (`vite.server.config.ts`). Online play turns on when the build has `VITE_SERVER_URL`; with it, real raids replace bot raids. The village economy stays on the device.
- The owner-only steps (Apple account, App Store Connect products, secrets, server hosting) are in `docs/SHIPPING.md`.

## Stack decisions made during Phase 1

- Phaser **3.90** (spec says Phaser 3; Phaser 4 exists but was not adopted).
- Vite **8** and Vitest **5** (Vite 7 + Vitest 4 hit an npm peer-dependency resolution bug).
- TypeScript 5.9. No other runtime dependencies. The HUD is plain DOM + CSS (no UI framework).

---

## Original specification

### Goal

Build Toadstool Kingdoms, an original cartoon-fantasy base-building and raiding game, from scratch. It plays like Clash of Clans: build a village, collect resources, train troops, raid other bases, defend your own, join an alliance. Use only original names, art and audio. Never use any Clash of Clans or Supercell name, character, image or sound.

### Tech stack

- TypeScript, Vite, Phaser 3 for the isometric 2.5D view.
- Vitest for unit tests.
- Persistence: IndexedDB through a small wrapper (Phases 1 to 5); a Node + Fastify + Postgres backend only in Phase 6.
- Art: generate placeholder sprites in code (rounded shapes, flat colors, simple faces) so the game is playable with zero external assets. Keep every sprite behind an asset key so real art can be swapped in later.
- Mobile-first layout, touch controls, 60 fps target on a mid-range phone browser.

### Architecture rules

1. `src/sim/` holds all game rules as pure, deterministic functions with no Phaser imports. Rendering only reads sim state and sends commands.
2. `src/data/*.json` holds every balance number: costs, build times, HP, damage, unlock levels. No magic numbers in code.
3. Time comes from an injected `Clock` interface. Timers store `startedAt` and `endsAt` timestamps; never count down in a loop. Tests fast-forward the clock.
4. Offline progress is computed on load from elapsed time: collector output, finished upgrades, simulated raids against the player.
5. Battles run on a fixed-step simulation (10 ticks per second) seeded by an RNG, so a battle can be replayed exactly from `seed + deployments`.
6. Payments go through a `PaymentProvider` interface. Ship `MockPaymentProvider` (instant success, logs the sale) until Phase 6.
7. Log analytics events (`session_start`, `upgrade_start`, `skip_used`, `raid_end`, `offer_shown`, `purchase`) to a local event store with a debug viewer.

### Core systems and starting numbers

Treat every number below as a starting value to tune in playtests.

- Map: 40 x 40 tile grid. Buildings occupy 2 x 2 to 4 x 4 tiles. Bramble hedges are 1 x 1.
- Resources: Acorns and Dew (soft), Nightsap (soft, Elder Toadstool 7+), Moonstones (premium).
- Collectors: produce per hour by level; each holds 8 hours of output, then stops. Tapping collects into storage.
- Storage: caps how much the player can hold; 20% of stored and 50% of uncollected resources are raidable.
- Builders: start with 2 Beaver Builders; huts 3, 4 and 5 cost 250, 500 and 1,000 Moonstones.
- Upgrade times: level 1 takes 10 seconds; each level multiplies time by about 2.2, reaching roughly 7 days at the top of Elder Toadstool 10.
- Elder Toadstool gating: each hall level unlocks new buildings, building level caps and troop types. Show the next level's unlocks in a preview panel at all times.
- Skip cost (Moonstones): linear interpolation through 1 minute = 1, 1 hour = 20, 1 day = 260, 1 week = 1,000.
- Resource top-up cost (Moonstones): linear interpolation through 100 = 1, 1,000 = 5, 10,000 = 25, 100,000 = 125, 1,000,000 = 600.
- Troops: Hedgehog Roller (melee, nearest target), Frog Lobber (ranged), Beetle Brute (tank, targets defenses), Owl Bomber (air, targets defenses), Mole Digger (burrows under hedges). Trained in the Burrow Barracks, housed in Army Camps with a housing cap.
- Defenses: Acorn Cannon (ground), Pinecone Catapult (splash, slow), Wasp Nest (air and ground), Firefly Tower (air). Hidden traps unlock at hall 3.
- Battle: 3-minute timer; troops path with A* around hedges and break them when blocked. Stars: 1 for 50% destruction, 1 for the Elder Toadstool, 1 for 100%. Loot scales with destruction.
- Scouting: opponents are generated bases matched to the player's leaf rank, each with randomized loot. Pressing Next costs a small Acorn fee and rerolls.
- Being raided: while offline, simulate 0 to 3 bot raids against the real base layout. On return, show a defense log with replays. Losing 30% or more grants a 12-hour shield.
- Leaf ranks: trophies won and lost per raid; leagues Sprout, Fern, Oak, Elder; monthly reset with a reward chest by league.

### Monetization systems

- Store screen: Moonstone packs at $1.99 / $4.99 / $9.99 / $19.99 / $49.99 / $99.99, with Moonstones per dollar rising with pack size. Real prices appear only on this screen.
- Tutorial grant: 500 Moonstones; the tutorial makes the player finish two timers instantly with them.
- Lantern Pass: a 30-day season with a free track and a premium track ($4.99). Premium gives 20% faster builds, a hero skin and extra rewards. Points come from daily tasks (3 per day) and weekly challenges.
- Offers engine: rule-driven offers with a 24 to 72 hour timer, shown at most once per session. Starter rules: first-purchase pack after the first wait over 1 hour; builder pack when all builders are busy; war-prep pack 24 hours before a Grove Raid; resource pack after a heavy defense loss.
- Cosmetics: hero skins and village scenery sold for Moonstones; purely visual.
- Free Moonstones: achievements, clearing forest obstacles, and pass milestones, so a free player always earns some.
- Every offer reads its rule, price and timer from `src/data/offers.json`, so it can be changed without code.

### Social systems

- Groves (alliances): in Phases 1 to 5, the player joins a Grove of 10 to 20 bot members with names, chat lines and activity schedules.
- Donations: members request troops; donating gives XP and fills the player's own reinforcement slot.
- Grove Raid: a weekly 2-day event against a bot Grove. Each member gets 2 attacks; total stars decide the winner and a shared reward chest.

### Build phases

Finish, test and run each phase before starting the next. Commit at the end of each.

1. **Village core.** Grid, placement and moving, 6 building types, collectors, storage, 2 builders, upgrade timers, save and load, offline progress.
   - Done when: timers and collectors survive a reload and a simulated 8-hour absence; sim tests pass.
2. **Raiding.** Barracks, Army Camps, troop training, generated opponent bases, battle sim with pathing, stars, loot, replays.
   - Done when: a 3-minute raid runs at 60 fps on a phone browser and replays identically from its seed.
3. **Defense and progression.** Offline raids against the player, shields, defense log, leaf ranks, Elder Toadstool levels 1 to 6.
   - Done when: a new player can reach hall 3 in about 1 hour of play, and hall 6 takes about 2 weeks of normal play.
4. **Economy and monetization.** Moonstones, skip and top-up, store with mock payments, builder huts, offers engine, Lantern Pass, daily tasks, cosmetics.
   - Done when: every purchase path works end to end with the mock provider and is logged in analytics.
5. **Social.** Groves with bot members, chat, donations, weekly Grove Raid.
   - Done when: a full Grove Raid week can be fast-forwarded in a test and pays out correctly.
6. **Polish and ship.** Tutorial, sound, particles and screen shake, push reminders, Capacitor wrap for iOS, StoreKit through the `PaymentProvider` interface, backend for real asynchronous PvP.
   - Done when: a TestFlight build installs and a sandbox purchase completes.

### Working rules for Claude Code

- Plan each phase in a short checklist before writing code.
- Write sim tests first for timers, costs, loot and battle outcomes.
- Run `npm test` and `npm run dev` at the end of each phase and fix what breaks.
- Ask before adding a new dependency or changing the stack.

### Guardrails

The mechanics above are standard, but a few lines are legal or reputational risks, so build them in from day one.

- Original IP only. Game mechanics can be borrowed; names, characters, art, sounds and UI layouts copied from Clash of Clans cannot.
- Randomized paid items. If you ever sell chests or loot boxes, Apple's App Review Guidelines (section 3.1.1) require disclosing the odds before purchase.
- Dark patterns. The FTC's Epic Games settlement included $245 million in refunds over purchase flows that tricked players into buying. Keep a clear confirm step on every purchase and never place buy buttons where a stray tap lands.
- Minors. Add a spending cap and purchase confirmation for players who indicate they are under 18, and keep chat filtered.
- Healthy play. Optional: a session reminder after 60 minutes and a monthly spend summary. These cost little and build trust with the players who spend most.
