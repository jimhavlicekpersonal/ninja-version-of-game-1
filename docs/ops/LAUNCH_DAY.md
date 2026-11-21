# Launch day and live operations (Beast Mode 2026-11-21 OPS-13)

Companion to `docs/store/RELEASE.md` (submission, rollout, rollback), `docs/ops/RUNBOOK.md` (one section per
alert) and `docs/ops/SUNSET.md` (ending online play). Nothing here has been rehearsed: the owner fills in the
names, times and links on the first staging rehearsal.

## Day 0 timeline (times relative to the store release, T)

| When | What | Check |
|---|---|---|
| T − 7 days | Staging rehearsal: server deploy, web deploy, one rollback of each (OWN-33), load test at the 10x target (`docs/SHIPPING.md` 3h) | Times recorded in RELEASE.md; load run recorded in PVP_ROADMAP step 46 |
| T − 2 days | Freeze: only fixes for launch blockers. Store builds approved and held ("manual release" / Play staged rollout at 0 %) | Builds in App Store Connect and Play Console show the release version |
| T − 1 day | Pre-scale the server (at least 2 instances, worker pool on), database plan sized, backup + PITR on, alerts routed (`ops/alertmanager/`) | `/readyz` on every instance; a test alert reaches the pager |
| T − 2 h | Deploy the **server** first (`server.yml`, target production), then the **web** game (`deploy.yml` on `main`) | `check-published-game.mjs` green; `/v1/hello` lists the release's rules and protocol |
| T | Release the store builds (Apple: release; Play: staged rollout 10 %) | A fresh install on an iPhone and a Pixel plays a raid online |
| T + 0–4 h | Watch the RELEASE.md "Watch during the rollout" table every 30 minutes | No alert firing; crash-free sessions as before the release |
| T + 24 h | Rollout decision: raise Play to 50 %, keep Apple phased release running, or pause (RELEASE.md "If something is wrong") | Written in the release notes with the numbers looked at |

**Who watches what** (fill in names before T − 7): server and alerts (pager), store reviews and support mail,
community channels, crash reports by release (Sentry environment `production`), purchases (`PurchasesStalled`,
`tk_purchase_*`).

## Known issues

- **Where:** a pinned post in the community channel (and, for anything that affects play, `SERVER_NOTICE` on the
  server, shown in Settings → Online play, and the News envelope). There is no known-issues section in
  `public/support.html` yet: adding one means new page text in all 50 languages (`locales/*/pages.json`).
- **Update rule:** add an issue within 2 hours of confirming it, with what players see, a workaround if any, and
  "fixed in version X" once a fix is live. Remove it 7 days after the fix reached every store. Never promise a date
  that is not real; never describe a generated opponent as a real player.

## Support reply templates

Every reply asks for the **Player ID** (Settings → Online play → Account) and never for a password, a store
receipt image with card details, or a date of birth.

- **Purchase not delivered:** "Thank you. Please open Store → Restore purchases while online, then restart the game.
  If the Jade is still missing, reply with your Player ID and the order number from your Apple or Google receipt
  email." Staff: `GET /admin/v1/players/:id` (purchases and holds), release an import hold with
  `POST /admin/v1/players/:id/import-holds/:hold/release`; never grant by hand what a receipt has not shown.
- **Age band set wrongly (under 18 chosen by mistake):** the game cannot raise an age band by itself. Staff check the
  account holder (the store account's age where the store provides it) and only then
  `POST /admin/v1/players/:id/reset-age` with a note. Never reset for a request that comes from the player alone
  without that check.
- **Account deletion:** in the game: Settings → Online play → Account → Delete online account. Without the device:
  the server's web deletion form (`https://<server>/account/delete`, linked from Settings), handled through `/admin/v1/deletion-requests`. Reply when it is done;
  purchase records are kept unlinked as the privacy policy says.
- **Lost phone / signed in elsewhere:** Settings → Online play → Account → "Sign out others"; staff can
  `POST /admin/v1/players/:id/revoke-sessions`.
- **Cheating report:** thank them, do not discuss the other account. Staff: `GET /admin/v1/suspects`,
  `reset-honor`, `ban` with a reason (the player gets a notice with the appeal route).

## Hotfix path

1. Branch from the release tag (`git checkout -b hotfix/1.0.1 v1.0.0`) and fix there; merge the fix back to `main`.
2. Bump the patch version in `package.json`. `tools/release/check-version.mjs` (OPS-01) refuses the build if the
   save format, battle rules, protocol or migrations changed without their own bump; a hotfix should change none of
   them (if it must, it is a full release, not a hotfix).
3. Run the same workflows as a release: server first if the server changed, then the web game, then
   `android.yml` and `ios-testflight.yml` with `target` = `production`.
4. Apple: submit and request an **expedited review** (App Store Connect → Contact Us → Request Expedited App Review)
   with the player-visible problem in one sentence. Play: a new staged rollout of the patch (it replaces the halted
   one).
5. Set `MIN_CLIENT_BUILD` to the patch only once **both** store builds are live and the web game is updated: an
   earlier switch strands players whose store has not delivered the update yet.
6. Before then, if a feature or a product is the problem, turn it off on the server (`FEATURES_OFF` /
   `PRODUCTS_OFF`, OPS-09) instead of waiting for the stores.
