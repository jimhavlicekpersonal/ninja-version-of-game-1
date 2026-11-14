# Shipping Kagemura: Ninja Clans

Everything that can be built and tested without your personal accounts is in the repository. This page covers the steps only the owner can do.

## 1. Play on your devices right now (no accounts needed)

- **Web app (all devices):** https://jimhavlicekpersonal.github.io/ninja-version-of-game-1/ (see the README for installing it to your home screen). The public web build has **no store** (purchases show as unavailable) and runs on real time. The instant mock store and the time-skip tools exist only in the **testing sandbox**: open the game with `?sandbox` (or `?debug`). The sandbox keeps a separate village and never goes online, so test purchases and skipped time can't reach a real village or a server. Before a competitive online launch, decide whether the server should own the economy (inventory, research, timers); see `docs/PROTOCOL.md`, "Trust".
- **Android app on your Pixel 7:** every push to `main` builds an installable debug APK (and, once the upload key is set up, a signed Play release: section 1b).
  1. On GitHub, open **Actions → Android app (debug APK and signed release AAB)** and click the latest green run.
  2. Under **Artifacts**, download `kagemura-android-apk` and unzip it (you get `app-debug.apk`).
  3. Send the APK to the phone (Google Drive, email, or a USB cable), open it, and allow "Install unknown apps" for that app when Android asks.
  4. In-app purchases are off in this debug APK (Play only sells to a Play-installed build). The release AAB has them on.

## 1b. Android: the Google Play release (signed AAB, owner)

**Store age signals (report section 5 step 7, compliance C01/C02; owner).** Google Play: request Play Age Signals API access for the app in Play Console (App content / Policy → Age signals) before release; until it is granted `requestAgeSignalsAccess` answers nothing and the game falls back to its own age screen, except where Play answers `VERIFICATION_REQUIRED`, when the game tells the player to verify in the Play Store. Test on a Play-installed build in a user-choice region and in a US state with an app-store age law. iPhone: build with the Xcode 26.5 SDK, then add `AgeRangeService.requiredRegulatoryFeatures` and the significant-update acknowledgement to `ios/App/App/TkAgePlugin.swift` (not written yet: the API could not be compiled or read where this was prepared), decide with legal what counts as a significant update, and turn on App Store Server Notifications V2 (the server already handles `RESCIND_CONSENT` for accounts it can trace through a purchase).

The `aab` job of the Android workflow builds the Play release (audit GLOBAL-017): the game with `VITE_PLAY_BILLING=1` (Play Billing Library 9.1.0, `android/variables.gradle`), a `versionCode` that grows with every run, signed with your **upload key**. Without the key it builds nothing and the run shows a warning saying which secrets are missing; the debug APK is unaffected.

1. **Make an upload key once** (keep the file and passwords safe; with Play App Signing a lost upload key can be reset, the app signing key never leaves Google):

   ```bash
   keytool -genkeypair -v -keystore upload.jks -alias upload -keyalg RSA -keysize 4096 -validity 10000
   base64 -w0 upload.jks > upload.jks.b64     # macOS: base64 -i upload.jks -o upload.jks.b64
   ```

2. **GitHub → Settings → Secrets and variables → Actions → Secrets:** `ANDROID_KEYSTORE_BASE64` (the contents of `upload.jks.b64`), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`upload`), `ANDROID_KEY_PASSWORD`.
3. **Variables:** `ANDROID_VERSION_CODE_OFFSET` (optional, default 0): `versionCode` = run number + offset, so raise the offset once if Play already holds a higher code. `versionName` comes from `package.json` `version`. Also `VITE_SERVER_URL` (with Google receipt checks on the server, section 3c), `VITE_PUBLIC_URL` (friend links, below) and `VITE_GOOGLE_CLIENT_ID` (Sign in with Google, below).
4. **Play Console:** create the app (`com.toadstoolkingdoms.app` or your new id, section 6), turn on Play App Signing, upload the first AAB (artifact `kagemura-android-release-aab-<versionCode>`) to **internal testing**. The run prints the upload certificate's SHA-256; it must match **Test and release → App integrity → Upload key certificate**. The run also lists the Play Billing / Credential Manager versions it resolved and any native libraries (16 KB page-size check).
5. **Local release builds** (optional): put `storeFile`, `storePassword`, `keyAlias`, `keyPassword` in `android/keystore.properties` (git-ignored), or set the same `ANDROID_*` environment variables, and run `./gradlew bundleRelease -PtkVersionCode=<n>`. A local build without `-PtkVersionCode` is version code 1: don't upload it.

**Sign in with Google on Android (account recovery, audit GLOBAL-008).** Settings → Account → Sign-ins offers Google in the Android app when it is built with `VITE_GOOGLE_CLIENT_ID`. It uses Credential Manager (`TkAuthPlugin.java`); the ID token's audience is that **web** client id. In Google Cloud Console (APIs & Services → Credentials, one project):
- a **Web application** OAuth client: its id is `VITE_GOOGLE_CLIENT_ID` (GitHub variable) and goes into the server's `GOOGLE_CLIENT_IDS`;
- an **Android** OAuth client for the package name with the SHA-1 of the **Play app signing key** (Play Console → App integrity), and another with the SHA-1 of the upload key (and the debug key, for debug APKs). Google refuses the sign-in from an app whose certificate is not registered;
- the OAuth consent screen published (not "Testing"), or only listed test users can sign in.
Then check on a phone: link Google, uninstall, reinstall from Play, **Sign in here** with Google: the village comes back from the server. Also on a second phone.

**Friend links from the apps (R09).** Set the variable `VITE_PUBLIC_URL` to the web game's address (e.g. `https://<you>.github.io/<repo>/`): links and QR codes shared from the apps then open the web game with `?friend=…`. Opening such a link *in the app* (Android App Links, iOS Universal Links) needs your own domain: section 1c.

## 1c. Links that open the app: App Links and Universal Links (R09, owner)

The game's side is done (2026-11-14): `src/backend/platform/links.ts` listens for `appUrlOpen` and reads the launch URL (`@capacitor/app`), and routes `?friend=CODE` (Friends, once online) and `?open=daily|army|store|news` exactly like the web; anything else in a link is ignored. What only you can do:

1. **A domain you control** that serves two files at its root over HTTPS, with no redirect (a GitHub Pages *project* site, `<you>.github.io/<repo>/`, cannot serve the root; a custom domain on Pages or any static host can). Point `VITE_PUBLIC_URL` at it so shared links use it.
2. **`/.well-known/assetlinks.json`** from `tools/applinks/assetlinks.template.json`: `__ANDROID_PACKAGE__` = the application id (today `com.toadstoolkingdoms.app`), `__PLAY_APP_SIGNING_SHA256__` = Play Console → Test and release → App integrity → App signing key certificate, SHA-256 (`AA:BB:…`; add the upload key's fingerprint too to test release builds you install yourself).
3. **`/.well-known/apple-app-site-association`** (no file extension, served as `application/json`) from `tools/applinks/apple-app-site-association.template.json`: `__APPLE_TEAM_ID__` (developer account → Membership) and `__IOS_BUNDLE_ID__`.
4. **Android:** in `android/app/src/main/AndroidManifest.xml`, replace `YOUR_DOMAIN` in the commented `autoVerify` intent filter (marked `TODO(owner, audit R09)`) and uncomment it. Check with `adb shell pm get-app-links com.toadstoolkingdoms.app` after installing (`verified`).
5. **iPhone:** enable Associated Domains for the App ID (developer account → Identifiers), replace `YOUR_DOMAIN` in the commented block of `ios/App/App/App.entitlements` and uncomment it (`applinks:<domain>`), and regenerate the provisioning profile.
6. **Verify on devices:** share a friend link from one phone, tap it on another with the app installed (opens Friends on that player) and without it (opens the web game; store install, then the link again).

Never copy the templates into `public/` with the placeholders in them (`release-config.test.ts` checks). Until then links keep opening the web game.

## 2. iPhone: TestFlight and a sandbox purchase

Apple only builds iPhone apps on a Mac. The **iOS TestFlight (manual)** workflow uses a GitHub macOS machine, so you never need your own Mac.

**One-time setup (about an hour, in a web browser):**

1. Join the **Apple Developer Program** ($99/year) at https://developer.apple.com/programs/.
2. In **Certificates, Identifiers & Profiles → Identifiers**, register an App ID. Use `com.toadstoolkingdoms.app`, or your own ID. If you use your own, also change `appId` in `capacitor.config.ts` and add a repository variable `IOS_BUNDLE_ID` with the same value.
3. In **App Store Connect → Apps**, create a new iOS app with that bundle ID.
4. In the app's **Monetization → In-App Purchases**, add every product in the table in **section 3b** as a **Consumable**, using its **store id** (the first column: `jade_pinch`, `jade_pouch`, …, `season_scroll`, `clan_stipend`), never the game id (`moonstones_1`, `lantern_pass`, …). The game asks the App Store for the store ids (`store.json` `storeProductIds`), and App Store Connect never lets a product id be used again, even after deletion, so a product made with the wrong id is lost for good. `offer_rebuild` is retired (no longer offered); creating it is optional.

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
3. On the iPhone, install **TestFlight** from the App Store, accept the invite and install Kagemura.
4. **Sandbox purchase:** in the game, open the Store and buy a pack. TestFlight purchases use Apple's sandbox, so you are **not charged**. Apple's purchase sheet appears after the game's own confirm step.

**Testing purchases on a Mac (optional):** `ios/App/Products.storekit` lists every product (generated from `store.json` by `npm run store:storekit`; a test keeps them equal, report section 5 step 7). In Xcode, choose **Product → Scheme → Edit Scheme → Run → Options → StoreKit Configuration** and select it (drag it into the project first) to test purchases in the simulator without App Store Connect.

## 3. Online play (real players instead of bots)

The server in `server/` (Node + Fastify + Postgres) does five things:

- matches you with real players, using the same rules as offline play (Clan Keep level, honor, loot penalty and loot caps);
- re-runs every battle, so results cannot be faked;
- delivers real raids against your village;
- runs real Alliances (chat, warrior requests and donations; `grove` in the code);
- pairs Alliances for the weekly Alliance War (`groveRaid` in the code).

Without a server, the game uses generated opponents, bot raiders and a bot Alliance, as before, and the village stays on the device. With one, the game moves its village to the server (protocol 7), and linked sign-ins bring it to another device.

1. Create a Postgres database. Render, Railway, Neon and Supabase all have free or cheap plans; copy its connection string.
2. Deploy the server, for example on Render as a **Web Service** from this repository:
   - Build command: `npm ci && npm run server:build`
   - Pre-deploy (release) command: `npm run server:migrate`. It applies new database migrations before the new version starts, once, even with several instances (Render: "Pre-Deploy Command"; Fly.io: `release_command`; Railway: "Pre-deploy step"). On a host without a release step and with exactly one instance, set `MIGRATE_ON_BOOT=1` instead.
   - Start command: `npm run server:start`. It refuses to start while migrations are pending, so a skipped release step shows up at once instead of as broken requests.
   - Environment variables:
     - `DATABASE_URL`: the connection string. TLS (re-audit): if the provider publishes its CA certificate, set `PG_CA_CERT` (the PEM itself, or a file path) and the server verifies the database against it; `sslmode=verify-full` verifies against the system's CAs (providers with a publicly trusted certificate); `sslmode=require` now verifies too, unless you set `PG_SSL_ALLOW_UNVERIFIED=1` to accept an encrypted but unchecked connection knowingly (production warns about it, and refuses `sslmode=no-verify` without it). No `sslmode` means plain TCP, fine only on the host's private network.
     - Pool (optional, `server/config.ts`): `PG_POOL_MAX` (10 connections per instance; instances × this must stay under the database's `max_connections`, minus the release step and backups), `PG_CONNECT_TIMEOUT_MS` (5000), `PG_STATEMENT_TIMEOUT_MS` (30000; the database cancels a longer statement, `0` turns it off, e.g. behind a PgBouncer that refuses startup parameters), `PG_IDLE_TX_TIMEOUT_MS` (60000; a transaction left idle that long is ended and its row locks freed), `PG_IDLE_TIMEOUT_MS` (30000). `npm run server:migrate` runs without the statement timeout.
     - `DEPLOY_ENV`: `staging` or `production` (section 3f). Production refuses to start without its essentials.
     - Purchases, push and their keys: sections 3c and 3e.
     - `TRUST_PROXY` (required in production): how the server finds each player's IP address for the rate limits. Behind a load balancer (Render, Fly.io, Railway, Cloud Run, most hosts) set the number of proxies in front of the server, usually `1`, or the proxies' addresses/CIDRs (e.g. `10.0.0.0/8`); then only the entry the last trusted proxy added counts, and whatever the client wrote in `X-Forwarded-For` is ignored. Set `false` only when players connect to the server directly. Never `true`: it trusts every `X-Forwarded-For` entry, so any client could choose its address and dodge the limits (production refuses it, and refuses an unset value, which behind a load balancer would make every player one address). Check after deploying: two phones on different networks must not share a limit. The weekly restore drill in `.github/workflows/backup.yml` starts a production server, so it needs `TRUST_PROXY=false` on that line.
     - `RATE_LIMITS` (optional): JSON that overrides individual limits, for example `{"register":{"limit":200,"windowMs":3600000}}` on a staging server that runs the contract tests often. The defaults are in `server/rateLimit.ts` and `docs/PROTOCOL.md`.
     - `REDIS_URL` (optional for one instance, needed for two or more): `rediss://…` from Upstash (or any Redis). It holds the leaderboard (rebuilt from Postgres if Redis is emptied), match locks and rate-limit counters, so every instance shares them. Without it, the database holds the leaderboard and locks, and each instance counts its own rate limits (N instances allow up to N times each limit). If Redis goes down, each instance degrades instead of failing (re-audit): commands time out after 500 ms (`REDIS_TIMEOUT_MS`) and the client then fails fast for a second at a time, rate limits let requests through, the leaderboard reads Postgres (and rebuilds the Redis set once it answers), and match locks fall back to open tickets (a rare double match is possible meanwhile). `tk_redis_up` and `tk_redis_errors_total` show it; alert on them. `/readyz` does not fail for Redis unless you set `REDIS_REQUIRED=1`.
     - Rate limits per IP are loose on purpose (3,000 requests a minute and 300 new players an hour per IPv4 address, IPv6 counted per /64): carrier-grade NAT puts thousands of players behind one IPv4 address in South and Southeast Asia, Africa and Latin America, so the per-player limits do the real work. Raise them with `RATE_LIMITS` if a soft-launch market shows `tk_rate_limited_total{rule="ip"}` or `{rule="register"}` for real players.
     - `SENTRY_DSN` (optional, recommended): the server's errors (5xx answers, crashes) go to this Sentry project; `SENTRY_ENVIRONMENT` names it (default `production`, use `staging` there). Free Sentry plans are enough at first.
     - `METRICS_TOKEN` (optional): serve Prometheus metrics at `/metrics` to `Authorization: Bearer <token>` (re-simulation time, battles, desyncs, errors by code, rate limits, request counts and latency). Point Grafana Cloud's agent or any Prometheus at it.
     - `LOG_LEVEL` (optional): `info` by default. Logs are JSON lines with a request id; tokens are never written.
     - Health checks: point the host's health check at `/healthz` (the process answers). `/readyz` also checks Postgres (and Redis only with `REDIS_REQUIRED=1`, since an instance serves without it) and answers 503 when one is down; use it for load-balancer readiness, not for restarts.
     - Account linking (cloud save), each optional: `APPLE_CLIENT_IDS` (the app's bundle id, plus the web Services ID), `GOOGLE_CLIENT_IDS` (OAuth client ids), `GAMECENTER_BUNDLE_IDS`, `PLAYGAMES_CLIENT_ID` + `PLAYGAMES_CLIENT_SECRET`. In Xcode, add the **Sign in with Apple** and **Game Center** capabilities (Signing & Capabilities → +) and enable them for the App ID. For the web build, GitHub variables `VITE_GOOGLE_CLIENT_ID` and `VITE_APPLE_SERVICES_ID`.
     - `ADMIN_TOKENS`: one token per staff member, `name:token,name2:token2` (each token a long random secret of at least 24 characters, e.g. `openssl rand -hex 32`; names are what the staff log shows). It turns on the staff API for account-deletion requests, the moderation queue and the player tools (section 3a); the log records whose token did each action, and the name typed in the staff page is ignored for these tokens. Remove a person by removing their pair and redeploying. `ADMIN_TOKEN` (one shared token, whose actor is the name typed in the page) still works for an older setup; production warns about it. Optional `ADMIN_ALLOW_IPS`: addresses or CIDRs (your office, VPN or bastion) that alone may reach `/admin…`; everyone else gets 404. Without a staff token those routes don't exist.
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

Create these in App Store Connect (In-App Purchases) and the Play Console (In-app products), with the **store id** in the first column. The game keeps its own ids (they are in saves) and maps them to these in `src/gameplay/data/store.json` (`storeProductIds`, roadmap step 38); to use other store ids, change only that map. Prices are the game's USD prices; pick the matching price tier in each store. Every product is a **consumable in both stores** (Google Play: the server consumes a purchase once its own village holds it, and only acknowledges one the device still has to deliver, which the game consumes after its save has landed; App Store: the game finishes the transaction after delivery).

| Store id | Game id | Type | USD | What it gives |
|---|---|---|---|---|
| `jade_pinch` | `moonstones_0` | Consumable | 0.99 | 45 Jade (Pinch of Jade) |
| `jade_pouch` | `moonstones_1` | Consumable | 1.99 | 100 Jade (Pouch of Jade) |
| `jade_bag` | `moonstones_2` | Consumable | 4.99 | 280 Jade (Bag of Jade) |
| `jade_box` | `moonstones_3` | Consumable | 9.99 | 600 Jade (Box of Jade) |
| `jade_chest` | `moonstones_4` | Consumable | 19.99 | 1,300 Jade (Chest of Jade) |
| `jade_vault` | `moonstones_5` | Consumable | 49.99 | 3,500 Jade (Vault of Jade) |
| `jade_hoard` | `moonstones_6` | Consumable | 99.99 | 7,500 Jade (Dragon Hoard of Jade) |
| `season_scroll` | `lantern_pass` | **Consumable in both stores** (decided 2026-11-05; see below) | 4.99 | Season Scroll premium track |
| `offer_starter` | `offer_starter` | Consumable (the game allows it once per account) | 1.99 | Starter offer |
| `offer_builder` | `offer_builder` | Consumable | 4.99 | Builder offer |
| `offer_war_prep` | `offer_war_prep` | Consumable | 2.99 | War prep offer |
| `offer_rebuild` | `offer_rebuild` | Consumable | 2.99 | Rebuild offer |
| `offer_keep` | `offer_keep` | Consumable | 4.99 | Keep Celebration offer: 300 Jade plus supplies sized for the buyer's Keep, offered when a Keep level is reached (report section 5 step 6) |
| `clan_stipend` | `clan_stipend` | Consumable (describe it as "30 daily Jade payments", never "monthly": nothing renews) | 2.99 | Clan Stipend: 30 payments of 12 Jade (was 20 until report section 5 step 6; stipends bought before keep 20), one claimable per UTC day, none lost; buyable again once all are claimed |

These two were missing from this table before 2026-11-06 (state-of-the-game report, section 5 step 4, economy E08): a store set up from it would have shown "Not sold here" on the two cheapest products. `tests/backend/release-config.test.ts` now checks that every product in `store.json` `storeProductIds` is listed here.

**Season Scroll product type (decided):** a consumable in App Store Connect and Play Console, so the same product can be bought again each season (a non-consumable can be bought only once per Apple ID / Google account, ever; a non-renewing subscription would make Apple require restore across all the user's devices and a duration Apple does not enforce). The game, not the store, knows the season: `grantPurchase` gives the premium track until the season ends (`pass.json`), and a second purchase in the same season is refused before the store sheet opens. **Restore** is the server's purchase history for the same online account: Store → Restore purchases (`controller.restorePurchases`) asks `GET /v1/purchases` and gives back this season's Scroll if a credited, unrefunded Scroll purchase exists. On a new device that only works on the same account, so recommend linking Sign in with Apple / Google (Settings → Online play → Account → Sign-ins) in the Store's Scroll card and in support. App Review accepts restore through your own account system for consumables; say so in the review notes (`docs/store/REVIEW_NOTES.md`). Option (not needed, owner may add): set `SKIncludeConsumableInAppPurchaseHistory` = YES in `ios/App/App/Info.plist` (iOS 18+) so StoreKit 2's `Transaction.all` / current-entitlement history also lists finished consumables; the native plugin could then restore a Scroll from Apple's own history for a player who never linked a sign-in, after the server checks the JWS as usual.

Nothing random is sold, so no odds disclosure is needed for these. Real prices are shown only in the Store and its confirm step.

### 3c. Store keys and purchase checks on the server (roadmap steps 34-37)

The server checks every store purchase before it is delivered (`server/payments/`), credits each store transaction once, keeps the under-18 cap across devices, and takes refunds back. Set these on the server (they are secrets: the host's secret settings, never the repository):

- **App Store** (step 35): `APPLE_BUNDLE_IDS` = the app's bundle id (defaults to `GAMECENTER_BUNDLE_IDS`). Receipts are StoreKit 2 signed transactions, checked against Apple Root CA - G3, which is built in by its SHA-256 fingerprint; compare it once with the certificate on https://www.apple.com/certificateauthority/ (`APPLE_ROOT_CA_SHA256` overrides it). `APPLE_ENVIRONMENTS` defaults to `Production,Sandbox` (App Review buys in the sandbox against the production server). No App Store Server API key is needed for this; keep the `.p8` for later use of that API.
  - **Refunds:** App Store Connect → the app → App Information → App Store Server Notifications: set Version 2 and the URL `https://<server>/v1/webhooks/apple` for production and for sandbox (staging's address there).
- **Google Play** (step 36): `GOOGLE_PLAY_PACKAGE` (the application id) and `GOOGLE_SERVICE_ACCOUNT_JSON` (a service account key, as one line of JSON; invite the service account in Play Console → Users and permissions with "View financial data" and "Manage orders"). Refunds: create a Pub/Sub topic, set it in Play Console → Monetization setup → Real-time developer notifications, and add a **push** subscription to `https://<server>/v1/webhooks/google` with authentication on; set `GOOGLE_RTDN_AUDIENCE` (the subscription's audience) and `GOOGLE_RTDN_SERVICE_ACCOUNT` (its service account email). The server also reads the Voided Purchases API every hour. The Android release AAB (section 1b) is built with `VITE_PLAY_BILLING=1`, so purchases are on there; the debug APK leaves them off.
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
- `DEPLOY_ENV=production`: the store builds. It refuses to start without `DATABASE_URL`, `ADMIN_TOKENS` (or `ADMIN_TOKEN`), an explicit `CORS_ORIGIN` list and a `TRUST_PROXY` other than `true`, or with `APNS_SANDBOX=1` or an unverified database TLS connection not allowed by `PG_SSL_ALLOW_UNVERIFIED=1`, and warns about missing Sentry and metrics (`server/config.ts`).
- Each database remembers the first deployment that used it (`server_meta`), and a server of the other kind refuses to start on it, so a copied `DATABASE_URL` can never let staging write to production's data.
- Build games against each with GitHub **Environments** (Settings → Environments → `staging`, `production`), each with its own `VITE_SERVER_URL` variable.

### 3g. Server releases (roadmap step 43)

`.github/workflows/server.yml`: every push to `main` that touches the server or the shared rules runs all tests (Postgres and Redis included), builds one Docker image (`Dockerfile`, tagged with the commit, pushed to `ghcr.io/<owner>/<repo>/server`), deploys it to staging and runs the contract tests there, with this build's client and the previous release's (the latest `v*` tag). Production gets the same image only when you run the workflow by hand with target `production`.

Set up once: in Settings → Environments, create `staging` and `production` (give `production` required reviewers). In each, add the secret `DEPLOY_HOOK` (the host's deploy URL; it receives `{ "image", "tag" }` and must run `node dist-server/migrate.js` before starting the new image: Render and Railway deploy hooks, or a small script on your host) and the variable `SERVER_URL`. Tag each store release `v<version>` so later releases are tested against it.

**What a host must allow (report section 5 step 2):** the server stops cleanly on SIGTERM: `/readyz` answers 503 for `SHUTDOWN_DRAIN_MS` (default 5 s; set it to the load balancer's health-check interval), then requests in flight finish and everything closes, within `SHUTDOWN_DEADLINE_MS` (25 s). Keep the host's kill timeout above that (Render, Fly and Railway default to about 30 s). Retention, voided purchases and Gang War reminders run on one instance at a time (leases in `job_leases`), so any number of instances is safe. A run whose deploy did nothing shows a warning on the run and in its summary; a production deploy without `DEPLOY_HOOK` fails.

**Running a server locally:** run `npm run server:dev`. It uses memory instead of Postgres when `DATABASE_URL` is not set. In the game, set the server address to `http://localhost:8787`, or to `http://<laptop-ip>:8787` from a phone on the same Wi-Fi, using `npm run dev:lan`.

**Building a different server later:** `docs/PROTOCOL.md` describes everything the game expects. The contract tests check any server against it.

### 3h. Backups, instances, domain, alerts, staff tool (roadmap steps 44-48)

- **Backups:** turn on your database host's point-in-time recovery first (Neon, Render, Supabase and Railway have it on paid plans): it is the real backup once there are players. On top, `.github/workflows/backup.yml` makes an encrypted `pg_dump` every day (kept 35 days as a workflow artifact) and every Sunday restores it into an empty database, checks it and starts the server on it. In the `production` environment add `BACKUP_DATABASE_URL` (a read-only role) and `BACKUP_KEY` (`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`; keep a copy outside GitHub). To restore for real: `TARGET_DATABASE_URL=<new empty db> BACKUP_KEY=… node tools/ops/restore.mjs <file>`, then `DATABASE_URL=<new db> node tools/ops/restore-check.mjs`, then point the server at it.
  - **Size (owner step, re-audit):** the daily dump into GitHub artifacts works for a soft launch, not at scale. The database grows with 30 days of replays (`attacks`, `base_versions`), `command_log` (every village command, 30 days), the ledger (append-only) and idempotency answers; at tens of thousands of daily players that is tens of GB, past what a workflow can dump and upload in its time limit and what artifact storage keeps cheaply. Before then: rely on the host's PITR (or WAL archiving with `pgBackRest`/`wal-g` to object storage you own, e.g. S3/R2/GCS with versioning and a lifecycle rule), run `tools/ops/backup.mjs` from a scheduled job next to the database writing to that bucket instead of GitHub, keep the weekly restore drill (against the newest dump or a PITR clone), and watch dump time and size. Encrypt with `BACKUP_KEY` as today and keep the key outside the bucket's account.
- **Two or more instances:** set `REDIS_URL` and run at least two (the host's instance count). Every instance shares players, answers, the leaderboard, match locks and limits. Set `RATE_LIMIT_INSTANCES` to the usual instance count: limits counted on one instance (while Redis is down) are divided by it.
- **Check `TRUST_PROXY` after every deploy (backend A31):** `curl -H "Authorization: Bearer <staff token>" https://<server>/admin/v1/ip` (or `/metrics/ip` with `METRICS_TOKEN`) from your phone on mobile data: `ip` must be the phone's public address, not the load balancer's or Cloudflare's. Behind Cloudflare in front of the host, that is usually `TRUST_PROXY=2`.
- **Policy decisions (backend batch 2026-11-13; defaults are conservative):** `DORMANT_ACCOUNT_DAYS` (730; 0 turns it off) and `DORMANT_MAX_KEEP` (3): anonymous accounts never seen for that long, with no purchase, linked sign-in or staff role and no server-held village above that Keep, are deleted. Say so in the privacy policy (`retentionInactiveAccounts` in `public/legal-config.js`) before launch. `SESSION_IDLE_DAYS` (400): other devices' tokens unused that long are signed out. `SIGNIN_NONCE_REQUIRED=1` once every supported game build sends sign-in nonces (not yet: the native and web sign-in still need to pass one). `SANDBOX_CREDIT_DAILY_CAP_USD`: the most Sandbox/TestFlight purchases credited per day on production. `USD_RATES` (JSON, e.g. `{"EUR":1.08,"GBP":1.27,"INR":0.012}`, update monthly): local store prices count against the under-18 cap at that rate; without a rate the catalog USD price counts. `GAMECENTER_CA_PEM`: the CA certificate that issues Apple's Game Center keys, if you want the chain checked. `complaintUrl` in `public/legal-config.js`: `https://<server>/complaints`, so the support page links the complaint form.
- **Domain:** give the server a name (e.g. `api.<your domain>`), with A and AAAA records (or the host's CNAME) and the host's certificate. Check it with `node tools/ops/check-domain.mjs https://api.<your domain>`; App Review uses IPv6-only networks. Set `TRUST_PROXY` so the server sees HTTPS and sends HSTS.
- **Load test:** on staging, with `RATE_LIMITS` raised for registration and matches: `npm run server:build && npm run server:load -- --url https://<staging> --bps 14 --seconds 300`. One instance holds about 3 battles a second today (roadmap step 46).
- **Alerts and status:** scrape `/metrics` (Grafana Cloud's free tier or Prometheus) with `ops/prometheus/alerts.yml`; add an uptime check and a public status page on `/readyz` (Better Stack, UptimeRobot). For maintenance or an incident, set `SERVER_NOTICE` (shown to every player in Settings → Online play).
- **Staff tool:** open `https://<server>/admin`, paste your own token from `ADMIN_TOKENS` (or the legacy `ADMIN_TOKEN` and your name). Find players by name or id; give or take resources (server-held villages only, with a reason that goes in the ledger), suspend or lift a suspension, reset ratings; open reports and deletion requests. Everything is in the staff log.

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

**Experiment arms** (report section 5 step 5, growth 3): an arm is a bundle with a `cohort` (experiment, arm, buckets `from`–`to` of 0..99). Each game that shares play statistics picks the arm its statistics id falls in (`cohortBucket`, FNV-1a of `experiment:id`), keeps it for its next start, and reports `experiment:arm` with its statistics, so `GET /admin/v1/stats` shows D1/D7/D30 and payers per arm. Players who don't share are never in an arm. An arm may change **only offer timing** (`offers.durationHoursMin|Max`, `offers.maxPerSession`, `offers.rules.N.durationHours|cooldownHours|minAccountHours`; `checkCohort`): the server replays a held village with one set of numbers, so an arm that changed costs, timers or loot would desync every village in it, and prices and rewards must be the same for everyone anyway. Make one with `BALANCE_COHORT=offer-timing-1:short:0-50 BALANCE_MAIN=balance-main.json BALANCE_PRIVATE_KEY_FILE=key.pem npm run balance:bundle -- make arm.json offer-timing-1-short`, and deploy `BALANCE_BUNDLE_FILE` as one JSON array `[main, arm, …]` (at most one bundle without a cohort). Read the result only once each arm has a few hundred installs past day 7; stop an experiment by removing its arms.

A bundle is made for one build of the data: after a game release, make a new one for the new build (or none). Rerun the model-player tests (`tests/gameplay/balance/`) with the same numbers before shipping a big change.

## 4. Reminders

The installed iOS/Android app schedules real local notifications when you leave the game (turn them on in Settings). The web version can only notify while the game is still open in the background.

## 5. Not done yet (decisions for later)

- **Google Play** needs a Google Play Console account ($25 one-time). The release AAB (section 1b) has purchases on; the debug APK does not.
- **Android sign-in:** Sign in with Google is in the app (section 1b; needs the OAuth clients). **Play Games** sign-in and Play Games friends are not (no Play Games SDK in `android/`).
- **Links that open the app** (App Links / Universal Links): the game handles them; the domain, association files, manifest filter and entitlement are owner steps (section 1c).

## 5b. Store submission (roadmap steps 49-53, owner)

`docs/store/` has the listing texts, the privacy and age-rating answers, the App Review notes, the closed-testing plan and the release checklist; `npm run build && npm run store:screenshots` makes the screenshots.

## 6. Kagemura rebuild: identity steps (owner)

- **Repository:** `jimhavlicekpersonal/ninja-version-of-game-1` (done). Turn on Pages (Source: GitHub Actions).
- **Name check:** search trademarks and app stores for "Kagemura" before publishing. The display name lives in `index.html`, `public/manifest.webmanifest`, `capacitor.config.ts`, `android/.../strings.xml` and `ios/App/App/Info.plist`.
- **New store listings:** the bundle id (`com.toadstoolkingdoms.app`) was kept so nothing breaks. For a separate Kagemura app, choose a new reverse-domain id and update `capacitor.config.ts` and the native projects (`android/app/build.gradle` `applicationId` and `namespace`, the Java package folder, Xcode's bundle identifier) and the server's `APPLE_BUNDLE_IDS` / `GOOGLE_PLAY_PACKAGE`. Product ids already have their own store ids (section 3b).
- **Server:** deploy the server from the same commit as the game (protocol 7), with `npm run server:migrate` as the pre-deploy step (section 3, or the release workflow in 3g).
