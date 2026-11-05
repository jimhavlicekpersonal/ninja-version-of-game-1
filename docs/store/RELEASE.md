# Submission and staged rollout (step 53, checklist)

## Before submitting

- [ ] Server: production deployed by hand from the release workflow (`docs/SHIPPING.md` 3g), `/readyz` green, alerts on (`ops/prometheus/alerts.yml`), a backup made and the last Sunday drill passed (`.github/workflows/backup.yml`).
- [ ] The server is built from the same commit as the game (same `SIM_RULES` in `src/gameplay/sim/battle/battle.ts`); the release workflow's contract tests passed on staging.
- [ ] Products approved in both stores with the store ids (`docs/SHIPPING.md` 3b); App Store Server Notifications and Play RTDN point at production.
- [ ] Listing texts, screenshots, privacy URL, support URL, privacy label / Data safety, age rating, review notes (this folder).
- [ ] Tag the release `v<version>` (the release workflow tests the next server against this client).

## Rollout

- **App Store:** choose "Phased release for automatic updates" (1%, 2%, 5%, 10%, 20%, 50%, 100% over 7 days). New downloads get the version at once; the phase only paces updates.
- **Google Play:** staged rollout 5% → 20% → 50% → 100%, a day or more each.

## Watch during the rollout

- Crash-free sessions (Sentry, the stores' vitals), `HighErrorRate`, `SlowResponses`, `EventLoopBlocked`, `DesyncsRising`, `RefundSpike`.
- Desyncs by client build (`tk_desyncs_total`, `tk_client_requests_total`): a rise right after the release means the build and server disagree on rules.
- Store reviews and support mail for purchase problems.

## If something is wrong

- Pause: App Store Connect → Phased release → Pause (up to 30 days); Play Console → Halt rollout.
- Tell players: set `SERVER_NOTICE` on the server (shown in Settings → Online play) and redeploy.
- Server problems: redeploy the previous image by hand (the release workflow with that commit). Never roll the database back by hand: restore a backup into a new database (`tools/ops/restore.mjs`) and switch to it only after `restore-check`.
