# Privacy label, Data Safety, age rating and user content (step 50, draft answers)

These answers come from what the code does today (rechecked 2026-11-05 for worldwide audit GLOBAL-019). Re-check them whenever online features change: a wrong declaration is a store-policy problem even if nothing bad happens. "Online" means a build with a server (`VITE_SERVER_URL`); with online play off the game sends nothing, except crash reports if the player switched them on. The published policy is `public/privacy.html` (see `PRIVACY_POLICY.md`).

## What the game and server keep

| Data | Where | Why | Linked to the player |
|---|---|---|---|
| Player id and a hashed sign-in token | server | the online account | yes |
| Player name (chosen in game; filtered), friend code, privacy choices, last-online time | server, name shown to other players | multiplayer | yes |
| Friends, friend requests (lapse after 14 days), Gangs, Gang chat, Friendly Duels, Gang Wars | server | multiplayer | yes |
| Village, battles, replays (30 days), honor, ratings, ledger | server (village also on the device) | gameplay, cloud save, anti-cheat | yes |
| Alliance chat messages, troop requests, reports and blocks | server | multiplayer, moderation (reported text kept as evidence, deleted 90 days after a decision) | yes |
| Linked sign-ins: Apple, Google, Game Center or Play Games user id (never email or name) | server | cloud save, only if the player links one | yes |
| Purchase records: store, transaction id, product, price, refund status | server | delivering purchases once, refunds, the under-18 cap | yes (kept unlinked after account deletion, as financial records) |
| Age group (under 18 or not) | device and server village | spending cap | yes |
| Push token, notification types switched on, time-zone offset | server | push the player switched on | yes |
| IP address | server request logs (host retention) and short-lived rate-limit counters | security, abuse limits | no |
| Crash reports: error message (URL parameters and email-like text removed), stack, build, platform | Sentry, only after the player turns on "Send crash reports" (off by default since 2026-11-05; the switch exists only in a build with `VITE_SENTRY_DSN`). An error message can still quote text the code was handling | fixing crashes | no (only if Sentry is set not to store IP addresses) |
| Server error reports: error, route, method and path without query string | Sentry, when the operator sets the server's `SENTRY_DSN` | fixing server faults | no |
| Support email: address and message | the support mailbox, only when a player writes | answering the player | yes (owner: decide whether your store forms count mail sent outside the app) |
| Web deletion requests: Player ID or name, optional note, reference, outcome | server (`deletion_requests`) | carrying out the request | yes. The page asks for no email address; the API still stores a `contact` field if a client sends one (backend follow-up) |
| Gameplay analytics events | the device only (IndexedDB); never sent | Settings → on-device analytics | — |

Not collected in the game: email (except when a player writes to support), real name, contacts, location, photos, advertising id. No ads, no third-party tracking, no data sold or shared for advertising. The web version's host (GitHub Pages or your domain) logs IP addresses like any website.

## App Store privacy label

- **Data used to track you:** none.
- **Data linked to you:**
  - Identifiers → User ID (player id; linked sign-in ids). Purpose: App Functionality.
  - Purchases → Purchase History. Purpose: App Functionality.
  - User Content → Gameplay Content (village, battles, replays); Other User Content (player name, Alliance chat). Purpose: App Functionality.
  - Identifiers → Device ID: declare it if you treat the push token as one (Apple does not require push tokens to be declared; declaring is the cautious choice). Purpose: App Functionality.
- **Data not linked to you:** Diagnostics → Crash Data (only when the player switches it on; off by default). Purpose: App Functionality. This holds only while Sentry is set not to store IP addresses.
- **Contact Info → Email Address:** not collected by the app. Support mail sent from the player's own mail app is outside the app; declare it if you add an in-app contact form.

## Google Play Data safety

- **Collected:** Personal info → User IDs; App activity → Other actions (gameplay), Other user-generated content (chat); Financial info → Purchase history; App info and performance → Crash logs (optional); Device or other IDs (push token).
- **Shared:** no (hosting, Sentry and the stores act as service providers, which the form does not count as sharing).
- **Processing:** encrypted in transit (HTTPS only; the apps refuse plain HTTP).
- **Deletion:** players can delete their account in the app (Settings → Online play → Account → Delete account) and on the web (`https://<server>/account/delete`).
- **Optional:** crash logs (off until the player turns them on), linked sign-ins and push are optional; the online account is created automatically when online play is on and is needed for online play only. Building can continue without a connection, but once a village is kept on the server, raids, Alliances, friends and purchases need one (audit R01).

## Age rating (IARC questionnaire, App Store age rating)

- Violence: cartoon or fantasy violence, non-realistic characters, no blood or gore.
- No sexual content, no drugs, no horror, and no profanity in the game's own text. Players can still type crude language: the word filter catches common words only, not every language, spelling or code word (audit R06), so answer the user-generated-content questions as unfiltered chat.
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
- community rules players can read: `public/community.html`, linked from Settings → Privacy and help and from the support page;
- contact for players: the support URL in the listing (`public/support.html`).
- Not yet in place (audit R06): the rules are English only; players are not asked to accept them before first using chat or friends (that needs a one-time notice in `ui/groveUi.ts` and `ui/friendsUi.ts`); staff cannot rename an offending player (only mute or suspend); no promised response time. Commit to a response time only once moderation is staffed for it.
