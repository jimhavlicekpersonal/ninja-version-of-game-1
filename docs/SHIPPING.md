# Shipping Toadstool Kingdoms

Everything that can be built and tested without your personal accounts is in the repository. This page covers the steps only the owner can do.

## 1. Play on your devices right now (no accounts needed)

- **Web app (all devices):** https://jimhavlicekpersonal.github.io/toadstool-kingdoms/ (see the README for installing it to your home screen). The web build uses a **mock store**: purchases complete instantly and nothing is charged.
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

The server in `server/` (Node + Fastify + Postgres) stores bases, matches attackers with real players, re-runs every battle on the server so results cannot be faked, and keeps defense history. Without it, the game uses generated opponents and bot raiders.

1. Create a Postgres database. Render, Railway, Neon and Supabase all have free or cheap plans; copy its connection string.
2. Deploy the server, for example on Render as a **Web Service** from this repository:
   - Build command: `npm ci && npm run server:build`
   - Start command: `npm run server:start`
   - Environment variables:
     - `DATABASE_URL`: the connection string
     - `CORS_ORIGIN`: `https://jimhavlicekpersonal.github.io`
   - The tables are created automatically on first start.
3. Check `https://<your-server>/healthz` returns `{"ok":true}`.
4. In GitHub, go to **Settings → Secrets and variables → Actions → Variables** and add `VITE_SERVER_URL` = `https://<your-server>`. The next push to `main` rebuilds the web app and the Android APK with online play switched on.

To run it locally, use `npm run server:dev`. It uses memory instead of Postgres when `DATABASE_URL` is not set.

## 4. Reminders

The installed iOS/Android app schedules real local notifications when you leave the game (turn them on in Settings). The web version can only notify while the game is still open in the background.

## 5. Not done yet (decisions for later)

- **Google Play Billing** for the Android app. The `PaymentProvider` interface is ready for a Play Billing provider; purchases are disabled in the Android build until then. Publishing on Google Play also needs a Google Play Console account ($25 one-time).
- **Cloud saves across devices.** The server handles PvP. Your village itself is still saved per device; use Settings → Copy save code / Load from code to move it.
