# Device test matrix and protocol (Beast Mode 2026-11-21 OPS-11)

Release builds only (never `?debug` or the sandbox). Pass and fail thresholds are owner cells set from the first full
run (OWN-24); until then a row only records numbers. Browser emulation on a desktop is not a device result.

## Devices (10-20; the owner lists the exact models)

| Class | Example | RAM | OS | Why |
|---|---|---|---|---|
| Android Go, low end | owner (≤ 2 GB Android Go phone) | ≤ 2 GB | Android 10-12 Go | the worldwide target's floor (`render/quality.ts` low profile) |
| Cheap Android | owner (two models) | 3-4 GB | Android 11-13 | the most common phone in many launch markets |
| Mid Android | Google Pixel 7 | 8 GB | Android 14+ | a project target device |
| Old iPhone | owner (iPhone SE 2/3 or 8) | 2-3 GB | iOS 15-16 | the oldest supported iOS and a home-button screen |
| Current iPhone | owner | 6-8 GB | current iOS | a project target device |
| Tablet | owner (one Android or iPad) | any | any | layout at tablet sizes |
| Windows laptop | owner | any | Windows 11, current Chrome/Edge | the desktop web target (mouse, keyboard, trackpad) |

## Protocol (per device, per release candidate)

1. **Cold start ×50 and warm start ×50**: time from tap to the village's first frame (the splash ends). Record the
   median and p90 in ms.
2. **Two-hour session**: memory at start, peak and end (Android Studio profiler / Xcode memory gauge), the count of
   `tkmemorywarning` events, and whether the app was killed.
3. **20-minute battle thermal run**: battles back to back; FPS p50 and p5 (the HUD readout with `?fps` off in
   release: use the OS GPU overlay), skin temperature or the OS throttling state at the end.
4. **Interruptions**: an incoming call mid-battle; a notification shade and Control Center pull (UX-11); 10 minutes in
   the background, then resume; airplane mode mid-battle (online raid), then reconnect; low storage (under 200 MB
   free); force-kill and relaunch mid-battle. Record what the player sees and whether progress was kept.
5. **Battery**: % used per hour of mixed play at 50% screen brightness.
6. **Network**: 3G profile or a 400-800 ms latency link: first install time, a raid, a purchase (sandbox).
7. **Text and motion**: OS font size at its largest with the in-game Text size at 130 % (UX-08); OS reduced motion on
   (UX-04).

## Results (one table per build)

| Date | Build id (`kagemura@<version>+<sha>`) | Device | Tester | Cold median / p90 | Warm median / p90 | Peak memory | FPS p50 / p5 | Battery %/h | Interruptions OK? | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | |
