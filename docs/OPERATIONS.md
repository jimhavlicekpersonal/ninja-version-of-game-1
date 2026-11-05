# Operations calendar and procedures (roadmap steps 54–58)

The server's day-to-day. Owner steps that set things up once are in `docs/SHIPPING.md`; this page is what recurs.

## Weekly: the review (step 54)

Open `https://<server>/admin` → **Weekly review**. It shows players (active, new, suspended), PvP battles and the desync rate, purchases and the refund rate, server-held resources in and out by reason (biggest source and sink of each), the spread and settling of ratings, the Honor ladder, and a "Needs attention" list (desyncs over 1%, refunds over 5%, unsettled or bunched ratings, Jade piling up, mostly new players).

Change balance only through the data files (`src/gameplay/data/*.json`) in a normal release (tests, `npm run balance:*`, contract tests). Never edit player data by hand; corrections go through the staff tool (they are logged and in the ledger).

## Monthly: seasons (step 55)

Nothing to do: at the start of each UTC month the server closes the last season once (archives the Honor top 100 and softens Honor by the game's rule; `server/core/seasons.ts`). Players see it in the Leaderboard's "Last season" tab.

## Daily: staff queues (step 56)

- **Reports:** act within 24 hours (the commitment in the store declarations). `ReportsOverdue` alerts when one waits longer.
- **Deletion requests from the web:** verify and carry out within 30 days (GDPR art. 12(3); CCPA 45 days). The queue shows the due date; `DeletionRequestsWaiting` warns after a week, `DeletionRequestsOverdue` pages at 30 days. In-app deletion needs nothing from staff.
- **Support mail:** the address on `https://<server>/support` (`SUPPORT_EMAIL`). Ask for the Player ID; look the player up in `/admin`.

## When load grows (step 57)

- Watch `tk_resim_queue` and `tk_resim_wait_ms`: battles waiting for a re-simulation worker. Add instances (each runs `RESIM_WORKERS`, default CPUs − 1) before the wait passes a second.
- Measured: one 4-vCPU instance with 3 workers re-simulated ~7.8 full-army battles/s (`npm run server:load`, with the load generator on the same machine), against ~2.7/s without workers.
- Reads that may lag (leaderboards, defense logs, staff reports) can go to a replica: set `DATABASE_READ_URL`.
- Not done yet, because not needed at launch volumes: partitioning `attacks` by month (prune deletes by time and an index covers it), and moving replays to object storage (replays are kept only 30 days and bases are stored once).

## Every release: versions (steps 72-78)

Follow `docs/SHIPPING.md` section 3i (server first, then the games; CI's release-order check refuses a game production can't serve). After each release, watch the versions dashboard (`ops/grafana/versions-dashboard.json`) for a day: the new build taking over in "Requests by game build and battle rules", the desync rate per rules version (alert `DesyncsRising`), refused reports by reason (alert `VersionMismatchReports`: players were refused for `rules_mismatch` or `data_mismatch`, so a release went out of order or a version was retired too early). Retire a kept rules version when `OldRulesCanRetire` fires (under ~2% of traffic for 3 days) or after 4-6 weeks. Use `MIN_CLIENT_BUILD` only to force an update (it turns older games away with "Update Kagemura").

## Gang Wars

Nothing to run by hand: the server pairs queued Gangs on each request, offers a generated Gang after a few minutes, rates real wars once when they end and pushes "ends soon" hourly. In the weekly review, Gang War chests show in the ledger as `gangwar:chest`. Balance numbers are in `social.json` `gangWar` (rerun `tests/gameplay/balance/gang-war.test.ts` after changing them).

## Rotating secrets (step 58)

Every secret that callers present can hold two values while it changes:

- `ADMIN_TOKEN`, `METRICS_TOKEN`: set `new,old`, deploy, switch the staff tool and Prometheus to the new one, then set just `new`.
- `BACKUP_KEY`: make a new key; set it as `BACKUP_KEY` and the previous one as `BACKUP_KEY_OLD` (restores try both); remove `BACKUP_KEY_OLD` after 35 days, when the last backup made with it has expired.
- APNs key: create a new key in the Apple developer account, set `APNS_KEY` and `APNS_KEY_ID`, deploy, then revoke the old key.
- Google service account (`GOOGLE_SERVICE_ACCOUNT_JSON`, `FCM_SERVICE_ACCOUNT_JSON`): add a new key to the same service account, deploy with it, then delete the old key in Google Cloud.
- Player tokens do not expire (there are no passwords). There is no "sign out other devices" yet; staff can suspend an account that was taken over.

`.github/workflows/maintenance.yml` opens a checklist issue every January and July with these and the store deadlines.
