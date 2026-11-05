# Shipping Toadstool Kingdoms

Everything that can be built and tested without your personal accounts is in the repository. This page covers the steps only the owner can do.

## 1. Play on your devices right now (no accounts needed)

- **Web app (all devices):** https://jimhavlicekpersonal.github.io/toadstool-kingdoms/ (see the README for installing it to your home screen). The public web build has **no store** (purchases show as unavailable) and runs on real time. The instant mock store and the time-skip tools exist only in the **testing sandbox**: open the game with `?sandbox` (or `?debug`). The sandbox keeps a separate village and never goes online, so test purchases and skipped time can't reach a real village or a server. Before a competitive online launch, decide whether the server should own the economy (inventory, research, timers); see `docs/PROTOCOL.md`, "Trust".
- **Android app on your Pixel 7:** every push to `main` builds an installable APK.
  1. On GitHub, open **Actions → Android app (installable APK)** and click the latest green run.
  2. Under **Artifacts**, download `toadstool-kingdoms-android-apk` and unzip it (you get `app-debug.apk`).
  3. Send the APK to the phone (Google Drive, email, or a USB cable), open it, and allow "Install unknown apps" for that app when Android asks.
  4. In-app purchases are switched off in the Android app until Google Play Billing is added (see section 5).

## 2. iPhone: TestFlight and a sandbox purchase

Apple only builds iPhone apps on a Mac. The **iOS TestFlight (manual)** workflow uses a GitHub macOS machine, so you never need your own Mac.

**One-time setup (about an hour, in a web browser):**

1. Join the **Apple Developer Program** ($99/year) at https://developer.apple.com/programs/.
2. In **Certificates, Identifiers & Profiles → Identifiers**, register an App ID. Use `com.toadstoolkingdoms.app`, or your own ID. If you use your own, also change `appId` in `capacitor.config.ts` and add a repository variable `IOS_BUNDLE_ID` with the same value.
3. In **App Store Connect → Apps**, create a new iOS app with that bundle ID.
4. In the app's **Monetization → In-App Purchases**, add these **Consumable** products. Use these exact product IDs:

   | Product ID | Price |
   | --- | --- |
   | `moonstones_1` | $1.99 |
   | `moonstones_2` | $4.99 |
   | `moonstones_3` | $9.99 |
   | `moonstones_4` | $19.99 |
   | `moonstones_5` | $49.99 |
   | `moonstones_6` | $99.99 |
   | `lantern_pass` | $4.99 |
   | `offer_starter` | $1.99 |
   | `offer_builder` | $4.99 |
   | `offer_war_prep` | $2.99 |
   | `offer_rebuild` | $2.99 |

5. In **App Store Connect → Users and Access → Integrations → App Store Connect API**, create a key with the **App Manager** role. Download the `.p8` file (you can only download it once) and note the **Key ID** and the **Issuer ID**.
6. Find your **Team ID** under **Membership** at developer.apple.com.
7. In the GitHub repository, open **Settings → Secrets and variables → Actions** and add these **secrets**:
   - `APPLE_TEAM_ID`: your Team ID
   - `ASC_KEY_ID`: the Key ID
   - `ASC_ISSUER_ID`: the Issuer ID
   - `ASC_KEY_P8_BASE64`: the `.p8` file, base64-encoded. On Windows PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("AuthKey_XXXX.p8"))`

**Each build:**

1. In GitHub, go to **Actions → iOS TestFlight (manual) → Run workflow**. It takes about 15 minutes.
2. In App Store Connect → **TestFlight**, add yourself as an internal tester once the build finishes processing.
3. On the iPhone, install **TestFlight** from the App Store, accept the invite and install Toadstool Kingdoms.
4. **Sandbox purchase:** in the game, open the Store and buy a pack. TestFlight purchases use Apple's sandbox, so you are **not charged**. Apple's purchase sheet appears after the game's own confirm step.

**Testing purchases on a Mac (optional):** `ios/App/Products.storekit` lists every product. In Xcode, choose **Product → Scheme → Edit Scheme → Run → Options → StoreKit Configuration** and select it (drag it into the project first) to test purchases in the simulator without App Store Connect.

## 3. Online play (real players instead of bots)

The server in `server/` (Node + Fastify + Postgres) does five things:

- matches you with real players, using the same rules as offline play (Elder Toadstool level, leaf rank, loot penalty and loot caps);
- re-runs every battle, so results cannot be faked;
- delivers real raids against your village;
- runs real Groves (chat, troop requests and donations);
- pairs Groves for the weekly Grove Raid.

Without a server, the game uses generated opponents, bot raiders and a bot Grove, as before, and the village stays on the device. With one, the game moves its village to the server (protocol 7), and linked sign-ins bring it to another device.

1. Create a Postgres database. Render, Railway, Neon and Supabase all have free or cheap plans; copy its connection string.
2. Deploy the server, for example on Render as a **Web Service** from this repository:
   - Build command: `npm ci && npm run server:build`
   - Pre-deploy (release) command: `npm run server:migrate`. It applies new database migrations before the new version starts, once, even with several instances (Render: "Pre-Deploy Command"; Fly.io: `release_command`; Railway: "Pre-deploy step"). On a host without a release step and with exactly one instance, set `MIGRATE_ON_BOOT=1` instead.
   - Start command: `npm run server:start`. It refuses to start while migrations are pending, so a skipped release step shows up at once instead of as broken requests.
   - Environment variables:
     - `DATABASE_URL`: the connection string.
     - `DEPLOY_ENV`: `staging` or `production` (section 3f). Production refuses to start without its essentials.
     - Purchases, push and their keys: sections 3c and 3e.
     - `TRUST_PROXY`: set it to `true` on Render, Fly.io, Railway and any host with a load balancer in front, so rate limits count each player's IP address instead of the load balancer's. Leave it unset only when players connect to the server directly (otherwise anyone could choose their IP with a header).
     - `RATE_LIMITS` (optional): JSON that overrides individual limits, for example `{"register":{"limit":200,"windowMs":3600000}}` on a staging server that runs the contract tests often. The defaults are in `server/rateLimit.ts` and `docs/PROTOCOL.md`.
     - `REDIS_URL` (optional for one instance, needed for two or more): `rediss://…` from Upstash (or any Redis). It holds the leaderboard (rebuilt from Postgres if Redis is emptied), match locks and rate-limit counters, so every instance shares them. Without it, the database holds the leaderboard and locks, and each instance counts its own rate limits.
     - `SENTRY_DSN` (optional, recommended): the server's errors (5xx answers, crashes) go to this Sentry project; `SENTRY_ENVIRONMENT` names it (default `production`, use `staging` there). Free Sentry plans are enough at first.
     - `METRICS_TOKEN` (optional): serve Prometheus metrics at `/metrics` to `Authorization: Bearer <token>` (re-simulation time, battles, desyncs, errors by code, rate limits, request counts and latency). Point Grafana Cloud's agent or any Prometheus at it.
     - `LOG_LEVEL` (optional): `info` by default. Logs are JSON lines with a request id; tokens are never written.
     - Health checks: point the host's health check at `/healthz` (the process answers). `/readyz` also checks Postgres and Redis and answers 503 when one is down; use it for load-balancer readiness, not for restarts.
     - Account linking (cloud save), each optional: `APPLE_CLIENT_IDS` (the app's bundle id, plus the web Services ID), `GOOGLE_CLIENT_IDS` (OAuth client ids), `GAMECENTER_BUNDLE_IDS`, `PLAYGAMES_CLIENT_ID` + `PLAYGAMES_CLIENT_SECRET`. In Xcode, add the **Sign in with Apple** and **Game Center** capabilities (Signing & Capabilities → +) and enable them for the App ID. For the web build, GitHub variables `VITE_GOOGLE_CLIENT_ID` and `VITE_APPLE_SERVICES_ID`.
     - `ADMIN_TOKEN`: a long random secret (at least 24 characters, e.g. `openssl rand -hex 32`). It turns on the staff API for account-deletion requests and the moderation queue (section 3a). Without it those routes don't exist.
     - `CORS_ORIGIN`: leave it unset to allow every origin. This is safe, because players sign in with a token, not a cookie. To restrict it, use a comma-separated list: `https://jimhavlicekpersonal.github.io,capacitor://localhost,https://localhost`. The last two are the iPhone and Android apps.
   - The first `server:migrate` creates the tables; later versions add numbered migrations (`server/migrations/`). `npm run server:migrate -- --status` lists applied and pending ones. A database made by an older server (which created its tables on every boot) is adopted as it is.
   - Use the HTTPS address the host gives you. The phone apps refuse plain HTTP.
3. Check that `https://<your-server>/v1/hello` shows `"name":"toadstool-kingdoms"`. To size the server, run `npm run server:bench` once on the host (a shell or one-off job after the build): it times battle re-simulation per Keep (`docs/backend/PVP_ROADMAP.md`, section 2).
4. Optional: check the server against the protocol contract. On Windows PowerShell, first set the address with `$env:CONTRACT_URL="https://<your-server>"`.

   ```bash
   CONTRACT_URL=https://<your-server> npm run test:contract
   ```

5. Turn online play on, in either or both of these ways:
   - **For everyone:** in GitHub, go to **Settings → Secrets and variables → Actions → Variables** and add `VITE_SERVER_URL` = `https://<your-server>`. Optionally add `VITE_SENTRY_DSN` too (a separate Sentry project for the game is clearer): the game then sends crash reports with the build and platform, never player data, and Settings shows a "Send crash reports" switch. Declare it as "Crash Data, not linked to the user" in the App Store privacy label and Play Data safety form. The next push to `main` rebuilds the web app and the Android APK with that server built in.
   - **On one device, no rebuild:** in the game, open **Settings → Online play**, type the server address and tap **Use**. **Play offline** switches back. This is handy for testing a new server before building it in.

The top bar shows the connection: **Online**, **Connecting…** or **No connection**. Battles you fight while the connection is down are sent when it comes back.

### 3a. Account deletion and moderation (staff)

- **In the game:** Settings → Online play → Account → **Delete online account** deletes the account at once (Apple 5.1.1(v)).
- **Web link for the store listings:** `https://<your-server>/account/delete`. Google Play asks for it ("Delete account URL" in the Data safety section); add it to the privacy policy too. Players who lost the game send a request there with their Player ID (Settings → Online play → Account) or their name.
- **Working through web requests** (Google expects them handled promptly; the page promises within 30 days). List open requests; each shows the player the ID names, with name and last-seen time:

  ```bash
  curl -H "Authorization: Bearer $ADMIN_TOKEN" https://<your-server>/admin/v1/deletion-requests
  ```

  Verify before deleting: player IDs are visible to Alliance mates, so a request alone does not prove ownership. A request whose contact details match the player, or an account inactive for 30+ days, is reasonable to carry out; for an active account, ask the player to delete it from the game. Then:

  ```bash
  curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" -H "content-type: application/json" -d '{"action":"delete"}' https://<your-server>/admin/v1/deletion-requests/<id>
  ```

  Use `{"action":"reject","note":"…"}` to turn one down. `?status=all` lists handled requests too.
- **Moderation queue** (Apple 1.2 expects reports to be acted on promptly; check it daily). Each open report shows the message text as it was sent, the reason, how many open reports the player has, and whether the message is already hidden (3 different reporters hide it automatically):

  ```bash
  curl -H "Authorization: Bearer $ADMIN_TOKEN" https://<your-server>/admin/v1/reports
  ```

  Then act on one (a decision about a message settles every report on it):

  ```bash
  curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" -H "content-type: application/json" -d '{"action":"mute","hours":24,"note":"threats"}' https://<your-server>/admin/v1/reports/<id>
  ```

  Actions: `dismiss` (nothing wrong; a hidden message comes back), `remove_message`, `mute` (also removes the message; `hours` up to a year). Handled reports are deleted after 90 days. A full admin tool is roadmap step 48.
- **Contact for users:** Apple also asks for a published way to reach you about content; put a support address on the support page (roadmap step 7).

### 3b. In-app products to create (roadmap step 33, owner)

Create these in App Store Connect (In-App Purchases) and the Play Console (In-app products), with the **store id** in the first column. The game keeps its own ids (they are in saves) and maps them to these in `src/gameplay/data/store.json` (`storeProductIds`, roadmap step 38); to use other store ids, change only that map. Prices are the game's USD prices; pick the matching price tier in each store. Every product is a consumable in Google Play (the server consumes each purchase once it is delivered).

| Store id | Game id | Type | USD | What it gives |
|---|---|---|---|---|
| `jade_pouch` | `moonstones_1` | Consumable | 1.99 | 100 Jade (Pouch of Jade) |
| `jade_bag` | `moonstones_2` | Consumable | 4.99 | 280 Jade (Bag of Jade) |
| `jade_box` | `moonstones_3` | Consumable | 9.99 | 600 Jade (Box of Jade) |
| `jade_chest` | `moonstones_4` | Consumable | 19.99 | 1,300 Jade (Chest of Jade) |
| `jade_vault` | `moonstones_5` | Consumable | 49.99 | 3,500 Jade (Vault of Jade) |
| `jade_hoard` | `moonstones_6` | Consumable | 99.99 | 7,500 Jade (Dragon Hoard of Jade) |
| `season_scroll` | `lantern_pass` | Non-consumable per season (Apple: consumable or non-renewing subscription; the game tracks the season; Store → Restore purchases brings it back) | 4.99 | Season Scroll premium track |
| `offer_starter` | `offer_starter` | Consumable (the game allows it once per account) | 1.99 | Starter offer |
| `offer_builder` | `offer_builder` | Consumable | 4.99 | Builder offer |
| `offer_war_prep` | `offer_war_prep` | Consumable | 2.99 | War prep offer |
| `offer_rebuild` | `offer_rebuild` | Consumable | 2.99 | Rebuild offer |

Nothing random is sold, so no odds disclosure is needed for these. Real prices are shown only in the Store and its confirm step.

### 3c. Store keys and purchase checks on the server (roadmap steps 34-37)

The server checks every store purchase before it is delivered (`server/payments/`), credits each store transaction once, keeps the under-18 cap across devices, and takes refunds back. Set these on the server (they are secrets: the host's secret settings, never the repository):

- **App Store** (step 35): `APPLE_BUNDLE_IDS` = the app's bundle id (defaults to `GAMECENTER_BUNDLE_IDS`). Receipts are StoreKit 2 signed transactions, checked against Apple Root CA - G3, which is built in by its SHA-256 fingerprint; compare it once with the certificate on https://www.apple.com/certificateauthority/ (`APPLE_ROOT_CA_SHA256` overrides it). `APPLE_ENVIRONMENTS` defaults to `Production,Sandbox` (App Review buys in the sandbox against the production server). No App Store Server API key is needed for this; keep the `.p8` for later use of that API.
  - **Refunds:** App Store Connect → the app → App Information → App Store Server Notifications: set Version 2 and the URL `https://<server>/v1/webhooks/apple` for production and for sandbox (staging's address there).
- **Google Play** (step 36): `GOOGLE_PLAY_PACKAGE` (the application id) and `GOOGLE_SERVICE_ACCOUNT_JSON` (a service account key, as one line of JSON; invite the service account in Play Console → Users and permissions with "View financial data" and "Manage orders"). Refunds: create a Pub/Sub topic, set it in Play Console → Monetization setup → Real-time developer notifications, and add a **push** subscription to `https://<server>/v1/webhooks/google` with authentication on; set `GOOGLE_RTDN_AUDIENCE` (the subscription's audience) and `GOOGLE_RTDN_SERVICE_ACCOUNT` (its service account email). The server also reads the Voided Purchases API every hour. Build the Android app with the GitHub variable `VITE_PLAY_BILLING=1` to turn purchases on there (off until then; the Play Billing library is in `android/app/build.gradle`).
- `/v1/hello` lists `purchases-apple` / `purchases-google` when a store is set up. A village kept on the server can buy only through a server that checks its store; a village on the device is trusted as before.

### 3d. Test purchases (roadmap step 39, owner)

1. **Apple:** App Store Connect → Users and Access → Sandbox → add a tester (an email that is not an Apple ID). On the iPhone: Settings → App Store → Sandbox Account. Install the TestFlight build, buy the Pouch of Jade, check it arrives, then check `GET /v1/purchases` (or Settings → Account → Player ID and the staff tools) shows it as `Sandbox`. Refund it from the sandbox account's purchase history and check the Jade is taken back (`refund:apple` in Settings → Online play → Village on the server → ledger).
2. **Google:** Play Console → Settings → License testing → add the testers' Google accounts. Upload a build made with `VITE_PLAY_BILLING=1` to the internal testing track, buy with the test card, check it arrives (`Test` purchases are accepted on staging; on production only with `GOOGLE_PLAY_ALLOW_TEST=1`). Refund the order in the Play Console and check it is revoked within an hour.
3. Under 18: set the age group to under 18 and check that the second purchase past $50 in a month is refused **before** the store sheet opens.

### 3e. Server push (roadmap steps 40-41)

The server sends three kinds of push: "your village was raided", "warriors arrived" and "the Alliance War has started". Each device chooses them in Settings (Reminders), with the same quiet hours and daily limit as reminders.

- **iPhone:** in Xcode add the **Push Notifications** capability. Create an APNs key (Certificates, Identifiers & Profiles → Keys → +, Apple Push Notifications service) and set `APNS_KEY` (the `.p8` text; `\n` for line breaks is fine), `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_TOPIC` (the bundle id). Staging, used by development builds, also sets `APNS_SANDBOX=1`.
- **Android (step 41, owner):** create a Firebase project for the app, download `google-services.json` into `android/app/` (the build picks it up), and set `FCM_PROJECT_ID` and `FCM_SERVICE_ACCOUNT_JSON` on the server (or give the Play service account the "Firebase Cloud Messaging API Admin" role and leave `FCM_SERVICE_ACCOUNT_JSON` unset).
- `/v1/hello` lists `push` when at least one is set up.

### 3f. Staging and production (roadmap step 42)

Run two separate servers, each with its own database (and Redis, Sentry environment and secrets):

- `DEPLOY_ENV=staging`: TestFlight and internal-track builds, the contract tests, sandbox purchases and `APNS_SANDBOX=1`. The game says "This is a staging server" in Settings.
- `DEPLOY_ENV=production`: the store builds. It refuses to start without `DATABASE_URL`, `ADMIN_TOKEN` and an explicit `CORS_ORIGIN` list, or with `APNS_SANDBOX=1`, and warns about missing Sentry and metrics (`server/config.ts`).
- Each database remembers the first deployment that used it (`server_meta`), and a server of the other kind refuses to start on it, so a copied `DATABASE_URL` can never let staging write to production's data.
- Build games against each with GitHub **Environments** (Settings → Environments → `staging`, `production`), each with its own `VITE_SERVER_URL` variable.

### 3g. Server releases (roadmap step 43)

`.github/workflows/server.yml`: every push to `main` that touches the server or the shared rules runs all tests (Postgres and Redis included), builds one Docker image (`Dockerfile`, tagged with the commit, pushed to `ghcr.io/<owner>/<repo>/server`), deploys it to staging and runs the contract tests there, with this build's client and the previous release's (the latest `v*` tag). Production gets the same image only when you run the workflow by hand with target `production`.

Set up once: in Settings → Environments, create `staging` and `production` (give `production` required reviewers). In each, add the secret `DEPLOY_HOOK` (the host's deploy URL; it receives `{ "image", "tag" }` and must run `node dist-server/migrate.js` before starting the new image: Render and Railway deploy hooks, or a small script on your host) and the variable `SERVER_URL`. Tag each store release `v<version>` so later releases are tested against it.

**Running a server locally:** run `npm run server:dev`. It uses memory instead of Postgres when `DATABASE_URL` is not set. In the game, set the server address to `http://localhost:8787`, or to `http://<laptop-ip>:8787` from a phone on the same Wi-Fi, using `npm run dev:lan`.

**Building a different server later:** `docs/PROTOCOL.md` describes everything the game expects. The contract tests check any server against it.

### 3h. Backups, instances, domain, alerts, staff tool (roadmap steps 44-48)

- **Backups:** turn on your database host's point-in-time recovery first (Neon, Render, Supabase and Railway have it on paid plans). On top, `.github/workflows/backup.yml` makes an encrypted `pg_dump` every day (kept 35 days as a workflow artifact) and every Sunday restores it into an empty database, checks it and starts the server on it. In the `production` environment add `BACKUP_DATABASE_URL` (a read-only role) and `BACKUP_KEY` (`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`; keep a copy outside GitHub). To restore for real: `TARGET_DATABASE_URL=<new empty db> BACKUP_KEY=… node tools/ops/restore.mjs <file>`, then `DATABASE_URL=<new db> node tools/ops/restore-check.mjs`, then point the server at it.
- **Two or more instances:** set `REDIS_URL` and run at least two (the host's instance count). Every instance shares players, answers, the leaderboard, match locks and limits.
- **Domain:** give the server a name (e.g. `api.<your domain>`), with A and AAAA records (or the host's CNAME) and the host's certificate. Check it with `node tools/ops/check-domain.mjs https://api.<your domain>`; App Review uses IPv6-only networks. Set `TRUST_PROXY` so the server sees HTTPS and sends HSTS.
- **Load test:** on staging, with `RATE_LIMITS` raised for registration and matches: `npm run server:build && npm run server:load -- --url https://<staging> --bps 14 --seconds 300`. One instance holds about 3 battles a second today (roadmap step 46).
- **Alerts and status:** scrape `/metrics` (Grafana Cloud's free tier or Prometheus) with `ops/prometheus/alerts.yml`; add an uptime check and a public status page on `/readyz` (Better Stack, UptimeRobot). For maintenance or an incident, set `SERVER_NOTICE` (shown to every player in Settings → Online play).
- **Staff tool:** open `https://<server>/admin`, paste `ADMIN_TOKEN` and your name. Find players by name or id; give or take resources (server-held villages only, with a reason that goes in the ledger), suspend or lift a suspension, reset ratings; open reports and deletion requests. Everything is in the staff log.

### 3i. Releasing a balance change (roadmap steps 72-78)

Phone players keep an old app for weeks, so the server checks every battle with the rules of the game that played it. A change that touches combat numbers (`troops.json`, `buildings.json`, `battle.json`: the rules-version test says so) goes out **server first**:

1. **Archive today's rules:** `npm run rules:snapshot`. It copies `src/gameplay/sim` and `src/gameplay/data` to `server/rules/v<N>/` and lists them in `server/rules/archive.ts`. Never edit a snapshot.
2. **Make the change:** bump `SIM_RULES` in `src/gameplay/sim/battle/battle.ts`, change the data, update `tests/gameplay/battle/rules-version.test.ts`, and record the new version's test battle with `npm run rules:fixture`. `npm test` replays every recorded version with its engine.
3. **Deploy the server** (staging, then production: section 3g). `/v1/hello` now lists both versions in `supportedRules`.
4. **Release the game** (web, Android, iPhone). Each release workflow first checks that the server lists this build's rules (`tools/release/check-server-rules.mjs`) and stops if it doesn't.
5. **Watch** the dashboard (`ops/grafana/game-versions.json`): traffic per rules version and build, desyncs per version, refused reports by reason. Tag the store release `v<version>`.
6. **Retire the old version** once under ~2% of battles use it, or after 4-6 weeks: set `RETIRED_RULES=<N>` on the server (games still on it see "Update Kagemura"), and in the next release delete `server/rules/v<N>/` and its line in `archive.ts`.

To make old builds update for any other reason (a security fix, a protocol change), set `MIN_CLIENT_BUILD` (for example `1.4.0`) on the server: older games are answered `426` and show "Update Kagemura". Set the store links once the listings exist: repository variables `VITE_APP_STORE_URL` and `VITE_PLAY_STORE_URL` (the web game reloads instead).

Changes that never touch a battle (prices, timers, rewards, text) need none of this: the server serves every data version of the same rules. To change those numbers without an app release at all, see balance bundles (section 3j).

### 3j. Balance bundles: number changes without an app release (roadmap step 76)

A bundle is a signed list of changes to existing numbers in the game's data (prices, timers, rewards, loot caps). It can never change combat numbers (those go through section 3i), text or code. Games check the signature and every rule, keep the bundle, and use it from their next start; if anything is off they use their built-in numbers.

1. **Once:** `node tools/balance/bundle.mjs keygen`. Keep the private key in a password manager (never in the repo). Put the public key in the repository variable `VITE_BALANCE_PUBLIC_KEY` (built into the game) and the server's `BALANCE_PUBLIC_KEY`.
2. **Write the changes** as dotted paths, e.g. `{ "economy.scoutFeeByHall.3": 40 }`, in a file.
3. **Sign:** `BALANCE_PRIVATE_KEY_FILE=key.pem npm run balance:bundle -- make changes.json 2026-11-20-cheaper-scouting`. It refuses combat numbers, text, unknown paths and non-numbers.
4. **Deploy** the bundle with the server: `BALANCE_BUNDLE_FILE=/path/balance-….json` (the server refuses to start with a bundle that doesn't check out). Players get it on their next start. To withdraw it, remove the setting: games go back to their built-in numbers on the next start.

A bundle is made for one build of the data: after a game release, make a new one for the new build (or none). Rerun the model-player tests (`tests/gameplay/balance/`) with the same numbers before shipping a big change.

## 4. Reminders

The installed iOS/Android app schedules real local notifications when you leave the game (turn them on in Settings). The web version can only notify while the game is still open in the background.

## 5. Not done yet (decisions for later)

- **Google Play** needs a Google Play Console account ($25 one-time). Purchases in the Android app stay off until it is built with `VITE_PLAY_BILLING=1` (section 3c).
- **Android sign-in** (Play Games / Google) still needs the Play services SDKs in `android/`.

## 5b. Store submission (roadmap steps 49-53, owner)

`docs/store/` has the listing texts, the privacy and age-rating answers, the App Review notes, the closed-testing plan and the release checklist; `npm run build && npm run store:screenshots` makes the screenshots.

## 6. Kagemura rebuild: identity steps (owner)

- **Repository:** `jimhavlicekpersonal/ninja-version-of-game-1` (done). Turn on Pages (Source: GitHub Actions).
- **Name check:** search trademarks and app stores for "Kagemura" before publishing. The display name lives in `index.html`, `public/manifest.webmanifest`, `capacitor.config.ts`, `android/.../strings.xml` and `ios/App/App/Info.plist`.
- **New store listings:** the bundle id (`com.toadstoolkingdoms.app`) was kept so nothing breaks. For a separate Kagemura app, choose a new reverse-domain id and update `capacitor.config.ts` and the native projects (`android/app/build.gradle` `applicationId` and `namespace`, the Java package folder, Xcode's bundle identifier) and the server's `APPLE_BUNDLE_IDS` / `GOOGLE_PLAY_PACKAGE`. Product ids already have their own store ids (section 3b).
- **Server:** deploy the server from the same commit as the game (protocol 7), with `npm run server:migrate` as the pre-deploy step (section 3, or the release workflow in 3g).
