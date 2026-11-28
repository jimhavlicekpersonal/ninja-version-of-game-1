# First-run / hostile-input audit (lens: play it in a real browser as a new player on a small phone)

Status: FIRST VERSION (work in progress; updated as runs complete).
Auditor: read-only. No tracked file changed. Scratch: `(session scratch, not kept)/firstrun/` (scripts `lib.js`, `play.js`, `tut.js`, `run*.js`; screenshots in `shots/`).

## 1. Coverage

Environment: Vite dev server on port 5311 (`npx vite --port 5311 --strictPort`), Playwright 1.63 headless Chromium with
SwiftShader WebGL, fresh browser context per run (= a new player), 360x640 portrait, touch, mobile, DPR 2. Taps are real
`touchscreen.tap` at element centres after a hit test (a covered target is reported, not forced). Chromium emulation is
not a phone: timings and frame rates are not device results.

Harness note (not a game finding): while another process rewrote `public/**.html`, Vite's dev client full-reloaded every
open page. I blocked the HMR socket (`routeWebSocket`) so a reload under test is always the game's own.

### Timed log of the first-run funnel (normal URL, no query string, 360x640, script-paced taps, run 5 of 5)

| Moment | Seconds from navigation | Taps so far | Notes |
|---|---|---|---|
| `#boot.done` (splash gone) | 2.5 to 4.2 over 7 boots | 0 | status line: Lighting the lanterns / Painting the village N % |
| First control | same frame | 0 | **0 dialogs before first control**: no age gate, no consent, no language picker; only the Sensei bubble "Step 1 of 9 … I am ready" with "Skip tutorial" |
| Step 2 (after "I am ready") | 3.7 | 1 | |
| Coin Mint placed (first build) | 5.7 | 4 | Build → Coin Mint card → green tick; the Mint's sheet opens by itself |
| First coin collected, step 3 | 35.7 | 14 to 15 | 10 "Collect" taps answered "Nothing to collect yet." (already known: playthrough.md item 3) |
| Keep upgrade started, step 5 | 39.7 | 17 | |
| Dojo, Courtyard, Kunai Tower placed, step 6 | 58.5 | 38 | the script had to poll the Build panel because both Artisans were busy (known: playthrough.md item 10) |
| "+1" Shinobi becomes tappable | 79 | 40 | Courtyard takes 22 s; until then the ringed button is disabled (see RUN candidate below) |
| 6 Shinobi queued, step 7 | 83.8 | 46 | "ready in 56s" |
| Step 8 (first raid offered) | 140.5 | 46 | |
| Scouting screen | 143.8 | 48 | "Moon Veil · Storm Crossing Lv 1 Computer rival", 6 points |
| "Attack!" pressed (first raid starts) | 147.3 | 49 | |
| Result / back home | (pending) | | |

Console errors, page errors, unhandled rejections, failed requests, HTTP >= 400: **none** in runs 01 to 03 (8 boots).

localStorage after a cold boot: `tk.whatsNewSeen`, `tk.art.manifest` only.

### Not reached yet (updated at the end)

Result screen and home, tutorial abuse, tap-spam under CPU throttle, storage hostility, two tabs: in progress.
320x568 and 640x360 passes, legal pages, text entry, edit-mode gestures: see the final section.

## 2. Ranked table of new findings

(pending: candidates below are being confirmed and deduped)

## 3. Candidates seen so far (not yet confirmed twice or deduped)

- CAND-A: tutorial step 6 at 360x640: with the Army panel open, the Sensei bubble sits at the top (y 6..130) over the
  panel's title and its close X (the ring target "+1" is at the bottom, so the bubble takes the top band). Screenshot
  `shots/f360-03-train1.png`. To check: can the panel still be closed by touch.
- CAND-B: tutorial step 6: the ring pulses on a disabled "+1" for up to 22 s while the Squad Courtyard is being built, and
  the red line under it says "Build a Squad Courtyard to house warriors." although one is already being built (the card
  above says "Squad Courtyard · Being built"). Same screenshot.
- CAND-C: the Battle log bottom-bar button carries a "!" badge on a brand-new village's first frame (text content "!").
  To check what it announces.

## 4. Tried and held up

- Cold boot on fresh storage: clean first frame, bubble and "I am ready" hit-testable, splash gone within 1 s of `done`
  (`#boot` computed opacity 0, `pointer-events: none`).
- Placement: the green tick is ringed and tappable; the placed building's sheet opens.

## 5. Already known, skipped

- "Nothing to collect yet." five to ten times after the Mint finishes (playthrough.md item 3).
- Build card stays disabled / "All your Village Artisans are busy" during step 5 (playthrough.md item 10).
- Publisher facts empty in `public/legal-config.js` (owner item, recorded).
