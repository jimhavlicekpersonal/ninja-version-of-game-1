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

Without a server, the game uses generated opponents, bot raiders and a bot Grove, as before. Your village itself always stays on your device.

1. Create a Postgres database. Render, Railway, Neon and Supabase all have free or cheap plans; copy its connection string.
2. Deploy the server, for example on Render as a **Web Service** from this repository:
   - Build command: `npm ci && npm run server:build`
   - Pre-deploy (release) command: `npm run server:migrate`. It applies new database migrations before the new version starts, once, even with several instances (Render: "Pre-Deploy Command"; Fly.io: `release_command`; Railway: "Pre-deploy step"). On a host without a release step and with exactly one instance, set `MIGRATE_ON_BOOT=1` instead.
   - Start command: `npm run server:start`. It refuses to start while migrations are pending, so a skipped release step shows up at once instead of as broken requests.
   - Environment variables:
     - `DATABASE_URL`: the connection string.
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

**Running a server locally:** run `npm run server:dev`. It uses memory instead of Postgres when `DATABASE_URL` is not set. In the game, set the server address to `http://localhost:8787`, or to `http://<laptop-ip>:8787` from a phone on the same Wi-Fi, using `npm run dev:lan`.

**Building a different server later:** `docs/PROTOCOL.md` describes everything the game expects. The contract tests check any server against it.

## 4. Reminders

The installed iOS/Android app schedules real local notifications when you leave the game (turn them on in Settings). The web version can only notify while the game is still open in the background.

## 5. Not done yet (decisions for later)

- **Google Play Billing** for the Android app. The `PaymentProvider` interface is ready for a Play Billing provider; purchases are disabled in the Android build until then. Publishing on Google Play also needs a Google Play Console account ($25 one-time).
- **Cloud saves across devices.** The server handles PvP, Groves and Grove Raids. Your village itself is still saved per device; use Settings → Copy save code / Load from code to move it. Moving the village economy to the server would also stop players from editing their own saves (see "Trust" in `docs/PROTOCOL.md`).

## 6. Kagemura rebuild: identity steps (owner)

- **Repository:** `jimhavlicekpersonal/ninja-version-of-game-1` (done). Turn on Pages (Source: GitHub Actions).
- **Name check:** search trademarks and app stores for "Kagemura" before publishing. The display name lives in `index.html`, `public/manifest.webmanifest`, `capacitor.config.ts`, `android/.../strings.xml` and `ios/App/App/Info.plist`.
- **New store listings:** the bundle id (`com.toadstoolkingdoms.app`) and the product ids were kept so nothing breaks. For a separate Kagemura app, choose a new reverse-domain id, update `capacitor.config.ts`, the native projects and App Store Connect products, and update `src/gameplay/data/store.json` product ids at the same time.
- **Server:** deploy the server from the same commit as the game (protocol 6), with `npm run server:migrate` as the pre-deploy step (section 3).
