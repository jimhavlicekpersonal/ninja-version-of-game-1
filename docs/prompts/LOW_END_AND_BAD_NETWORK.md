# Agent prompt: cheap phones, old phones and bad networks

Paste everything below the line into a new agentic AI session (INTEGRATION role, see `AGENTS.md`). The work is ordered: do the steps in order, one commit per step, and report measurements after each.

---

You are working on **Kagemura: Ninja Clans**, a TypeScript + Phaser 3.90 base-building game shipped as a PWA and as iOS/Android apps (Capacitor 8). Players in poorer markets use cheap phones (1–3 GB RAM, slow CPUs), old operating systems, and weak 2G/3G service. Make the game start and run well for them.

**Rule for every decision: tap to play, even on one bar.** Nothing between the tap and play waits on the network; every download is small, in the background and optional; a byte ships only if a player on a slow connection would want it.

## Read first

`CLAUDE.md`, `AGENTS.md`, `compartments.json`, `src/presentation/CLAUDE.md`, `src/backend/CLAUDE.md`, `docs/prompts/DOWNLOAD_AND_LANGUAGE.md` (the language work; do not duplicate it), `docs/backend/PVP_ROADMAP.md`.

Stay in compartment lanes. Each step names its owner; if you are not allowed to edit a file, write the request in the matching `REQUESTS.md` instead.

## What was measured (November 2026)

These come from `npm run build`, then `npm run perf:lowend` and `npm run perf:profile` (`tools/perf/`). Those scripts run headless Chromium with network throttling and a slowed CPU (×2 for a mid-range phone, ×4 to ×6 for a cheap one) at 360×640, 2× density. Headless Chromium draws graphics in software, so the graphics-upload time overstates a real phone. The memory figures are real.

| Item | Value |
|---|---|
| First visit until playable | 562 KB (JS 493 KB gzip, CSS 9 KB, fonts 48 KB) |
| Offline cache, fetched in the background | about +340 KB. `icon-512.png` (149 KB) and `icon-maskable-512.png` (139 KB) are needed only to install to the home screen. |
| Ready to play: 4G, mid phone | 4.1 s |
| Ready to play: weak 3G (750 kbps, 300 ms), cheap phone | 13.1 s |
| Ready to play: slow 3G (400 kbps, 2 s RTT), cheap phone | 27.0 s |
| Ready to play: 2G/EDGE (240 kbps, 840 ms), cheap phone | 30.3 s |
| Repeat start, offline, cheap phone | 8.4 s |
| Start-up profile, cheap phone (9.3 s) | 5.5 s Phaser `_processTexture` (GPU upload of 214 textures); about 0.4–0.8 s painting; about 0.8 s JS parse and compile |
| Texture memory | 115 MB at 2× density, 112 MB at 1.5×. It doesn't follow the screen. The estimated process total is 300–400 MB of RAM. |
| Battle simulation | about 1 ms per tick on a cheap phone, against a 100 ms budget. Not a problem. |
| Server battle re-sim | 27 ms (Keep 3), 140 ms (Keep 8), 203 ms (Keep 15). It runs on the Node main thread (`server/core/pvp.ts` `runBattle`, `server/core/groveRaid.ts` `runBattle`). |

Why phones fail:
- **Memory:** 1 GB Android Go phones likely crash. On 2 GB phones the game is likely closed when the player switches apps, so every return is a full restart.
- **Old OS:** the code uses `structuredClone` (`src/gameplay/sim/save.ts`, `village.ts`, `defense.ts`, `offline.ts`, `src/app.ts`) and `Array.prototype.at` (`src/gameplay/sim/army.ts:116`). These need Chrome/Android WebView 98+ and iOS 15.4+. The app declares Android `minSdkVersion 24` (`android/variables.gradle`) and iOS `IPHONEOS_DEPLOYMENT_TARGET = 15.0` (`ios/App/App.xcodeproj/project.pbxproj`).
  - A WebView older than 80 can't parse the ES2020 bundle (`build.target: 'es2020'` in `vite.config.ts`). The boot card then shows "Lighting the lanterns…" forever.
  - WebView 80–97 and iOS 15.0–15.3 show "Something went wrong starting the game" (`src/main.ts`, `boot().catch`).
  - People on expensive data often turn off Play Store updates, so they keep old WebViews.
- **Updates:** every deploy re-downloads everything. `sw.template.js` names its cache by build id and deletes old caches, and Phaser shares one hashed file with the game.

## Step 1: every phone can start the game (INTEGRATION + BACKEND)

1. **Polyfills before the bundle.** Add a tiny classic (non-module) inline script in `index.html` that defines:
   - `structuredClone`, only if missing. A deep copy is enough: village state and saves are plain JSON-compatible data. Verify that, and handle `undefined` values the way the code expects.
   - `Array.prototype.at`, only if missing.
   - Keep it under 1 KB. Do not edit `src/gameplay/sim` for this.
2. **"Too old" screen instead of a hang.** In the same inline script, detect a browser that can't run the bundle (no ES modules, or no optional chaining via a `new Function` probe, or no `Promise.allSettled`). Show a clear message in the boot card:
   - Android: "Update Android System WebView", with a link to its Play Store page.
   - iOS: "Update iOS".
   - Also add a timeout: if `#boot.done` hasn't appeared after 45 s and no error was shown, offer "Reload" and say what to update.
3. **Honest minimums.** Find the oldest WebView and iOS that really work after step 1:
   - Set the iOS deployment target to that version (15.0 if the polyfills make it work, else 15.4).
   - Keep Android `minSdkVersion 24` only if WebView 80 works.
   - Write the real minimums into `docs/SHIPPING.md` and the root `CLAUDE.md` Device targets.
4. Tests: a unit test for the polyfills (run them in Node with the globals deleted), and a Playwright check that the too-old screen appears when you inject a script that removes `structuredClone` and the probe features.

## Step 2: cheap phones run comfortably (GUI owns `src/presentation/render/`)

Goal: under 50 MB of textures on low-memory phones, and start-up GPU upload cut by at least 70%.

1. **Graphics quality tiers** in `src/presentation/render/assets.ts` (`BUILDING_SCALE` 2.5, `HD_SCALE` 2.5–3, `GROUND_SCALE` 1.5) and `src/main.ts` (`renderScale` up to 3):
   - **Low:** buildings 1.5×, warriors and badges 2×, ground 1×, canvas `renderScale` at most 1.5.
   - **Standard:** today's values.
   - Pick the tier at start-up:
     - Low when `navigator.deviceMemory` ≤ 2, or `navigator.hardwareConcurrency` ≤ 4 with a small screen, or WebGL `MAX_TEXTURE_SIZE` < 4096.
     - iOS doesn't report memory: use screen size and model hints (2 GB iPhones such as the 7 and 8 get Low).
   - Add a Settings → Graphics choice (Automatic / Low / Standard), stored as a device preference.
   - Scenes already size sprites from the image (`buildingScale`, `troopSize`), so gameplay must look the same, just softer.
2. **Create textures only when needed.** Today `generatePlaceholders` paints all 214 textures at boot: every building × 3 tiers, all warriors and all badges.
   - Paint only what the current village and screen use: buildings and tiers present, warriors trained or in the army panel.
   - Paint the rest on demand: when a building is placed or upgraded, when a battle loads its base and army, when the Codex opens.
   - A missing texture must never show a broken sprite: paint it synchronously on first use, or show the construction placeholder for one frame.
   - Free battle-only textures after the battle.
3. **Show the village sooner.** Hide the boot card as soon as the village scene has what is on screen.
4. Respect the real-art override (`public/art/manifest.json`): real images still win over painted ones.
5. Measure with `npm run perf:lowend` and `npm run perf:profile`. Report texture MB per tier and start-up time per profile. Targets on the cheap-phone profile:
   - Low tier ≤ 50 MB.
   - Offline start ≤ 4 s.
   - Slow 3G first visit ≤ 22 s.
6. Look at it in the browser (`npm run dev`, `?debug`) at 360×640 and 390×844 in both tiers: village, Build menu, battle, Codex. The checks in `src/presentation/CLAUDE.md` must still hold.

## Step 3: less data per player (BACKEND owns `src/backend/pwa/`; INTEGRATION owns `vite.config.ts`)

1. Don't precache `icon-512.png` or `icon-maskable-512.png` (the `serviceWorker()` plugin in `vite.config.ts`). The browser fetches them when needed for install.
2. Split Phaser into its own long-lived chunk (`build.rollupOptions.output.manualChunks` or the Vite 8 equivalent).
3. Rewrite `sw.template.js`:
   - Cache hashed assets by file name. Files whose names didn't change survive a deploy.
   - Delete only files no longer in the precache list.
   - Download the new version in the background and use it on the next launch.
   - Never block start-up on the network: the page navigation is network-first with a short timeout (about 3 s), then the cache.
4. Measure: bytes for a deploy that changes only game code. Target ≤ 200 KB, against 560 KB today. Add the test described in `docs/prompts/DOWNLOAD_AND_LANGUAGE.md` (deploy N, then N+1).

## Step 4: server ready for weak connections (BACKEND owns `server/`)

1. Run battle re-simulation (`runBattle` in `server/core/pvp.ts` and `server/core/groveRaid.ts`) in a pool of `worker_threads` sized to the CPU count, so a 200 ms Keep 15 check never blocks other requests.
   - Results must be identical: same seed, same deployments, same result.
   - Add a test that compares worker results with in-process results, and a load test showing p95 latency of other routes while battles run.
2. Add a re-sim timing benchmark to the server tests, and record the measured ms per battle per Keep in `docs/backend/PVP_ROADMAP.md`, replacing the "assumed 20–100 ms".
3. **Prefetch opponents.** Let the client hold up to 3 match tickets fetched while online, so an attack can start with no network.
   - Check the ticket lifetime (`TICKET_TTL_MS`, 1 hour) and the lock (`TICKET_LOCK_MS`). Make a prefetched ticket honest and fair: a defender can't be held locked by unused tickets, and an expired ticket can still be played as practice.
   - This changes the protocol: bump it per `AGENTS.md`, and keep the server accepting the previous protocol.
4. **Compress requests and responses** (gzip or brotli in Fastify; compressed request bodies from the client for battle submissions).
5. The client's light sync is already every 60 s and base upload every 2 min (`src/backend/net/connection.ts`). Keep it at least that slow. Change the planned protocol-7 economy batch in `PVP_ROADMAP.md` from 15 s to 60 s or on events.

## Step 5: keep it fixed (INTEGRATION)

1. Turn `tools/perf/lowend.mjs` into a check with budgets that fails when a number is exceeded:
   - first visit ≤ 600 KB
   - Low-tier textures ≤ 50 MB
   - offline start on the cheap profile ≤ 4 s
   - slow 3G first visit ≤ 22 s

   Run it in CI after the build. Keep it cross-platform (no bash-only syntax).
2. Update the root `CLAUDE.md` (Device targets, Art resolution line) and the compartment briefs to describe the tiers, lazy textures, minimum OS versions and the budgets.
3. Write `docs/rebuild/LOW_END.md`: before and after numbers for every metric above, and a manual checklist for the owner:
   - a 2 GB Android Go phone
   - an iPhone 7 or 8
   - a real 2G/3G connection: install, first start, switch apps and return, a battle, offline start

## Rules

- Never lose a save. Never change battle results. Run the whole suite after each step: `npm test` (including the boundary test), `npm run build`, `npm run typecheck:server`.
- Don't bump `SAVE_VERSION` unless village state changes. The graphics tier is a device preference, not save data.
- No new runtime dependencies without a measured reason.
- Report each step with measured numbers, not estimates. Say plainly what you could not measure (real GPUs, real devices, native app sizes).
