# Privacy label, Data Safety, age rating and user content (step 50, draft answers)

These answers come from what the code does today (November 2026). Re-check them whenever online features change: a wrong declaration is a store-policy problem even if nothing bad happens. "Online" means a build with a server (`VITE_SERVER_URL`); the offline game sends nothing.

## What the game and server keep

| Data | Where | Why | Linked to the player |
|---|---|---|---|
| Player id and a hashed sign-in token | server | the online account | yes |
| Player name (chosen in game; filtered) | server, shown to other players | multiplayer | yes |
| Village, battles, replays (30 days), honor, ratings, ledger | server (village also on the device) | gameplay, cloud save, anti-cheat | yes |
| Alliance chat messages, troop requests, reports and blocks | server | multiplayer, moderation (reported text kept as evidence, deleted 90 days after a decision) | yes |
| Linked sign-ins: Apple, Google, Game Center or Play Games user id (never email or name) | server | cloud save, only if the player links one | yes |
| Purchase records: store, transaction id, product, price, refund status | server | delivering purchases once, refunds, the under-18 cap | yes (kept unlinked after account deletion, as financial records) |
| Age group (under 18 or not) | device and server village | spending cap | yes |
| Push token, notification types switched on, time-zone offset | server | push the player switched on | yes |
| IP address | server request logs (host retention) and short-lived rate-limit counters | security, abuse limits | no |
| Crash reports: error, stack, build, platform | Sentry, only when "Send crash reports" is on (a build with `VITE_SENTRY_DSN`) | fixing crashes | no |
| Gameplay analytics events | the device only (IndexedDB); never sent | Settings → on-device analytics | — |

Not collected: email, real name, contacts, location, photos, advertising id. No ads, no third-party tracking, no data sold or shared for advertising.

## App Store privacy label

- **Data used to track you:** none.
- **Data linked to you:**
  - Identifiers → User ID (player id; linked sign-in ids). Purpose: App Functionality.
  - Purchases → Purchase History. Purpose: App Functionality.
  - User Content → Gameplay Content (village, battles, replays); Other User Content (player name, Alliance chat). Purpose: App Functionality.
  - Identifiers → Device ID: declare it if you treat the push token as one (Apple does not require push tokens to be declared; declaring is the cautious choice). Purpose: App Functionality.
- **Data not linked to you:** Diagnostics → Crash Data (only when the player switches it on). Purpose: App Functionality.

## Google Play Data safety

- **Collected:** Personal info → User IDs; App activity → Other actions (gameplay), Other user-generated content (chat); Financial info → Purchase history; App info and performance → Crash logs (optional); Device or other IDs (push token).
- **Shared:** no (hosting, Sentry and the stores act as service providers, which the form does not count as sharing).
- **Processing:** encrypted in transit (HTTPS only; the apps refuse plain HTTP).
- **Deletion:** players can delete their account in the app (Settings → Online play → Account → Delete account) and on the web (`https://<server>/account/delete`).
- **Optional:** crash logs, linked sign-ins and push are optional; the online account is required for online play only (the game works offline).

## Age rating (IARC questionnaire, App Store age rating)

- Violence: cartoon or fantasy violence, non-realistic characters, no blood or gore.
- No sexual content, no profanity (chat is filtered), no drugs, no horror.
- Gambling: **no** simulated gambling, no paid random items. The daily chest is free, once a day, with its odds shown before opening; it is never sold.
- Users interact: **yes** (Alliance chat, player names). Players can report and block; staff act on reports.
- Shares location: no. Digital purchases: **yes**.
- Expected results: around PEGI 7 / ESRB Everyone 10+ / USK 6; App Store 9+ for violence, but Apple's age questions about messaging and user-generated content may set a higher rating (13+). Answer the chat questions truthfully and accept the result.

## User-generated content (Apple 1.2, Google UGC policy)

The game has Alliance chat and player names. In place, with tests:
- a word filter on chat and names (`src/gameplay/sim/social/grove.ts`);
- report a message or a player (Alliance chat → ⋯), block a player (their chat and requests disappear for you);
- a message reported by 3 different players is hidden for everyone until staff decide;
- a staff queue (`/admin`, `docs/SHIPPING.md` section 3a) to remove messages, mute and suspend players, with every action logged;
- contact for players: the support URL in the listing. Commit to acting on reports within 24 hours.
