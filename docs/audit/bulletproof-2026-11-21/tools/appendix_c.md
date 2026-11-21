# Appendix C: how this audit was done, and its limits

**Method.** Seven auditors each took one lane of the checklist and masterclass: ECO (sections 3, 17f, 17g; masterclass 19-20), SEC (7, 6 server; masterclass 5-6), SAV (2, 6 client; masterclass 2, 5), STB (1, 5; masterclass 1, 3), OPS (12-16; masterclass 22-25, 27), UX (3b, 4, 9-11; masterclass 4, 8-12), and GT (8, 17a-h; masterclass 7, 13-18, 21). Each read the project briefs and the closure records of `docs/store/WORLDWIDE_AUDIT.md`. Each re-checked every claim against the code at `560ce7a` and wrote file-and-line evidence. The integrating session re-read the code behind the highest-severity claims:

- the second Season Scroll grant (`grantPurchase` skips `canPurchase` when `verified`, `src/gameplay/sim/village.ts`);
- the device-village upload path with no `REQUIRE_SERVER_VILLAGE` anywhere (`server/core/pvp.ts` `uploadBase`, `requireArmyOnServer`);
- `defenseHonorLossShare: 0` (`src/gameplay/data/ranks.json`);
- `PushNotifications.register()` with no `google-services.json` in `android/app`;
- the server-address block added to Settings → Advanced in every build (`src/presentation/ui/settingsUi.ts`).

**What was run.**

- `npm ci --ignore-scripts` and `npm run build` in scratch copies (the build passes; no `.map` files are produced).
- The render and audio tests (66 pass).
- `tests/gameplay/balance` (105 of 105 pass; the campaign fingerprint is current).
- Multi-seed campaigns: 8 regular seeds and 6 casual seeds, through the model player's existing replicate option (`evidence/gt/`).
- A Shadow Trials probe of tiers 1-66 against a fully researched bot army (`evidence/gt/trials.out`).
- A seed-noise probe at Keeps 6, 10 and 15 (`evidence/gt/luck.out`).
- `npm run release:preflight`: 22 open rows, 6 of them blocking.
- curl of the live GitHub Pages site: legal pages return 200 with empty publisher facts, and no `.map` files are served.
- The latest CI runs: green, but the signed-AAB job skipped all 16 of its steps and the production server job was skipped.
- Playwright Chromium with touch emulation at 320×568, 360×640, 568×320, 640×360 and 844×390, in en, de, fi, ta and ar (`evidence/shots/`, `evidence/ux-probes/`). The double purchase (UX-01/ECO-01) was reproduced this way: sandbox purchase count 0 → 2 from two taps.

**What was not run.**

- Any phone, tablet or native build.
- Any store sandbox purchase, refund or restore.
- Postgres and Redis (`TEST_DATABASE_URL`/`TEST_REDIS_URL` were not set; the memory stores stood in).
- A multi-instance server, the worker-thread timeout path with real workers, Sentry ingestion, a load test.
- The full `npm test`, `test:slow` and `balance:campaign` on this commit.
- Any human playtest.

The balance numbers are model-player results with a fixed bot attack plan. No search for better attacks was done, so the true optimum may be stronger than measured.

**Confidence.** Items marked "(inferred)" were reasoned from code and not reproduced. Labels from the earlier page-15 audit that could not be traced are mapped by best guess (section 1.1). Every work item starts with step 1 of the loop, revalidation, because line numbers and behaviour drift.

**Relationship to earlier passes.** This pass does not reopen findings that the closure records show as fixed and that the auditors re-checked as holding (see Appendix B). The open items of the 2026-11-20 security audit (X1, P4, F2, F3, L1, S5 `nameKey`) are carried here as SAV-12/SEC-05, SEC-12/ECO-07, SEC-10, SEC-11, SEC-13 and SEC-06. GLOBAL-001, 006 (markets), 007, 008, 015, 017 and R01-R10 stay open on owner, device and store evidence. Part C lists the steps.
