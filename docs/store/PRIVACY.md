# Privacy label, Data safety, age rating and user content (step 50, draft answers)

These answers come from what the code does (re-walked 2026-11-05 against `server/migrations/0001`–`0020`, `server/pgRepo.ts` `deletePlayer`, `server/core/retention.ts`, `server/core/moderation.ts`, `server/observability.ts`, `src/backend/platform/auth.ts`, `src/backend/analytics/sentryEnvelope.ts`, `src/presentation/ui/communityRules.ts`, `economyUi.ts`). Re-check them whenever online features change: a wrong declaration is a store-policy problem even if nothing bad happens. "Online" means a build with a server (`VITE_SERVER_URL`); with online play off the game sends nothing, except crash reports if the player switched them on. The published policy is `public/privacy.html` (see `PRIVACY_POLICY.md`); legal documents per market are in `docs/legal/`.

**Fix release.** Several answers below depend on age and moderation features being added in parallel to this document (seen in the working tree on 2026-11-05: `src/gameplay/sim/age.ts`, `server/core/age.ts`, migration `0024_accounts_minors.sql`, `server/identity/appleTokens.ts`): a neutral age screen before online play (birth year, and month only in a boundary year, or the store's age range; only the band is kept), under 13 = fixed chat phrases only (`PRESET_CHAT`), a generated name, never findable by name; 13–17 = findable by friends of friends, online status off; a one-time web deletion code (hash kept, 30 days); Sign in with Apple refresh-token revocation; moderation notices (`player_notices`); offers that never open on their own for under-18 players. Recheck the final code before submitting. They are marked **(build ≥ fix release)**. Do not submit declarations or publish the policy for a build older than that release without removing those statements.

## What the game and server keep

| Data | Where (code) | Why | Linked | Kept |
|---|---|---|---|---|
| Player id, hashed sign-in tokens (one per device) | `players`, `player_tokens` | the online account | yes | account lifetime |
| Player name (chosen, filtered, any script), previous name and its 35-day hold, friend code, `findable`, `show_online`, last-online time | `players`, `name_holds` | multiplayer; name shown to other players | yes | account lifetime; old name hold 35 days |
| Age band: under 13 / 13–17 / adult (build ≥ fix release; the birth year typed on the age screen is not stored, recheck the age-screen UI); older builds: `player_age.under18` only, asked before a first purchase | device village `profile`, server `player_age.band` | spending cap, chat, name and discovery restrictions | yes | account lifetime (only gets stricter; staff `reset-age`) |
| Alliance and Gang chat messages, troop requests, donations | `grove_chat`, `troop_requests`, `donations` | multiplayer | yes | account lifetime (deleted with the account) |
| Friends, friend requests, Gangs, Gang invites, Friendly Duels and tallies, Gang Wars | `friendships`, `friend_requests`, `squads*`, `duel*`, `squad_war*` | multiplayer | yes | requests 14 days; duels 30 days; rest account lifetime |
| Village kept on the server, command log, ledger, battles, replays, honor, ratings, import holds | `villages`, `command_log`, `ledger`, `attacks`, `tickets`, `base_versions`, `import_holds` | gameplay, cloud save, anti-cheat | yes | replays and command log 30 days; rest account lifetime |
| Reports (reason, optional note, reported message text as evidence), blocks, mutes, suspensions | `reports`, `blocks`, `players.muted_until/banned_until/ban_reason` | moderation | yes | handled reports 90 days after decision; blocks until unblocked |
| Moderation notices to reporters and to affected players (build ≥ fix release) | `player_notices` (kind, text, read) | telling players what staff decided, and how to appeal (DSA Art. 16(5)/17) | yes | until the account is deleted (cascade); proposal: prune read notices after 12 months (backend) |
| Staff action log (actor, action, player id, detail) | `staff_actions` | accountability | yes | **not pruned and not removed on account deletion** (backend follow-up: anonymise the player id on deletion or after 2 years) |
| Linked sign-ins: Apple, Google, Game Center or Play Games subject id (never email or name); for Apple also the refresh token and client id from the authorization-code exchange (build ≥ fix release) | `identity_links` (`refresh_token`, `client_id`, migration 0024) | cloud save; revoking at Apple on deletion or unlink (App Review 5.1.1(v)) | yes | until unlinked or account deleted |
| Device tokens: which sign-in made each, last used (build ≥ fix release) | `player_tokens.provider`, `last_used_at` | signing out devices when a sign-in is unlinked; pruning unused tokens | yes | until unused long enough to be pruned (recheck the period) |
| Web deletion codes: hash and expiry (build ≥ fix release) | `deletion_codes` | proving a web deletion request is the owner's | yes | 30 days, replaced on a new request, deleted with the account |
| Game Center friend ids | used once to match, not stored (`friendIds`) | find friends, opt-in | — | not kept |
| Purchase records: store, transaction id, product, price in cents, environment, refund status | `purchases`, `purchase_intents` | delivering once, restore, refunds, the under-18 cap | yes; unlinked after deletion (player id replaced) | purchases indefinitely (financial records); intents 90 days |
| Push token, platform, types switched on, time-zone offset, daily count | `push_tokens` | push the player switched on | yes | until turned off or account deleted |
| IP address | rate-limit counters (≤ 1 h windows, memory or Redis) and host/server request logs | security, abuse limits; never used for location | no | logs: host retention (owner sets `retentionServerLogs`) |
| Crash reports: error message (URL parameters and email-like text removed), stack, build, platform | Sentry, only after the player turns on "Send crash reports" (off by default; the switch exists only with `VITE_SENTRY_DSN`) | fixing crashes | no (only if Sentry "Prevent Storing of IP Addresses" is on) | Sentry plan retention |
| Server error reports: error, route, method and path without query string | Sentry, when the server's `SENTRY_DSN` is set (`server/observability.ts`) | fixing server faults | no, but see note | Sentry plan retention |
| Support email: address and message | the support mailbox, only when a player writes | answering the player | yes | owner sets `retentionSupportMail` |
| Web deletion requests: Player ID or name, optional note, whether a valid code came with it (`verified`), reference, outcome | `deletion_requests` | carrying out the request (staff carry out only verified ones without an override note) | yes | **not pruned** (owner sets `retentionDeletionRequests`; backend follow-up) |
| Gameplay analytics events | the device (IndexedDB) | Settings → on-device analytics | — | device |
| Shared play statistics (report section 5 step 5, build ≥ fix release): only the events and fields of `STATS_EVENTS` (`src/backend/net/stats.ts`: session start, tutorial steps, raid stars/destruction, upgrade/research starts, offers shown, Jade speed-ups, purchases with product and catalog USD), a random statistics id, game build, experiment arm | `stats_events` (migration 0027; no player id, no IP column; the route writes no request log line) and the daily totals `stats_daily` | finding where players get stuck, retention, A/B tests of offer timing | **no** (random id, never sent with the player token; the server cannot join it to an account) | 400 days (`retention.ts`); deleted at once when the player turns sharing off. Opt-in, adults only (`analytics/share.ts`) |

Notes from the re-walk:
- `deletion_requests.contact` is no longer stored: `server/core/account.ts` always writes `''` (an email sent by an old page is dropped, `core.test.ts`). The column remains in the schema.
- Server error report paths can contain another player's id or a friend code (`/v1/friends/:id`, `/v1/players/code/:code`). Backend follow-up: report the route pattern instead of the path. Until then treat server diagnostics as possibly containing user ids (not linked to the reporting device, so the store answers below are unchanged).
- Not collected in the game: email (except when a player writes to support), real name, contacts, location, photos, advertising id. No ads, no third-party tracking, no data sold or shared for advertising. The web version's host (GitHub Pages or your domain) logs IP addresses like any website.

## Retention (owner decisions the code does not enforce yet)

Each is a field in `public/legal-config.js`; the policy shows "not published yet" until it is filled. Proposals:

| What | Proposal | What it needs |
|---|---|---|
| Inactive online accounts | Delete after **24 months** without online play, after an in-game notice (and push, if switched on) 30 days before; purchase records kept unlinked as on deletion | Backend: a scheduled job using `players.last_seen_at` and `deleteAccount`, a notice, a staff report. Until it exists, leave `retentionInactiveAccounts` empty. |
| Support mail | **24 months** after the last message of a conversation | Mailbox rule or manual purge |
| Handled web deletion requests | **12 months** after handling, then delete the row | Backend: add to `retention.ts` `prune` |
| Server request logs with IP | **30 days** | Host log settings |
| Staff action log | Anonymise the player id after **24 months** and on account deletion | Backend |

## App Store privacy label

- **Data used to track you:** none.
- **Data linked to you** (purpose: App Functionality for all):
  - Identifiers → **User ID**: the player id, linked sign-in ids and the player name. Apple's User ID covers "screen name, handle, account ID, assigned user ID": the chosen player name belongs here, not under Contact Info → Name (which is a real first or last name).
  - Purchases → **Purchase History**.
  - User Content → **Gameplay Content** (village, battles, replays, layouts) and **Other User Content** (Alliance and Gang chat, Gang and Alliance names, report notes). Cautious alternative: also tick **Emails or Text Messages** for chat between players [recheck Apple's current definition before submitting].
  - Other Data → **Other Data Types**: the age band.
  - Identifiers → **Device ID**: declare it if you treat the push token as one (cautious choice). Purpose: App Functionality.
- **Data not linked to you:** Diagnostics → **Crash Data** (only when the player switches it on). Holds only while Sentry stores no IP addresses. Usage Data → **Product Interaction** (shared play statistics: opt-in, adults only, a random statistics id; purpose Analytics). Purchases → **Purchase History** is already declared as linked; the statistics' purchase events (product, catalog price) need no second entry, but tick "not linked" too if App Store Connect asks per purpose. Holds only while the host's load balancer logs for `/v1/stats` are not joined with the game's other logs (owner: host log settings).
- **Not collected by the app:** Contact Info (email, name, phone), Location (IP is never used for location), Contacts, Browsing History, Usage Data → Advertising Data and Other Usage Data. Support mail and the web deletion form are outside the app; declare User Content → Customer Support if you add an in-app contact form.

## Google Play Data safety

Walked against the Play data types (support.google.com/googleplay/android-developer/answer/10787469, read 2026-11-05):

| Play category → type | What | Collected / shared | Optional | Purpose |
|---|---|---|---|---|
| Personal info → **Name** | the player name (Play's Name includes "nickname"; under 13 a generated name) | collected, not shared | no, for online play | App functionality |
| Personal info → **User IDs** | player id, friend code, linked Google / Play Games / Apple / Game Center ids | collected | linked sign-ins optional | App functionality, Account management |
| Personal info → **Other info** | age band | collected | no, for online play | App functionality (and safety) |
| Messages → **Other in-app messages** | Alliance and Gang chat; reported message text kept as evidence | collected | yes (chat is optional; under 13 only fixed phrases, build ≥ fix release) | App functionality; Fraud prevention, security and compliance (moderation) |
| App activity → **Other user-generated content** | report reasons and notes, Gang/Alliance names, village layouts | collected | yes | App functionality, security |
| App activity → **Other actions** | battles, raids, duels, wars, friends, gifts, village commands | collected | no, for online play | App functionality, fraud prevention (battle checks) |
| Financial info → **Purchase history** | store transaction ids, products, prices, refunds | collected | yes (only buyers) | App functionality, fraud prevention |
| App info and performance → **Crash logs** | crash reports (and **Diagnostics** if you count stack/build/platform there) | collected only after opt-in | **yes** (off by default) | Analytics (crash fixing) |
| Device or other IDs | FCM push token | collected | yes (push is opt-in) | App functionality |
| App activity → **App interactions** | shared play statistics under a random statistics id (report section 5 step 5) | collected, not shared | **yes** (off until an adult says yes; never under 18) | Analytics |

- **Not declared:** IP addresses (Play has no IP type; declare Location only if IP is used to derive location, and it is not); email (support mail is outside the app); Name from the sign-in providers (never received or stored).
- **Shared:** no. Hosting, Sentry, Apple and Google act as service providers, which Play does not count as sharing.
- **Encrypted in transit:** yes (HTTPS only; the apps refuse plain HTTP).
- **Deletion:** in the app (Settings → Online play → Account → Delete online account) and on the web (`deletionUrl` in `legal-config.js`, the server's `/account/delete`; with the deletion code from Settings, build ≥ fix release).
- **Account creation:** the online account is created automatically when online play is on (no user name/password). Play's "account creation" question: "My app allows users to create an account" with the in-app method "other" (automatic), and the web deletion URL.
- **Families / Designed for Families:** do not opt in (the game targets 13+); answer the Target audience question as 13–15, 16–17 and 18+ only. If you add under-13 to the target audience, the Families policy and Teacher Approved rules apply (age screen neutrality, no unvetted SDKs; Sentry would need review) [recheck].

## Age rating

### Apple (current scheme: 4+, 9+, 13+, 16+, 18+)

Apple's age ratings values page (developer.apple.com/help/app-store-connect/reference/age-ratings-values-and-definitions/, read 2026-11-05) puts "Frequent cartoon or fantasy violence" at **13+** and "Infrequent" at 9+. Raiding other villages with warriors is the core loop (every session), so answer:

| Question | Answer |
|---|---|
| Cartoon or Fantasy Violence | **Frequent** → 13+ |
| Realistic violence, prolonged graphic violence, guns | None (no blood or gore; shuriken and blades are stylised) |
| Profanity or crude humour | None in the game's own text; player chat is covered by the UGC/messaging answers |
| Horror, mature/suggestive, sexual content, alcohol/drugs, medical | None |
| Simulated gambling, contests | None; daily chest is free (not a loot box: nothing random is sold) |
| Loot boxes ("randomized virtual items for purchase") | **No** |
| Messaging and chat | **Yes** (Alliance and Gang chat) |
| User-generated content | **Yes** (names, chat) |
| Social media features (feeds that amplify UGC) | No (no public feed; chat is inside Alliances/Gangs of the player's choosing) |
| Parental controls / age assurance | Age band screen is self-declared (not age assurance); answer **No** for age assurance [recheck the wording of the in-app controls questions] |
| Unrestricted web access | No (legal pages are shipped with the app; external `https://` links open the browser) |

Expected result: **13+**. In-app purchases are not a rating question; App Store Connect shows them on the listing automatically. Brazil and Korea have their own rating values in the same page; check the regional results Apple shows.

### Google Play (IARC questionnaire)

Answer consistently with Apple: violence = fantasy/cartoon violence against non-realistic characters, frequent, no blood; no sexual content, drugs, gambling or horror; **users can interact** (chat), **shares user-provided content with other users** (yes), shares location (no), **digital purchases** (yes), random items for purchase (no). Expected: around PEGI 7 / ESRB Everyone 10+ / USK 6 or 12 / ClassInd 10 / GRAC 12, with "In-Game Purchases" and "Users Interact" descriptors. The IARC result does not depend on the target audience you choose; set Play's **target audience** to 13+ (above) so it matches Apple's 13+ and the policy. Korea needs its own GRAC rating for the App Store (Apple's Korea values) and through IARC for Play (`docs/legal/MARKETS.md`).

## User-generated content (Apple 1.2, Google UGC policy)

The game has Alliance chat, Gang chat and player/Alliance/Gang names. In place, with tests:
- a word filter on chat and names in every script (`src/gameplay/sim/social/grove.ts`, `names.ts`);
- report a message or a player (Alliance chat, Gang chat, member list or friend card → ⋯), block a player (their chat and requests disappear for you; they can no longer find or friend you);
- a message reported by 3 different players is hidden for everyone until staff decide;
- a staff queue (`/admin`, `docs/SHIPPING.md` section 3a) to remove messages, mute and suspend players, with every action logged;
- community rules players read and accept once before their first chat message to real players or opening Friends (`src/presentation/ui/communityRules.ts`, "I agree"), and in full at `public/community.html` (Settings → Privacy and help, support page);
- terms of service (draft until adopted): `public/terms.html`, with moderation, notices and appeals;
- under 13: fixed chat phrases only, a generated name, never findable by name; 13–17: findable only by friends of friends, online status off (build ≥ fix release);
- notices to reporters (outcome) and to affected players (what, why, how long, how to appeal) (build ≥ fix release);
- contact for players: the support URL in the listing (`public/support.html`).
- Still open (audit R06/R07): the rules and notices are English only; staff cannot rename an offending player (only mute or suspend); no promised response time (commit to one only once moderation is staffed). UK and EU online-safety duties: `docs/legal/ONLINE_SAFETY_UK.md`, `docs/legal/MARKETS.md`.
