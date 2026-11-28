# Soak, long-session and production-PWA audit

Lens: memory and resource leaks, frame pacing over time, service-worker update and offline paths, in a real browser.
Build under test: the existing `dist/` (never rebuilt), `?debug` sandbox (separate save, never online).
Scratch (scripts, CSVs, logs, heap snapshots): `(session scratch, not kept)/soak/`.

**Correction to the interim headline.** The first long run reported "721 -> 195,230 DOM nodes, 86 retained battle sessions, renderer 209 -> 734 MB". Most of that was my own harness: it waited for the result screen with Playwright's `waitForSelector`, which keeps a handle to the element, so every result screen and its battle stayed alive. The heap snapshot shows it (retainers named "DevTools console"). After removing the handles, battles leave nothing behind. One real leak remains (SOAK-1, the Store), and it is much smaller than the headline suggested.

## 1. What ran

| Run | Setup | Cycles / time | Errors |
|---|---|---|---|
| Throttled soak (`out-thr/`) | 360x640, DPR 2 (canvas 720x1280), touch, `deviceMemory` 2 (low profile, 30 FPS limit), CPU throttle 4x, software GL | 108 cycles, 73.7 min | 0 console errors, 0 page errors, 0 unhandled rejections |
| Clean soak (`out-fast/`, harness handles removed) | same, DPR 1, no CPU throttle | 26 cycles, 13.7 min | 0 / 0 / 0 |
| Verification (`out-verify/`) | as the clean soak, then the Store's button set emptied and GC forced | 6 cycles | 0 |
| Per-action bisect (`diag.cjs`, `store30.cjs`, `setdelta.cjs`) | each action alone, 5 to 30 repeats, counters after 3 forced GCs | 27 actions | 0 |
| Service worker (`swtest.cjs`, own static server on 5314, `Cache-Control: max-age=600` like GitHub Pages) | copies of `dist/` as v1, v2 (every JS chunk renamed), v3, v4 (no `sw.js`) | 1 pass | see section 3 |

One cycle = village idle, open and close 16 HUD panels plus Codex, Trials, Battle log, a building sheet and a toast, then one battle (rotating practice, Shadow Trial, scouted raid, daily drill, "Test my defenses" replay) with hand deployment and a squad order, speed x4, End battle, result screen, "What if" every 7th, "Watch replay" every 2nd, home. Village: the showcase village at Keep 6 (120 buildings, full army).

### Measurement table (forced-GC samples)

| Metric | Start | End, throttled run (108 cycles) | End, clean run (26 cycles) | Verdict |
|---|---|---|---|---|
| Elements attached to the document | 436 | 587 | 587 | flat |
| DOM nodes alive (CDP) | 721 | 195,230 (harness handles included) | 55,206 | leak, see SOAK-1; clean run after emptying the Store's set: 8,545 -> 1,150 |
| JS event listeners (CDP) | 119 | 9,665 (harness included) | 2,002 | same cause; 402 -> 181 after emptying the set |
| JS heap after GC | 8.5 MB | 29.9 MB (harness included) | 15.9 MB (14.3 at cycle 5; +0.08 MB per cycle) | small |
| Renderer process RSS | 209 / 196 MB | 734 MB (harness included) | 345 MB | not attributable: includes 16 MB of new texture canvases and allocator noise |
| GPU process RSS (software GL) | 315 / 187 MB | 356 MB | 199 MB | bounded |
| Phaser textures (count / pixel MB) | 174 / 28.9 | 258 / 49.7, flat after about cycle 40 | 241 / 42.4 | bounded |
| Painted building art | 4.5 MB | 23.9 MB (plateau) | - | bounded |
| Village scene children / tweens / timers | 183 / 39 / 11 | 197 / 51 / 11 | 195 / 50 / 11 | flat |
| Battle scene children after home | 0 | 0 | 0 | flat |
| Live BattleSession objects | - | 86 (harness) | **1** | bounded |
| Phaser emitter listeners (game / scale / village / battle) | 18 / 6 / 47 / 22 | 17 / 6 / 47 / 22 | same | flat |
| Listeners on window and document (exact) | 68 | same set | same set | flat |
| Pending timeouts / active intervals | 2 / 5 | 0 / 6 | 0 / 6 | flat (the 6th is the music loop) |
| `<canvas>` in the document | 1 | 1 | 1 | flat |
| Web Audio nodes created (osc / gain / source) | 0 | 19,994 / 85,822 / 65,825 | - | none alive after GC (0 / 3 / 0), one AudioContext: no leak |
| Save size | 14.3 KB | 177.6 KB (max 177.7) | 160.5 KB | bounded: plateau at 10 logged battles, about 16 KB each |
| IndexedDB writes | - | - | 63 writes, 6.6 MB in 13.7 min | whole village rewritten each time (known, section 5) |
| localStorage | 1.1 KB | 1.2 KB | - | flat |

### Frame pacing, first vs last 10 cycles (throttled run)

"Work" is the game's own step plus render per frame; the rAF interval also includes machine load from other audit jobs.

| Phase | Cycles | Machine load | rAF p50 / p95 / p99 / worst (ms) | Frames over 50 ms | Work p50 / p95 / p99 (ms) |
|---|---|---|---|---|---|
| Village and panels | 1-10 | 11.6 | 105 / 415 / 703 / 2,783 | 79 % | 2.6 / 11.4 / 73.2 |
| Village and panels | 99-108 | 2.7 | 45 / 373 / 478 / 3,300 | 33 % | 2.4 / 4.9 / 15.2 |
| Battle | 1-10 | 11.2 | 92 / 255 / 395 / 767 | 83 % | 18.0 / 47.0 / 108.5 |
| Battle | 99-108 | 2.6 | 68 / 123 / 165 / 600 | 71 % | 18.3 / 49.6 / 70.3 |

No degradation over 74 minutes: per-frame work is flat (battle 18.0 -> 18.3 ms p50, village 2.6 -> 2.4 ms). The first ten cycles were slower only because the machine was loaded. The absolute numbers (about 15 FPS in battle) are software GL under a 4x throttle on a shared VM and say nothing about a phone's GPU.

## 2. Ranked findings (new)

| ID | Severity | Confidence | Title |
|---|---|---|---|
| SOAK-1 | MEDIUM | high | Every Store opening is kept in memory for the rest of the session: 486 DOM nodes and 15 listeners per open, never released unless a purchase starts |
| SOAK-2 | LOW | high (404 path, run); medium (slow-link path, code only) | The service worker serves the game shell for any path that does not exist; it cannot load there, says "Check your connection", and two Retry taps delete the working offline copy |
| SOAK-3 | LOW | high | "A new version is ready" is shown inside the hidden village HUD when the update lands during a battle, so the player never sees it |

## 3. Findings

### SOAK-1 (MEDIUM) Store openings accumulate: `liveBuyButtons` is only pruned during a purchase

- **Where:** `src/presentation/ui/economyUi.ts:145` (`liveBuyButtons = new Set<HTMLButtonElement>()`), `:179` (`buyButton` adds every buy button), `:153-156` (the only removal, inside `refreshBuyButtons`), which runs only from `buy()` (`:226-234`). Callers of `buyButton`: `:398` (Jade packs), `:414` (stipend), `:451` (offers), `:500` (Scroll).
- **Mechanism:** each button in the set is a DOM node, and a node keeps its whole detached tree alive, so the set holds every closed Store window (`.modal-backdrop.out`), its cards and their click listeners. A player who never buys never triggers the pruning.
- **Numbers:** 30 Store opens: 1,753 -> 16,323 nodes, 147 -> 596 listeners, set 16 -> 256 buttons (485.7 nodes, 15.0 listeners, 8 buttons per open). With three tab switches per open: 883 nodes and 19 listeners per open. Emptying the set and forcing GC: 25,154 -> 812 nodes (everything released). In the soak flow: 12 opens held 12 closed windows, 5,388 elements; 8,545 -> 1,150 nodes after emptying the set. The Jade pill and the Store button both open it. All other panels, battles, results and the replay viewer leave 0 (+-2) nodes.
- **Impact:** unbounded, but modest per open (JS heap about +40 KB; native DOM memory not isolated). It matters for players who open the Store often (the Jade pill is always on screen, and every "not enough Jade" prompt leads there). On the iPhone and Android builds prices arriving redraw the Store, so each open adds two sets of buttons. On the public web build the Jade tab draws no buy button (`noStore`), so only the Offers and Scroll tabs leak there (code read, not run).
- **Fix:** prune in `buyButton` (drop disconnected entries before adding), or clear the set when the Store modal closes, or use a `WeakRef`/query the open Store for `[data-product]` instead of keeping a set.
- **Not in the known lists** (no hit for `liveBuyButtons` or detached DOM).

### SOAK-2 (LOW) Shell fallback for paths that are not the game

- **Where:** `src/backend/pwa/sw.template.js:177-179` (`shellFor`: own cached copy, else the app shell), `:208-237` (`networkFirst`: on a 404, an error or after `NAV_TIMEOUT_MS` 3.5 s the shell is answered for any in-scope navigation); `src/backend/pwa/boot.js:327-358` (the second Retry unregisters the worker and deletes `tk-` caches).
- **Steps (run):** worker installed; open `http://localhost:5314/nope/deep` (server answers 404). The worker answers with the game page at that address; its relative URLs become `/nope/assets/index-*.js` and 404 through the worker (8 failed requests logged); the page shows "Couldn't load Kagemura. Check your connection and try again. ... Retry". Two Retry taps: 0 registrations, 0 caches, then the server's own 404 page.
- **Impact:** a mistyped, stale or folder link (for example `/de/`) shows a misleading connection error instead of the 404 page, and following its advice removes the offline copy of a working game (2.5 MB to download again; the save is untouched). By code, the same happens on a slow link (no answer in 3.5 s) for a real page outside this language's cache, such as another language's legal page.
- **Fix:** fall back to the shell only when `appPage(req)` is true; for other paths return the network answer (or redirect to the scope root). Independently, the boot guard should not clear the offline copy when the page's path is not the scope root.

### SOAK-3 (LOW) Update notice lost during a battle

- **Where:** `src/backend/pwa/register.ts:6-8` (notify on `controllerchange`), `src/main.ts:1009` (`hud.toast`), `src/app.ts:566` (`hudRoot.hidden = true` during a battle).
- **Steps (run):** v1 tab in a practice battle; v2 deployed; `registration.update()`. The new worker took control after 1.9 s and deleted the v1 cache; the battle kept running (good). The toast "A new version is ready. Close and reopen the game to update." was in `#hud` with `visible: false`; 6 s later it was gone, and it was not shown after going home.
- **Impact:** the player keeps a v1 page under the v2 worker with no hint to restart; the next lazy panel then depends on the known stale-chunk handling.
- **Fix:** route the notice through the battle HUD's toast when a battle is open, or raise it again on `App.home()`.

## 4. Measured and found sound

- **Battles, results, replay viewer, 15 of 16 panels:** 0 nodes and 0 listeners left per run; one BattleSession alive; battle scene empty after home.
- **Textures:** plateau at 241-258 textures and 42-50 MB of pixels; no orphan canvases, WebGL textures, framebuffers or programs. The old "textures never evicted" finding stays fixed.
- **Audio:** about 171,000 nodes created in 74 minutes, none retained.
- **Timers and emitters:** no growth. Active intervals: 1 s, 1 s, 500 ms, 5 s, 15 s and the 100 ms music loop.
- **Frame pacing:** no degradation with session length.
- **Save size:** bounded at about 160-178 KB (10 logged battles).
- **Service worker, first load:** installed and controlling 5.1 s after navigation; one cache, 37 files, 2,477,086 bytes uncompressed; storage estimate 2.6 MB.
- **Offline:** reload booted in 1.9 s with the save; Settings, Codex, Friends and Alliance (lazy chunks) opened; switching to German offline showed "Your language could not be loaded. Check your connection and try again." and stayed in English.
- **Deploys:** v1 -> v2 -> v3: exactly one cache after each activation; reload after v2 ran v2 with no errors; a third build whose only missing file was already cached installed by reusing it. `sw.js` answering 404: the update is rejected, the registration stays, the game boots from its cache.

## 5. Already known, skipped

- Whole village serialised and written on each save, 15 s autosave (hardware audit F14, SAV-14 partial). Measured here for the record: 63 writes, 6.6 MB in 13.7 minutes at Keep 6 (about 29 MB an hour).
- Music loop interval and synthesis while muted (hardware audit F9).
- A v1 tab asking for a lazy chunk the new deploy no longer has (WORLDWIDE_AUDIT "Lazy panels stuck after a failed load", fixed `6fb74cd`). Not reproduced: with `max-age=600` the browser's HTTP cache still held the v1 chunks, so all four panels opened. The path after that cache expires was not run.
- Per-language caches and offline language packs (N24-STB-1, N24-SAV-4), device-only items (STB-11, SAV-15, SAV-16).

## 6. Not done, and limits

- Not run: the 5-minute idle wake-up and hidden-tab measurement, storage quota (`Storage.overrideQuotaForOrigin`), slow 3G and packet loss during boot and lazy loads, a half-uploaded deploy with a genuinely new missing file (my v3 only removed a file the client already had), the stale-chunk handler after HTTP-cache expiry, a soak on the high profile, the public (non-sandbox) Store.
- The long run's renderer RSS and node totals include harness handles and cannot be used as the game's leak rate; use the per-open numbers in SOAK-1.
- Headless Chromium with software GL is not a phone. DOM and JS retention carry over; GPU memory, thermal throttling, iOS Safari's process limits, real update timing on GitHub Pages and absolute frame times do not.
