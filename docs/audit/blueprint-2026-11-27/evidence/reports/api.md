# API audit: the server's HTTP surface, route by route (read-only, 2026-11-27)

Audited commit `4b79711` (working tree as found). Built server `dist-server/main.js` run in memory mode on `127.0.0.1:58081` (`ADMIN_TOKEN`, `METRICS_TOKEN`, `RESIM_WORKERS=1`, default rate limits). Probe scripts: `(session scratch, not kept)/api/` (`alliance.mjs`, `grovelist.mjs`, `chat.mjs`, `filter.mjs`, `misc.mjs`, `queues.mjs`, `slowloris.mjs`, `idor.mjs`). No tracked file was changed. Postgres and Redis were not run: every reproduction is on the memory stores; where the Postgres SQL differs it is quoted.

Final version. Two server runs: the first with default settings (probes `alliance`, `grovelist`, `misc`, `chat`, `filter`), the second with `TRUST_PROXY=1` so a probe could present different client addresses through `X-Forwarded-For` (`queues`, `words`, `idor`, `delcode`, `slowloris`). The server was stopped afterwards.

## 1. Route inventory

Applies to every route (`server/app.ts`):

- Body limit 16 KB unless noted (`BODY_LIMITS.default`); JSON and text only; `__proto__` bodies refused by Fastify (reproduced: 400); gzip request bodies are inflated with the limit on the inflated size (reproduced: a 20 KB body inflating to 20 MB is refused 413 in 5 ms).
- Rate limits (`app.ts:336-374`): `ip` 3000/min per IPv4 address or IPv6 /64 on everything except `OPTIONS` and `/healthz`; `player` 240/min for any request with a bearer token, keyed `p:<player id>` for a valid token on `/v1/…`, else `t:<sha256(token)>`. Route rules below are keyed by the same `who`, except `register`, `deletionRequest`, `villageImport`, `stats`, `nonce`, `complaint` (keyed by IP).
- Idempotency: any non-GET with a valid player token and an `Idempotency-Key` (≤ 100 chars) has its 2xx answer kept 24 h (`app.ts:297-314`), replayed only for the same method, route and body.
- Auth "player": bearer token → `core.authenticate` (401 unknown, 403 suspended). Every handler takes the acting player from the token; no route takes the acting player's id from the body.
- No Fastify `requestTimeout` / `connectionTimeout` is set (finding API-5).

| Method | Path | Auth | Extra rate rule | Body limit / notes |
|---|---|---|---|---|
| GET | /healthz | none | none (also skips `ip`) | version, deploy, uptime |
| GET | /readyz | none | ip | ok/down per check |
| GET | /metrics, /metrics/ip | METRICS_TOKEN (constant time) | staffAuth 10/min/IP on failure | only when configured |
| OPTIONS | any | none | none | 204 |
| GET | /v1/hello, /v1/balance | none | ip | |
| POST | /v1/players | none | register 300/h/IP (+ registerWide 3000/h per IPv6 /48) | `{name}` |
| GET PUT DELETE | /v1/me | player | — | rename: 28-day cooldown; delete: at once, no second factor |
| GET | /v1/friends | player | — | |
| PUT | /v1/me/privacy | player | — | answers the whole friends view |
| GET | /v1/players/lookup?name= | player | lookup 30/min + lookupDay 300/day | |
| GET | /v1/players/code/:code | player | lookup + lookupDay | |
| POST | /v1/friends/requests | player | lookup + lookupDay | `{name|code|playerId}` |
| POST DELETE | /v1/friends/requests/:id | player | — | only the addressee answers, only the sender cancels |
| POST | /v1/friends/platform | player | lookup + lookupDay | 32 KB, ≤ 300 ids, needs that provider linked |
| DELETE | /v1/friends/:id | player | — | |
| GET POST | /v1/links | player | POST: moderation 30/h | |
| DELETE | /v1/links/:provider | player | — | |
| POST | /v1/sessions | none | register | sign-in credential |
| PUT | /v1/me/age | player | moderation | only stricter |
| PUT | /v1/me/rules | player | — | |
| POST | /v1/me/deletion-code | player | moderation | |
| GET | /v1/notices; POST /v1/notices/read | player | — | |
| POST | /v1/sessions/revoke-others, /v1/sessions/rotate; DELETE /v1/sessions/current | player | moderation | |
| POST | /v1/auth/nonce | none | nonce 600/h/IP | |
| POST | /v1/webhooks/apple-signin | none (Apple-signed JWT) | ip only | 128 KB |
| GET POST | /v1/village | player | — | |
| POST | /v1/village/import | player | villageImport 60/h/IP | 1 MB |
| POST | /v1/village/commands | player | commands 30/min | 256 KB |
| GET | /v1/village/ledger?limit= | player | — | clamped 1-200 |
| POST | /v1/purchases/intent, /v1/purchases/intent/release | player | purchase 120/h | |
| POST GET | /v1/purchases | player | purchase | POST 128 KB |
| POST | /v1/webhooks/apple | none (JWS with x5c chain to Apple's root) | ip only | 128 KB; `notificationUUID` kept (replay, order) |
| POST | /v1/webhooks/google | none (Google OIDC bearer, audience + service account) | ip only | 128 KB |
| PUT | /v1/push/tokens | player | moderation | |
| DELETE | /v1/push/tokens?token= | player | — | only the caller's own token |
| POST | /v1/reports | player | moderation | `{kind, messageId|playerId, reason, note, block}` |
| GET POST | /v1/blocks; DELETE /v1/blocks/:id | player | POST: moderation | ≤ 500 blocks |
| GET | /account/delete?lang= | none | ip | HTML, CSP, no-store |
| POST | /v1/account/deletion-requests | none | deletionRequest 5/h/IP | |
| GET | /complaints?lang= | none | ip | HTML, CSP, no-store |
| POST | /v1/complaints | none | complaint 20/h/IP | no request log line |
| POST DELETE | /v1/stats | none | stats 3000/h/IP | POST 128 KB |
| PUT | /v1/base | player | — | 128 KB |
| GET | /v1/match | player | match 30/min | |
| POST | /v1/attacks | player | battle 20/min | 256 KB |
| POST | /v1/attacks/start, /v1/attacks/void | player | battle | |
| GET | /v1/defenses?since=, /v1/leaderboard?limit=, /v1/leaderboard/power?limit= | player | — | limit clamped 1-100 |
| POST | /v1/duels/ticket | player | match | |
| POST GET | /v1/duels | player | POST: battle | POST 256 KB |
| PUT | /v1/duels/layout | player | — | 128 KB |
| POST GET | /v1/duels/challenges | player | POST: moderation | |
| GET | /v1/squad/war | player | — | |
| POST DELETE | /v1/squad/war/queue | player | POST: match | |
| POST | /v1/squad/war/base | player | moderation | |
| POST | /v1/squad/war/ticket | player | match | |
| POST | /v1/squad/war/attacks | player | battle | 256 KB |
| POST | /v1/squad/war/claim | player | — | |
| GET | /v1/grove/raid | player | — | |
| POST | /v1/grove/raid/ticket | player | match | |
| POST | /v1/grove/raid/attacks | player | battle | 256 KB |
| POST | /v1/grove/raid/claim | player | — | |
| GET | /v1/groves?q= | player | **none** | API-4 |
| POST | /v1/groves | player | **none** | API-7 |
| POST | /v1/groves/:id/join | player | **none** | API-1 |
| GET | /v1/grove | player | — | |
| POST | /v1/grove/leave | player | **none** | API-1 |
| GET POST | /v1/grove/chat | player | POST: 12 a minute in the core | API-2 |
| GET POST | /v1/grove/requests | player | 30-min cooldown in the core | |
| POST | /v1/grove/requests/:id/donate | player | — | request must be in the caller's Alliance |
| GET | /v1/grove/inbox; POST /v1/grove/inbox/ack | player | — | |
| GET POST | /v1/squad | player | POST: moderation | |
| POST | /v1/squad/invites | player | moderation | leader, friends only |
| POST | /v1/squad/invites/:id | player | — | only the invited player |
| POST | /v1/squad/leave, /v1/squad/leader | player | — | |
| GET POST | /v1/squad/chat, /v1/squad/requests | player | as Alliance | |
| POST | /v1/squad/requests/:id/donate | player | — | |
| GET POST | /v1/referrals | player | POST: moderation + lookup | |
| POST | /v1/referrals/claim | player | moderation | |
| POST GET | /v1/replays/shared | player | POST: battle + replayShare 30/day | POST 256 KB |
| GET | /v1/replays/shared/:code | none | lookup, keyed by the caller's bearer hash | API-9 |
| DELETE | /v1/replays/shared/:code | player (the sharer) | — | |
| GET | /v1/me/compliance, /v1/me/replay-privacy | player | — | |
| PUT | /v1/me/terms, /v1/me/consumption-consent, /v1/me/replay-privacy | player | moderation | |
| GET | /admin, /admin/app.js, /admin/stats, /admin/stats.js | none (static, no data; `ADMIN_ALLOW_IPS` applies) | ip | CSP `script-src 'self'`, no-store |
| GET | /admin/v1/deletion-requests, /reports, /complaints (`?status=`) | staff token | staffAuth on failure | oldest 200 (API-6) |
| POST | /admin/v1/deletion-requests/:id, /reports/:id, /complaints/:id | staff token | | |
| GET | /admin/v1/players?q=, /players/:id, /players/:id/sessions | staff token | | views logged |
| POST | /admin/v1/players/:id/{revoke-sessions, reverse-raids, reset-honor, adjust, ban, reset-rating, reset-age, rename, import-holds/:hold/release} | staff token | | each written to `staff_actions` |
| GET | /admin/v1/{name-clashes, suspects, pairs, actions, ip, stats, stats/local, stats/funnel, stats/battles, reports/jp-unused-balance} | staff token | | |

## 2. New findings, ranked

| ID | Severity | Confidence | Title | Checked |
|---|---|---|---|---|
| API-1 | HIGH | high | Joining and leaving an Alliance has no cooldown or rate rule: one free account floods any Alliance's chat with system lines that blocks, mutes and reports cannot touch, pushes real messages out of the 100-row window, and reads every member list | reproduced |
| API-2 | MEDIUM | high | Chat keeps direction-override, zero-width and unlimited combining characters; text written backwards after U+202E passes the link/contact filter and is shown forwards | reproduced |
| API-3 | MEDIUM | high | Three throwaway accounts can hide any chat message in any Alliance (open join + auto-hide at 3 reports), from the author too, until staff act | reproduced |
| API-4 | MEDIUM | high | Alliance browse and search only ever consider the 200 oldest Alliances: later ones cannot be found by browsing, and 200 one-member Alliances own the list | reproduced |
| API-5 | MEDIUM | high | No request timeout on the HTTP server (Fastify default `requestTimeout: 0`): a request whose body never arrives is held open; 300 such requests from one address were all still held | reproduced (held 150 s, then the probe stopped; "for ever" is from the source) |
| API-6 | MEDIUM | high | Staff queues (reports, complaints, deletion requests) show the oldest 200 items with no bulk action; free accounts and the no-token forms fill them (the forms count per IPv6 /64 only), so a genuine report or complaint is not shown | reproduced |
| API-7 | LOW-MEDIUM | high | Alliance names skip the reserved-word check: "Kagemura Support", "Moderator", "System", "Kagemura Staff" are accepted (player and Gang names refuse them) | reproduced |
| API-8 | LOW-MEDIUM | medium | Idempotent answers are kept for a day with no cap per caller or per answer: 240 writes a minute per account each store up to ~19 KB | sizes reproduced; Postgres growth source only |
| API-9 | LOW | high | The `lookup` limit on the no-token shared-replay route is keyed by whatever bearer token the caller sends | reproduced |
| API-10 | LOW | medium | Cancelling and re-sending a friend request (and re-sending a Gang invite) pushes the target again each time; four a day use up the target's whole push allowance | new request ids reproduced; push by source |
| API-11 | LOW | high | JSON answers carry no `Cache-Control` and nothing sets `X-Content-Type-Options: nosniff`; the Sentry report keeps friend codes and share codes in the path | headers reproduced; Sentry source only |

## 3. Findings

### API-1 (HIGH): Alliance join/leave churn: unmoderatable chat flood, lost messages, member scraping

- Where: `server/routes/social.ts:18,20` (`POST /v1/groves/:id/join`, `POST /v1/grove/leave`: no `rate`); `server/core/groves.ts:89-105` (`joinGrove`: no cooldown, every Alliance is open), `:108-123` (`leaveGrove`), `:46-48` and `:103`, `:113` (a `system` chat row per join and per leave, `playerId: null`); `:138-149` (`chatIn` returns at most 100 rows); `server/stores/pg/alliances.ts:75-78` (`order by seq desc limit 100`: the newest 100 after the cursor); `server/core/moderation.ts:44` (a row without a player cannot be reported); `groves.ts:145` (blocks filter only rows with a player).
- Attack: register (free), then loop join → leave on a target Alliance. Each cycle writes two system lines carrying the attacker's name. Limits that apply: only the general 240 requests a minute per player.
- Reproduced (`alliance.mjs`): 100 join/leave cycles in 255 ms, every one `200/204`. The leader, who had blocked the attacker, then got 100 chat rows, all 100 system lines; a member's real message sent before was no longer in the answer. Reporting a system line: `404 That message is gone`. A muted or blocked account can do the same (mute and block are not checked on join). One join also returns every member's id, name, honor, Keep and last-seen time (`groveView`), so the same loop reads the member list of every non-full Alliance at 120 Alliances a minute, around the name-lookup limits that exist "so nobody scrapes the player list" (`rateLimit.ts:41`).
- Impact: any Alliance's chat can be made unusable for as long as the attacker likes; a game that polls with a cursor misses every real message once more than 100 system lines arrive between polls. Players have no defence (no kick route exists, block and report do nothing); staff can only suspend the account and the attacker registers another (300 an hour per address). Alliance War coordination and donation requests run through this chat.
- Fix: a per-player join cooldown (Gangs already have 24 h, `squads.ts:29`) and a `moderation`-style rate rule on join, leave and create; do not write a system line for a member who was in the Alliance for less than a few minutes (or collapse repeats); let blocks hide system lines that name a blocked player; give the leader a remove-member action; page chat by cursor without dropping rows.
- Not verified: the Postgres path (same core code; the SQL is quoted above); how the shipped game's poll interval interacts with the 100-row cut.
- Dedupe: not in any list (searched "join", "leave", "cooldown", "system message", "kick", "hop"). The 2026-11-20 audit's S4 only removed last-seen times of members who hide them.

### API-2 (MEDIUM): chat keeps override and invisible characters; backwards text passes the contact filter

- Where: `src/gameplay/sim/social/grove.ts:80-83` (`filterText`: cut to 160 code points, word filter, contact filter; nothing strips format characters from what is stored); `src/gameplay/sim/social/contactFilter.ts:62,103` (the filter removes `\p{Cf}` from its own folded copy before matching); `server/core/groves.ts:159-172` (`postChatIn` stores `enforced.text`); `src/presentation/ui/groveUi.ts:218` and `gangUi.ts:190` (text node in a `unicode-bidi: plaintext` span, so the override applies inside the message).
- Attack: type the message backwards after U+202E (RIGHT-TO-LEFT OVERRIDE). The filter reads "won moc.elpmaxe tisiv" and finds no link; every reader's browser draws it as "visit example.com now".
- Reproduced (`filter.mjs`, `chat.mjs`): plain "visit example.com now", "add me on discord user#1234", "my telegram is t.me/abcde", "insta @some.name" are all replaced; the same four written backwards after U+202E are stored unchanged (`201`). Also stored unchanged: zero-width space and word joiner inside words, Unicode tag characters, and one letter with 150 combining marks (names cap marks per letter, chat does not). Zero-width characters inside a link are caught (the folded copy drops them). Names are safe: an Alliance or player name loses the override.
- Impact: the links-and-contacts rule for chat (compliance C25, UK Online Safety Act; security audit 2026-11-20 S6) is passed with one pasted character, in the one place where strangers talk to 13-17 year olds. Stacked marks draw over neighbouring chat rows.
- Fix: before filtering and storing, remove U+202A-202E, U+2066-2069, U+200B, U+2060, U+FEFF, tag characters and other `\p{Cf}` except ZWJ/ZWNJ between letters of scripts that need them; cap combining marks per base letter as `sanitizeName` does; run the contact filter on the reversed text as well.
- The word filter is passed the same way (`words.mjs`): "you idiot" is stored as "you ✿✿✿✿✿"; backwards after U+202E it is stored unchanged, and so is "id\u200Biot" with a zero-width space inside the word; "whatsapp me" becomes "[contact removed]", backwards after U+202E it is stored unchanged.
- Not verified: rendering in the shipped game on a device (the browser bidi rule is standard; the probe checked what the server stores and returns).
- Dedupe: not in any list (searched "bidi", "202E", "zalgo", "zero-width", "combining"); S6 lists other dodges and names "no UTS #39 table" as its limit.

### API-3 (MEDIUM): three throwaway accounts hide any chat message

- Where: `server/core/moderation.ts:25` (`HIDE_AFTER_REPORTS = 3`), `:39-46` (a reporter only has to be in the same Alliance or Gang at the moment of the report), `:55-59` (three distinct reporters hide the message); `server/core/groves.ts:89-105` (anyone joins any Alliance).
- Reproduced (`alliance.mjs`): three accounts registered seconds earlier joined the Alliance, each reported one fresh message (`201`), left again. The message was then missing from the leader's and from the author's own chat, and listed in `hidden`. Budget: 30 reports an hour per account (`moderation` rule), so three accounts silence 30 messages an hour in any Alliance, and nothing counts against accounts whose reports staff dismiss.
- Impact: a censorship tool against any Alliance or any player, working until staff dismiss each report by hand (`resolveReport` 'dismiss'). Combined with API-6 the dismissals can be delayed at will.
- Fix: count only reporters who were members before the message was sent (or for N hours) and whose account has some age/play; exclude reporters with dismissed reports; never hide the message from its author without telling them.
- Dedupe: `docs/legal/ONLINE_SAFETY_UK.md:73` and `public/privacy.html` describe the auto-hide as a feature; no list records its abuse (searched "false report", "brigad", "HIDE_AFTER", "sock").

### API-4 (MEDIUM): Alliance browse sees only the 200 oldest Alliances

- Where: `server/core/groves.ts:65-74` (`listGroves`: asks the store for 200 rows, then drops full ones and keeps the 30 nearest in honor); `server/stores/pg/alliances.ts:22-25` (`… group by g.id order by g.created_at limit $2`); `server/stores/memory/alliances.ts:24-31` (insertion order, `slice(0, limit)`); `server/routes/social.ts:16-17` (no rate rule on list or create).
- Reproduced (`grovelist.mjs`): with 206 older one-member Alliances, a new Alliance "Honest Clan" is not in `GET /v1/groves` and not in `?q=o` (30 of the squatters are); only a search for its own name finds it. Creating the 200 took 1.6 s and 200 accounts (under the 300-an-hour registration limit of one address).
- Impact: (1) without any attacker, from the 201st Alliance on no new Alliance can be found by browsing, and once the first 200 are full (20 members each: 4,000 players) the browse list is empty for everyone; (2) an attacker who registers 200 accounts on launch day owns the list every new player sees, for as long as those accounts exist (dormant accounts go after 730 days).
- Fix: filter (not full, active recently) and order (activity, honor distance) in the query before the limit; drop Alliances with no member seen for N days from browse; a rate rule on `POST /v1/groves`.
- Dedupe: not in any list (searched "listGroves", "oldest", "alliance list/search/browse").

### API-5 (MEDIUM): no request or connection timeout

- Where: `server/app.ts:201-219` (the Fastify options set `bodyLimit`, `trustProxy`, `genReqId`, `ajv` only). Fastify 5.12.7 defaults (`node_modules/fastify/build/build-validation.js:26-30`): `connectionTimeout: 0`, `requestTimeout: 0` ("no limit"), `keepAliveTimeout: 72000`; `lib/server.js:339-341` writes them onto the Node server, replacing Node's own 300 s request timeout. Node's 60 s `headersTimeout` stays.
- Attack: open connections, send complete headers with a `Content-Length` and a few body bytes, then nothing. The rate-limit hook has already run (one hit each); the socket and its request stay until the client goes away. 3000 a minute per address are allowed.
- Reproduced (`slowloris.mjs`): an idle socket and half-sent headers are closed after 75 s with `408` (Node's header timeout). Complete headers with `Content-Length: 1000` and 12 body bytes, with and without a bearer token: still open after 150 s, when the probe gave up. 300 such requests opened at once from one address: none closed after 20 s, the server process held 327 file descriptors. That they are never closed is read from the source (`requestTimeout: 0`), not waited out.
- Impact: file-descriptor and memory exhaustion of an instance that players reach directly (`TRUST_PROXY=false` is a documented production setup, `server/main.ts:9`); behind a buffering proxy the proxy's own timeouts decide.
- Fix: `requestTimeout: 30_000` (above the game's largest upload deadline of 120 s only for the three large-body routes if needed), `connectionTimeout`, and `http.Server.maxConnections` or a per-address connection cap; say in `docs/SHIPPING.md` which proxy timeouts are assumed.
- Dedupe: not in any list (searched "requestTimeout", "slowloris", "connectionTimeout", "headersTimeout").

### API-6 (MEDIUM): staff queues can be filled; only the oldest 200 are shown

- Where: `server/core/moderation.ts:154-156` (`reports(status, 200)`), `server/stores/pg/alliances.ts:94-96` (`order by at limit`); `server/core/account.ts:98-100` (deletion requests, 200, oldest first, verified ones not first); `server/core/complaints.ts:29-31`; `server/routes/staff.ts:17-20,45-46` (one item per call, no bulk action); `server/core/moderation.ts:47-51` (a player report needs no tie to the target); `server/rateLimit.ts:88-89,104` and `server/app.ts:366-372` (`deletionRequest` 5/h and `complaint` 20/h per IPv4 address or IPv6 /64; only `register` also counts per /48).
- Attack: free accounts file `kind: 'player'` reports on any player id, 30 an hour each (300 new accounts an hour per address: 9,000 reports an hour); the complaint and deletion forms take 20 and 5 an hour per address, and each /64 of an IPv6 /48 (65,536 of them) has its own count.
- Reproduced (`queues.mjs`, `idor.mjs`): seven new accounts filed 210 reports on 31 player ids they had no tie to (30 each, the 31st `429`); a genuine report filed afterwards was in neither `GET /admin/v1/reports` (200 shown) nor `?status=all` (200 shown). One address gets 5 deletion requests an hour, but twelve /64s of one IPv6 /48 (presented through `X-Forwarded-For` behind `TRUST_PROXY=1`) got 60 deletion requests and 240 complaints accepted, none refused; a genuine complaint sent afterwards was not among the 200 the staff queue showed.
- Impact: reports of harassment, DSA/OSA complaints and verified account-deletion requests (30-day promise on `/account/delete`) sit behind junk that staff must close one request at a time.
- Fix: show verified deletion requests and reports with several distinct, older reporters first; bulk close by reporter, by address window or by age; cap open reports per reporter and per account age; count the no-token forms per /48 as `register` does; a metric and alert on queue length.
- Dedupe: not in any list (searched "flood", "queue", "bulk"). SEC-15 (per-/48 counting) was fixed for `register` only.

### API-7 (LOW-MEDIUM): Alliance names are not checked against reserved words

- Where: `server/core/groves.ts:79` → `server/core/identity.ts:34-40` (`chosenName`: shape, contact, word filter; no `isReservedName`). Player names: `server/core/names.ts:35`; Gang names: `server/core/squads.ts:48`.
- Reproduced (`alliance.mjs`): "Kagemura Support", "Moderator", "Admin Team", "System", "Kagemura Staff" → `201` as Alliance names; the same strings → `400 That name is reserved.` as player names and `400` as Gang names.
- Impact: an "official" looking Alliance in the browse list (see API-4: it can be made the first thing new players see) and in every member's chat header; a lever for phishing ("Kagemura Support: send your deletion code").
- Fix: apply `isReservedName` (and the look-alike fold) in `chosenName` or `createGrove`; staff rename for Alliances.
- Dedupe: not in any list (S5/SEC-06 are about player names).

### API-8 (LOW-MEDIUM): idempotent answers kept without any cap

- Where: `server/app.ts:297-314` (every 2xx answer to a write with an `Idempotency-Key` is stored), `server/stores/pg/index.ts:129-131` (`insert … body jsonb`), `server/migrations/0008_idempotency.sql` (no size or count limit), retention after 24 h (`server/core/retention.ts:52`). Only the two whole-village answers are trimmed (`VILLAGE_ANSWER_ROUTES`, backend A12).
- Measured (`chat.mjs`, `misc.mjs`): `PUT /v1/me/privacy` (no route rule) answers the whole friends view: 113 bytes with no friends, 1,656 with 8 (193 per friend, so about 19 KB at the 100-friend cap); 60 such writes with 60 new keys were all answered `200`. A command batch with a wrong `stateHash` answers 3.6 KB at Keep 1 (the economy correction), 30 a minute.
- Impact: one account with 100 friends can add about 240 × 19 KB = 4.6 MB a minute (6.6 GB a day) to `idempotency_keys`; 100 such accounts (each other's friends) across a few addresses add hundreds of GB a day before the first retention pass, on the same disk as the game's data.
- Fix: do not store answers above a few KB (store a "refetch" marker as for villages); cap rows per scope (drop the oldest); answer `PUT /v1/me/privacy` with the two settings only.
- Not verified: Postgres growth was computed, not measured.
- Dedupe: backend A12/A13 cover deletion and cross-route replay, not storage growth (searched "idempotency" with "cap|size|grow|storage").

### API-9 (LOW): the shared-replay lookup limit follows a caller-chosen header

- Where: `server/routes/growth.ts:32` (`open('GET', '/v1/replays/shared/:code', { rate: 'lookup' })`), `server/app.ts:350` (`who = token ? t:<sha256(token)> : ip`) and `:366` (`lookup` is not in the by-IP list).
- Effect: a caller without an account who adds a different `Authorization: Bearer <anything>` to each request gets a new `lookup` bucket each time; only the 3000-a-minute address limit remains. Codes are 10 letters from 31 (8 × 10^14), so guessing stays out of reach; what remains is view-count inflation and large answers at 100 times the intended rate.
- Reproduced (`queues.mjs`): without a token the 31st request in a minute is `429`; with a different random bearer token on each request, 200 requests in a row, none refused.
- Fix: key route rules of `open` routes by IP whenever the token is not a player's.

### API-10 (LOW): repeat pushes from one friend request or Gang invite

- Where: `server/core/friends.ts:241-247` (a new request pushes "… wants to be friends"), `:271-274` (cancel deletes it, no memory of it); `server/core/squads.ts:124-125` (the push is sent on every invite call, also when the invite already exists); `server/push/push.ts:94` (`maxPerDay`, 4 in `notifications.json`).
- Reproduced (`misc.mjs`): five request → cancel cycles gave five new request ids, all `sent`. Limits: `lookup` 30 a minute, 300 a day.
- Impact: anyone who can find a player can use up that player's four pushes a day (so "your village was raided" is dropped as `limit`) until the player blocks them; mild harassment.
- Fix: remember a cancelled request for its 14 days (no second push to the same player), push a Gang invite only when it is created.

### API-11 (LOW): response headers; Sentry path

- `GET /v1/me` answers with `content-type` only: no `Cache-Control: no-store` on answers that hold account data, no `X-Content-Type-Options: nosniff` anywhere (also `/admin/app.js`), no `Referrer-Policy` on the HTML pages (`misc.mjs`). Bearer-token requests are not stored by shared caches, so this is hardening.
- `server/app.ts:474` hands `req.url` to Sentry; `src/backend/analytics/sentryEnvelope.ts:48-50` drops the query only, so `/v1/players/code/KAGE-…` and `/v1/replays/shared/<code>` reach Sentry on a 5xx. Backend A30 redacted the same path in the request log (`redactUrl`). Source only.

## 4. Checked and found sound

- Body validation: per-content-type schemas cannot be skipped by an odd `Content-Type` in Fastify 5.12.7 (the validator and the parser use the same parsed media type); no coercion; `__proto__` body → 400; nested/odd types reach core checks that coerce with `String()`/`Number()` and clamp.
- gzip request bodies: bomb refused 413 in 5 ms, broken gzip 400.
- Staff API: token compared as SHA-256 with `timingSafeEqual`, every configured token compared; failures counted and limited 10/min/IP without locking out a correct token; guard runs before validation; `ADMIN_ALLOW_IPS` uses the routed path; `/admin` pages hold no data, CSP `default-src 'none'; script-src 'self'; frame-ancestors 'none'`, `no-store`; the page builds DOM with text nodes only (player names, report text, staff log details are never HTML); token in `sessionStorage`, sent as a header (no cookie, so no CSRF).
- Deletion and complaint pages: static templates, `lang` looked up with `Object.hasOwn`, support contact escaped, CSP with `frame-ancestors 'none'`, `no-store`.
- Sign-in: Apple/Google JWT (algorithms pinned to RS256/ES256, issuer, audience, expiry, `iat`), JWKS cached with one refetch per 5 minutes for unknown kids; a notification JWT cannot be used as an ID token or the reverse (`events` vs `sub`/`exp`); Game Center key URL pinned; nonce single-use.
- Linking: `POST /v1/links` refuses an identity already linked to another player (`409`), never moves it; `POST /v1/sessions` only adds a token for the linked player and tells the account; unlink keeps the caller's token; sign-out refuses the last key; rotation is confirmed on first use. No path lets one account take another's village by linking.
- Deletion: `DELETE /v1/me` deletes the token's own account only; the web form needs the one-time code (31^10) for `verified`; staff `delete` only for verified requests, `override` needs a note.
- Webhooks: Apple JWS chain to the pinned root, bundle and environment checked, `notificationUUID` stored (replay) and ordered by signed time; Google RTDN by OIDC audience and service account; refunds idempotent.
- Outbound calls: fixed Apple/Google hosts, deadline on headers and body; no client-supplied URL except the pinned Game Center key host.
- `device` ids that are prototype keys (`constructor`, `toString`) in a command batch: `200`, the answer just lacks `ackSeq`; no crash, nothing gained (the numbering is not a security boundary).
- Errors: malformed JSON and unknown routes answer generic JSON; 5xx bodies carry no detail.
- Object-level authorisation (`idor.mjs`, `delcode.mjs`): B answering a friend request addressed to C → `404`; B cancelling A's request → `204` and the request is still there; B removing the friendship of A and C → no effect; a friend request by id to a player who hides → `404`; B accepting C's Gang invite → `404`; inviting a non-friend → `404`; a non-member or a plain member taking Gang leadership → `404` / `403`; Gang chat for a non-member → `404`; duel ticket or challenge on a non-friend → `404`; reporting a message of another Alliance → `404`; another Alliance's chat is not readable without joining (joining is open: API-1); B deleting A's push token → nothing removed; A's deletion code with B's id → `verified=false`, with A's id → `true` once, then `false`, and the account is not deleted until staff act; staff routes without a token, with a player's token, by an encoded path, and a state-changing staff `POST` without a token → `401`. Donating across Alliances was read in the source only (`groves.ts:227`: the request must be in the caller's Alliance).
- Client address behind a proxy: with `TRUST_PROXY=1`, `X-Forwarded-For: 9.9.9.9, 1.2.3.4` counts as `1.2.3.4` (the entry the proxy added); a value the client puts in front is ignored; IPv6 is counted by /64. Production refuses `TRUST_PROXY=true` and an unset value (`config.ts:173-174`).
- One oddity, no finding: a push token registered by A can be registered again by B and then belongs to B's account (`PUT /v1/push/tokens`, one row per token). It needs A's device token, which other players never see.
- Not looked at (budget): `server/core/duels.ts`, `gangWars.ts`, `groveRaid.ts`, `referrals.ts`, `sharedReplays.ts` beyond their routes; the client in `src/backend/net/**` and `src/backend/platform/**`; a run with real sign-in providers (linking was read in the source and its existing test, `tests/backend/server/links.test.ts`); Postgres and Redis.

## 5. Already known, skipped

- Nonce optional until `SIGNIN_NONCE_REQUIRED=1` (backend A15, SEC-03, `checkConfig` warning).
- Look-alike player names across scripts (S5, SEC-06, partly open).
- Size caps outside a transaction (L1/SEC-13), deleted player's name in shared rows (SEC-14, N24-SEC-4).
- Anonymous `/v1/stats` flood (N24-SEC-1); registrations per /64 (SEC-15, fixed for `register`).
- Shared legacy `ADMIN_TOKEN` trusts `x-staff-name` (production warning in `checkConfig`).
- Chat rows kept for the account's lifetime (documented in `docs/store/PRIVACY.md:14`).
- Web game CSP, iOS token storage (SEC-10, SEC-11), device-held villages (SEC-01), late reports (SEC-04), X1 backdating.
- Leaderboard/matchmaking query cost (backend A19, A20).
