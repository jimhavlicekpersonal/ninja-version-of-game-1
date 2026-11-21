# SAV — Save data, progression integrity, client networking resilience

Audited commit `560ce7a` (HEAD), 2026-11-21. Read-only. `node_modules` is absent, so **no test was run**: every verdict below comes from reading the code (file:line given). Anything not read directly is marked "(inferred)". Earlier closure records were re-checked against code, not taken on trust.

## 1. Verdict table

| Item | Verdict | Evidence (file:line, read) |
|---|---|---|
| Atomic save write | PASS | One IndexedDB `readwrite` transaction does the revision check and the `put` together: `src/backend/persist/saveStore.ts:116-140` |
| Rolling backups of the last good saves + automatic fallback | FAIL | Only one `village` key. Backups exist only for damaged saves, adopted villages and restores (`saveStore.ts:44-52`, `controller.ts:129,232,634`). There is no "last good" copy, and a load that fails falls to a **new village** (`controller.ts:131-135`) |
| Schema validation on load | PASS | `deserialize` → `migrate` + `validateVillage` (`src/gameplay/sim/save.ts:250-260,321-428,430-435`) |
| Checksum / tamper vs corruption | PARTIAL | No checksum on the stored save. Export codes carry only FNV-1a (`save.ts:445-470`). Device villages are trusted-local by design; the server re-checks imports |
| Load repair vs replace | PARTIAL | Repairs exist for stats, training queue and tempers only (`save.ts:262-307`). Any other bad field (one NaN resource, an unknown building type, a research level over the cap) fails the load and the village is replaced (`controller.ts:122-135`). The damaged copy is not offered if it still fails (`controller.ts:611-626`) |
| Damaged save kept and offered back | PARTIAL | `backupDamaged(raw).catch(() => undefined)` and then a new village is saved over the old one (`controller.ts:129-134`). If the backup write fails (storage full), the damaged save is lost |
| Newer save stops the boot | PASS | `migrate` throws `NewerSaveError` (`save.ts:56`); `controller.ts:127` rethrows it; `main.ts:1076-1117` shows Update + "Copy save code"; tested in `tests/backend/persist/saveStore.test.ts:77` |
| Kill during write | PASS (code) / NEEDS-DEVICE | An IDB transaction commits whole or not at all. Durability under power loss or OS kill is not verified |
| Save on lifecycle events | PASS | `visibilitychange` hidden/visible, `pagehide` and Capacitor `pause` → `controller.save()` + `connection.flush()` (`src/main.ts:886-933`) |
| Write frequency / dirty check | PARTIAL | The 15 s autosave skips an unchanged village (`main.ts:869-880`). But every successful command and every finished timer writes the whole village immediately (`controller.ts:189,511`), without coalescing (`controller.ts:660-690`) |
| SAVE_VERSION migrations: fixture library | PARTIAL | `migration-full.test.ts` uses one synthetic v1 save plus a v14→v15 case. Inline saves exist for some versions (grep: v1,2,3,7,8,10,12,16-19,21,22); none for v4,5,6,9,11,13,14,15,20,23,24. No real exported saves are kept as fixtures under `tests/` |
| Default-safe new fields | PASS | Each step uses `?? default`; `repairStats` fills `STAT_KEYS` on every load (`save.ts:262-273`) |
| Version-bump guards (R-2) | PARTIAL | SIM_RULES: data fingerprint test (`tests/gameplay/battle/rules-version.test.ts:35-38`). SAVE_VERSION: only `toBe(24)` pins, no state-shape fingerprint. PROTOCOL_VERSION: no fingerprint; `tools/release/previous-client-contract.mjs:17-23` does nothing because `git tag` lists no `v*` tag |
| Two tabs / one writer per village | PASS | `SaveConflictError` + `takenOver` (`saveStore.ts:8-22`, `controller.ts:661,676`); tests `saveStore.test.ts:22-65` |
| Two devices offline then sync | PASS (code) / NEEDS-DEVICE | Commands numbered per device, server keeps `device_seqs`, refusals listed (`villageSync.ts:1-27,272-301`; `server/core/village.ts:198-208`) |
| Server-held vs device-held village | PASS (design) | Server corrections win (`villageSync.ts:253-258`). Device-held villages are trusted-local, as documented |
| IDB open failure / memory fallback | FAIL | The game starts a fresh village on the memory store and still goes online with `keepVillageOnServer: true` (`main.ts:171-185,288`). The warning waits until the tutorial ends (`main.ts:777-778`). See SAV-01 |
| Sign-out risk to local data | FAIL (partial) | `signOutDevice` swallows a failed flush and then drops the queue, the outbox and pending raids (`connection.ts:863,892-905`). See SAV-04 |
| Reinstall-and-restore | OWNER / NEEDS-DEVICE | A linked sign-in adopts the server village (`villageSync.ts:241-247`). Without a link, a reinstall loses the token. Linking is offered only in Settings (`hud.ts:1185-1198`); no prompt (inferred from grep) |
| iOS Safari 7-day eviction / Home Screen (F6) | PARTIAL / NEEDS-DEVICE | `storageKept()` + a weekly banner + Settings advice (`main.ts:187-200,779-790`); a Home Screen hint (`main.ts:791-800`). Eviction itself is not verified on a device |
| Android backup | PASS (design) | localStorage (token, queue) is excluded; the IDB save is backed up (`android/app/src/main/res/xml/data_extraction_rules.xml`, `backup_rules.xml`) |
| Clock: server-held villages | PASS | Command time is clamped to `[max(row.at, now−12h), now+2min]`; timer commands to `now−10min` (`server/core/village.ts:37,45,51,235`; `villageReplay.ts:94-95`) |
| Clock: device-held villages | OWNER | `SystemClock` (`sim/clock.ts:10-14`); trusted-local by design (closure #4 limit); import has an age cooldown (audit A2/E11) |
| MAX_BACKDATE_MS window X1 | OWNER (design) | Still open: `server/core/village.ts:45`. See SAV-12 |
| Time sync with server | PARTIAL | `HelloResponse.serverTime` is sent (`protocol.ts:268`, `server/core/identity.ts:25`) but **never read by the client** (grep). Alliance War phase uses the device clock (`controller.ts:241`) |
| NaN / Infinity / overflow | PASS | `Number.isFinite` on resources, seeds, trophies and timers (`save.ts:324-372`); the server checks `Number.isFinite(c.t)` (`village.ts:187`). The security audit's 23,156 hostile variants produced no non-finite value (closure record) |
| Tutorial skip / quit / replay | PASS | Step index saved, completion read from state, Skip with confirm, replay from Settings (`ui/tutorial.ts:42,149-199`, `settingsUi.ts:117`). The raid step cannot be done offline on a server-held village (`app.ts:76-83`), but Skip exists, so it is not a soft-lock |
| Idempotent grants | PASS | Purchases keyed `<store>:<transactionId>` and checked before a grant (`controller.ts:350-357,383`). Chests deduped by `state.net` (`connection.ts:1290-1320`); command `seq` unique per batch (`village.ts:191`) |
| Idempotency-Key semantics | PARTIAL | A new key per HTTP attempt (`httpAdapter.ts:244`), so a client retry is never deduped by key. See SAV-10 |
| Storage full during save | PARTIAL | IDB failure → `onSaveError` → toast at most once a minute (`main.ts:937-962`). The queue sets `storageProblem` (`villageSync.ts:155-171`). Gap: a damaged save plus a failed backup, see SAV-02 |
| Airplane mode mid-session | PASS (code) / NEEDS-DEVICE | `offline` event → status (`connection.ts:1008-1012`); raids refused on a server-held village with a message (`app.ts:76-83`); the outbox and queue are stored |
| Requests in flight during purchase | PASS | Intent fails → nothing charged; redeem fails → `PENDING`, the store transaction stays unfinished, retried 15 s→15 min (`controller.ts:331-344,377-385`, `main.ts:344-356`) |
| Battle report in flight | PARTIAL | Outbox + requeue from the battle log (`connection.ts:1386-1430`). Gap: scouting forfeits an unsent raid, see SAV-05 |
| Bounded timeouts | PARTIAL | 15 s for the whole exchange (`httpAdapter.ts:183,214-229`). The same value applies to every body size; uploads are uncompressed. See SAV-06 |
| Exponential backoff with jitter | PARTIAL | Alliance polling: exponential with jitter (`groveSource.ts:386-389`). `Connection`: doubling with no jitter, and a 60 s interval plus a 15 s flush ignore it (`connection.ts:998-1003,1166-1171`). See SAV-07 |
| Circuit breaker / retry storm | FAIL | No breaker; every client retries at least once a minute and reconnects with a full sync within about 60 s of recovery (inferred load). See SAV-07 |
| Server down: degradation | PASS | Boot does not wait on the network (`main.ts:687`, `connection.ts:997`); "No connection" pill + "Connect now" (`hud.ts:817,952-958`) |
| High latency / packet loss | NEEDS-DEVICE | Code reasoning in SAV-06 |
| PROTOCOL_VERSION / forced update | PASS | `426 version_mismatch` (`server/app.ts:254-264`, `MIN_PROTOCOL` 7 at `identity.ts:20`) → `incompatible` → "Update Kagemura" (`connection.ts:1137-1140`, `hud.ts:893,930`); tested (`tests/backend/net/connection.test.ts:100`, `villageSync.test.ts:62`) |
| Alliance polling (R04) | PASS (code) / NEEDS-DEVICE | 4 s / 20 s only while the screen is visible; paused when hidden; backoff to 60 s with jitter; no overlapping polls (`groveSource.ts:250-430`). The `Connection` intervals do not pause when hidden (SAV-07) |
| Long outage loses raid rewards (R02) | PARTIAL | `LATE_REPORT_MS` 72 h for `pvp` only (`server/core/pvp.ts:52,466`); later reports become practice with no message (P7-17 not taken). See SAV-11 |

## 2. Work items

### SAV-01 — If IndexedDB fails to open, a returning player silently gets a throwaway village that still goes online and can wipe the real village
- Severity: HIGH
- Status: FAIL
- Kind: CODE
- Compartment: integration
- Checklist refs: Checklist 2.1 atomic/fallback, 2.6 cloud sync; Masterclass 2 "never lose progress"
- Evidence (read):
  1. `openStorage` falls back to `MemorySaveStore` when `openGameDb` rejects or takes more than 5 s (`src/main.ts:171-185`, `src/backend/persist/idb.ts:13,22-55`). That timeout was added because some iOS versions never answer an IDB open.
  2. `GameController.start` on an empty memory store creates and saves a new village (`controller.ts:131-135`). The only warning, "this browser can't save your village", is wrapped in `afterTutorial` (`main.ts:777-778`). A fresh village has its tutorial undone, so a returning player sees the Sensei tutorial on an empty village and no explanation.
  3. The `Connection` is built anyway with `keepVillageOnServer: true` (`main.ts:288`). Its `VillageSync` reads its state from localStorage, which still works (`connection.ts:220-229`).
  4. Device-held village (a move refused with `cooldown` and retried after 24 h, `connection.ts:233-255`; or a player who never connected): `autoMoveVillage` → `enable('move')` imports **the fresh memory village** (`villageSync.ts:201-220`). Keep 1 passes every import check. The server now holds an empty village, and `stored.active = true` is persisted to localStorage.
  5. Next normal start, IDB works and the real village loads. `connect()` finds `stored.active` true, an empty queue and a different hash, so it calls `adopt(economyOf(server))` (`villageSync.ts:249-258`) → `GameController.adoptEconomy` replaces buildings and resources and saves **with no backup** (`controller.ts:214-228`). The real village can no longer be moved (the server already holds one).
  - (inferred) The whole chain was reasoned from code. A test is needed to confirm it. A server-held village self-heals (`connect` adopts the server economy into the memory village), but commands made before `connect` finishes are queued against the real server village.
- Fix:
  1. `main.ts` `openStorage`: return a reason (`'unavailable'` = no IndexedDB/private mode, `'timeout'|'error'` = the IDB exists but failed).
  2. On `'timeout'|'error'` when the device shows signs of a returning player (any `tk.` localStorage key, e.g. `tk.net.village:*`, `tk.persistPromptUntil`, or `tk.device.install`): do not call `GameController.start`. Show a blocking card "Your village couldn't be opened. Retry / Play a temporary village", and retry `openGameDb` with a longer timeout.
  3. On a memory store, construct `Connection` with `offline: true`, or pass a new option `readOnlyVillage: true` that disables `autoMoveVillage`, `VillageSync.record` and `connect()` adoption.
  4. Show the "can't save" banner regardless of tutorial state when the store is not persistent (`main.ts:777`).
  5. Defence in depth: `VillageSync.connect` should call `game.adoptVillage` (which keeps a backup) instead of `adopt` when the local village's Keep level is above the server's, and log a refused-sync event.
- Tests: `tests/backend/net/villageSync.test.ts` "a session on a memory store never imports or adopts". Build a `Connection` over a `MemorySaveStore` village with `keepVillageOnServer` and a `villageMoveRetryAt` in the past; assert `importVillage` is not called. Second case: a server village at Keep 1 with `stored.active` and a local village at Keep 8 → assert a backup exists (`listBackups().length === 1`) after `connect()`. Add `tests/presentation/dom/memory-fallback.test.ts`: the banner shows while `tutorial.done === false`.
- Done when: with IDB forced to time out, a returning player sees a Retry card, no import request is sent, and an injected Keep-1 server village never replaces a Keep-8 local village without a backup.
- Don't break: server owns online truth (corrections still win for a genuinely server-held village); one writer per village; offline play for poor connections (a genuinely new player on a private-mode browser can still play).

### SAV-02 — A damaged save is overwritten even when its backup could not be written
- Severity: MEDIUM
- Status: FAIL
- Kind: CODE
- Compartment: gameplay/sim (control) + backend/persist
- Checklist refs: Checklist 2.1 backups, 2.9 storage full
- Evidence (read): `controller.ts:122-135`: `await deps.store.backupDamaged(raw).catch(() => undefined)`, then `createNewVillage` + `controller.save()`. `IdbSaveStore.load` set `this.rev` from the damaged file (`saveStore.ts:110-114`), so the revision check passes and the new village replaces the only copy. `backupDamaged` is a separate `put` of the full 150-300 KB file (`saveStore.ts:144-155`). It is the write most likely to hit `QuotaExceededError`, while the tiny new village still fits. The same unchecked pattern appears in `adoptVillage` (`controller.ts:231-234`), where a failed backup makes every sync throw.
- Fix:
  1. In `GameController.start`, if `backupDamaged` rejects, do not save the new village. Start on an in-memory controller (pass a `MemorySaveStore` wrapper) and return `loadError` with a new `kept: false` flag.
  2. `main.ts`: on `kept === false`, show "Your save could not be read and could not be copied: free some space, then Retry", with "Copy save code" from the raw file (reuse the newer-save card at `main.ts:1093-1115`).
  3. Optionally write the backup and the new village in one IDB transaction (a new `SaveStore.replaceDamaged(raw, file)`), so the replace is all-or-nothing.
- Tests: `tests/gameplay/control/controller.test.ts` "a damaged save whose backup fails is not overwritten". Use a store whose `backupDamaged` rejects; assert that the stored slot still holds the damaged raw after `start` and that `loadError` is set.
- Done when: no code path writes over a stored save that has not been copied first.
- Don't break: one writer per village (revision check); a newer save still stops the boot.

### SAV-03 — No rolling "last good" saves; one bad field replaces the whole village
- Severity: MEDIUM
- Status: PARTIAL
- Kind: CODE
- Compartment: gameplay/sim + backend/persist
- Checklist refs: Checklist 2.1 rolling backups and automatic fallback; 2.3 schema validation
- Evidence (read): only the `village` key plus damaged/adopted copies (`saveStore.ts:44-52`). `validateVillage` refuses the village for one non-finite resource, an unknown building type, a level above `maxDefinedLevel`, a research level above the cap, or a collector mismatch (`save.ts:324-372`). A balance bundle or data change that lowers a cap, or a single runtime NaN, would turn every affected player's next load into a fresh village. `backups()` hides copies that still fail `deserialize` (`controller.ts:611-626`), so the player is offered nothing until a patch ships.
- Fix:
  1. `IdbSaveStore.save`: in the same transaction, copy the current value to `village-prev-1` (shift `-1`→`-2`) at most once per N minutes (e.g. 10) and on every app start, keeping 2-3 generations.
  2. `GameController.start`: when `deserialize` fails, try the generations newest first before creating a new village; report "restored from N minutes ago".
  3. `save.ts`: add `repairResources` (non-finite → 0, logged), `repairResearch` (clamp to the cap) and drop unknown building types other than the Keep, before `validateVillage`, as `repairTempers` already does. Keep hard failures for structural damage only (no Keep, buildings missing).
- Tests: `tests/gameplay/sim/save-repair.test.ts`: a save with `resources.coins = NaN` loads with 0 coins (not a throw); a research level of 99 is clamped. `tests/backend/persist/saveStore.test.ts`: after three saves 10 minutes apart, `village-prev-1` holds the previous file; a corrupted `village` falls back to it.
- Done when: a save with one invalid numeric field loads, and a corrupted primary falls back to a previous generation automatically.
- Don't break: SAVE_VERSION + migration (the repairs are load-time, no format change); damaged copies still kept; storage budget (Android Auto Backup 25 MB, F15).

### SAV-04 — "Sign out this device" can drop unsent actions and won raids
- Severity: MEDIUM
- Status: FAIL
- Kind: CODE
- Compartment: backend/net
- Checklist refs: Checklist 2.6 account linking / sign-out risk
- Evidence (read): `connection.ts:863` `await this.flush().catch(() => undefined)`, then `port.signOutDevice()`. On success, `signedOutHere` (`connection.ts:892-905`) runs `village.reset()` (the queue is emptied), `saveOutbox([])`, and turns every pending raid into practice (`rejected: 'signed_out'`). A flush that failed on `429 rate_limited`, `503 busy` or a timeout, while the small sign-out call then succeeds, loses the queued offline actions on the server's village and the loot and honor of unsent raids.
- Fix:
  1. In `signOutDevice`, after the flush, refuse with a clear error when `this.village?.pending > 0 || this.outbox().length > 0` ("N actions and M raids are still being sent; try again when the connection is better").
  2. HUD: show the pending counts in the sign-out confirm (`account.signOutDevice.*`).
- Tests: `tests/backend/net/connection.test.ts` "sign-out refuses while actions are unsent". The port's `sendCommands` throws `ServerError(503,'busy')`; assert `signOutDevice` rejects, `port.signOutDevice` is not called and the queue is intact.
- Done when: sign-out never drops a queued command or an outbox report.
- Don't break: server owns online truth; the `signOutPending` mark logic for lost answers.

### SAV-05 — Scouting on a poor connection forfeits a won raid whose report has not arrived
- Severity: MEDIUM
- Status: FAIL
- Kind: CODE + DESIGN
- Compartment: backend/net (+ presentation/ui `app.ts`)
- Checklist refs: Checklist networking "requests in flight during a battle report"; R02
- Evidence (read): `app.ts:99-103` calls `sendReportsBeforeMatch()`, which gives up after 8 s (`connection.ts:1375-1380`), then `port.match()`. On the server, `match` forfeits any started ticket older than `REPORT_GRACE_MS` (8 min) as a loss (honor + Attack Rating) (`server/core/pvp.ts:330-341`). The late report is then refused and becomes practice. On a connection where the larger report POST keeps timing out but the small `match` succeeds, a won raid turns into a forfeit.
- Fix:
  1. `App.scout`: if `connection.outbox()` still holds an `attack` item after `sendReportsBeforeMatch`, do not call `match`. Toast "Sending your last raid… (Retry)" and keep the player on the village (practice and Trials stay available).
  2. Optionally: a server `match` answer `409 report_pending` instead of a silent forfeit while the client sends `X-Pending-Report: <ticket>`. That is a protocol addition, so it needs `docs/PROTOCOL.md` + a contract test.
- Tests: `tests/backend/net/connection.test.ts` / an `app` test: outbox holds a started attack, `submitAttack` hangs past 8 s; assert `port.match` is not called and the report is still queued.
- Done when: no online match is requested while a started raid's report is still in the outbox.
- Don't break: ledger audit A1 (hiding a lost raid must still lose honor: the server-side forfeit stays); protocol changes in docs/PROTOCOL.md with contract tests.

### SAV-06 — One 15 s timeout for every body; large uploads never complete on slow links
- Severity: MEDIUM
- Status: PARTIAL
- Kind: CODE
- Compartment: backend/net
- Checklist refs: Checklist networking "high latency 500 ms+, packet loss"; worldwide target (cheap phones, 2G/3G)
- Evidence (read): `httpAdapter.ts:183` `timeoutMs = 15_000` for every exchange, body included (`214-229`). Request bodies are plain `JSON.stringify` (`httpAdapter.ts:248`); only responses are compressed (`src/backend/CLAUDE.md`, `COMPRESS_MIN_BYTES`). Large writes: `importVillage(serialize(...))` (the whole village, 150-300 KB at late Keeps per `main.ts:866-868`); `sendCommands` batches of up to 200 commands with up to 3 battle commands of up to 192 KB each (`server/core/village.ts:31-33,52-53`). At about 10-20 KB/s of real uplink (inferred, EDGE/poor 3G) these exceed 15 s every time. The queue then never drains (retried every 15 s, `connection.ts:1000`), and the village move is retried on every sync.
- Fix:
  1. `HttpServerAdapter.once`: timeout = `max(timeoutMs, timeoutMs + bodyBytes / MIN_UPLINK_BYTES_PER_S)` (e.g. 8 KB/s), capped at 120 s.
  2. Gzip request bodies over 1 KB with `CompressionStream` where available (`content-encoding: gzip`). The server needs a decompression hook with the body limit applied after inflation (a protocol addition: `docs/PROTOCOL.md`, a hello feature `request-gzip`, contract test).
  3. `VillageSync.run`: send battle commands in batches of their own (one per request) so one large trial never blocks 199 small commands.
- Tests: `tests/backend/net/httpAdapter.test.ts`: a 300 KB POST through a fake fetch that delivers at 10 KB/s succeeds; a GET still times out at 15 s. `villageSync.test.ts`: a queue with one `trialEnd` and 50 `collect` sends two requests.
- Done when: a 300 KB import completes on a throttled 10 KB/s link (Playwright network throttling, NEEDS-DEVICE confirmation on a real 3G phone).
- Don't break: protocol changes in docs/PROTOCOL.md with contract tests; idempotent replay by `seq`; the battle-command budget (6/min).

### SAV-07 — Connection retry has no jitter, no breaker and no background pause; an outage or recovery causes retry storms
- Severity: MEDIUM
- Status: FAIL
- Kind: CODE
- Compartment: backend/net
- Checklist refs: Checklist networking "exponential backoff with jitter, circuit breaker, thundering herd"; R04 (cost)
- Evidence (read):
  - `start()` installs `setInterval(sync, 60_000)`, `setInterval(uploadBase, 120_000)` and `setInterval(village.flush, 15_000)` (`connection.ts:998-1003`). `sync()` checks only `incompatible`/`suspended` (`connection.ts:1056-1064`), so the exponential `retryDelay` (15 s → 5 min, `connection.ts:1166-1171`) is overridden: an offline client still tries `hello` every 60 s.
  - Each `hello` is a GET retried twice more (600/1200 ms, `httpAdapter.ts:184-185,302-304`), so about 3 requests per minute per client during an outage, plus flushes every 15 s whenever the queue is non-empty.
  - No jitter on `retryDelay`; `syncSoon` resets it to 15 s on every `online`/`visibilitychange` (`connection.ts:1033-1044`).
  - After recovery every open client runs a full `runSync` within about 60 s: `hello`, balance, `me`, age, rules, terms, `uploadBase`, `getVillage` (whole file), `autoMove`, defenses, donations, chests, gang chests, flush, `me` (`connection.ts:1066-1131`). That is about 12-15 requests each (inferred load).
  - None of the three intervals checks `document.visibilityState`. A hidden web tab keeps syncing at least once a minute and uploading the whole device base every 2 minutes (`connection.ts:1205-1214`, no change check on the client).
- Fix:
  1. `Connection.sync`: return early while `retryTimer` is pending (the interval becomes a no-op during backoff); apply full jitter (`delay * (0.5 + Math.random())`) to `retryDelay` and to the first reconnect after `online`.
  2. A breaker: after N consecutive network failures, stop the 15 s `village.flush` interval until the next successful `hello`.
  3. Pause all three intervals while `document.visibilityState === 'hidden'` (keep the `goingAway` flush) and resume through `syncSoon`.
  4. `uploadBase`: skip when the canonical hash of the base equals the last uploaded one (kept in memory).
  5. Server (optional): `hello` may return `retryAfterMs` under load; the client honours it.
- Tests: `tests/backend/net/connection.test.ts` with fake timers: (a) with the server failing, over 10 minutes `hello` is called fewer than 8 times; (b) two connections started at the same instant schedule their retries at different times; (c) with `document.hidden = true`, no request is made over 5 minutes; (d) an unchanged base is uploaded once.
- Done when: during a simulated 30-minute outage one client makes at most about 15 requests (today about 90+), and a hidden tab makes none.
- Don't break: offline play for poor connections (the queue is still sent on resume and on `pagehide`); GLOBAL-010 (flush on going away).

### SAV-08 — No guard forces SAVE_VERSION or PROTOCOL_VERSION bumps; the previous-client contract check is inert
- Severity: MEDIUM
- Status: PARTIAL
- Kind: CODE + OWNER
- Compartment: integration (tests) + ops
- Checklist refs: earlier audit "R-2 version bump guard"; Checklist 2.4 migrations
- Evidence (read): SIM_RULES has a data fingerprint (`tests/gameplay/battle/rules-version.test.ts:35-38`); it covers data only, and battle code is guarded indirectly by `aura-cache`. SAVE_VERSION is only pinned with `toBe(24)` (`migration-full.test.ts:26` and four others). Nothing hashes the `VillageState` shape (the keys of `createNewVillage`), so a new stored field without a bump passes CI. PROTOCOL_VERSION has no fingerprint of `protocol.ts` types or `Routes`. `tools/release/previous-client-contract.mjs:17-23` exits 0 when no `v*` tag exists, and `git tag` here is empty (release tags are P7-17..20, "not taken"). It runs in `deploy.yml:137` and `server.yml:146`, so it currently checks nothing.
- Fix:
  1. `tests/gameplay/sim/save-shape.test.ts`: a recursive key-path fingerprint of `createNewVillage(t, data)` plus a fully populated fixture village; the expected value sits next to `SAVE_VERSION` with a comment "bump SAVE_VERSION + add a migration step".
  2. `tests/backend/net/protocol-shape.test.ts`: fingerprint `Object.values(Routes)`, `ERROR_CODES` and the `ClientHeaders` names; expected value next to `PROTOCOL_VERSION`.
  3. Owner/ops: tag the first public release `v1.0.0` so `previous-client-contract.mjs` has a baseline; make the script fail (not skip) in the release job when no tag exists after the first release.
- Tests: the two fingerprint tests themselves; changing a stored field locally must make them fail.
- Done when: adding a field to `VillageState` or a route to `Routes` fails CI until the version (or the pinned fingerprint, with a note) is updated, and a `v*` tag exists.
- Don't break: SAVE_VERSION bump + migration; protocol changes in docs/PROTOCOL.md with contract tests.

### SAV-09 — Migration tests lack a real-save fixture for each version
- Severity: MEDIUM
- Status: PARTIAL
- Kind: CODE
- Compartment: gameplay/sim (tests)
- Checklist refs: Checklist 2.4 "library of real saves from every version run in CI"
- Evidence (read/grep): `tests/gameplay/sim/migration-full.test.ts` has one synthetic v1 save (5 buildings) and a v14→v15 case. Grep of `version: N` in `tests/` finds inline saves for some versions only. No v4, v5, v6, v9, v11, v13, v14 (as a whole save), v15, v20, v23 or v24 village, and no late-game village (Keep 12-15, full logs, purchases, Alliance, stipend, pass). The public web build has been deployed (`deploy.yml`), so real older saves likely exist on players' devices (inferred).
- Fix:
  1. Add `tests/fixtures/saves/v<N>-<desc>.json`, one per SAVE_VERSION 1..24. Where git history allows, generate each by checking out the commit that introduced that version and exporting a scripted mid/late-game village (`tools/saves/make-fixture.ts`). Always include one late-game village at the current version.
  2. `tests/gameplay/sim/save-fixtures.test.ts`: every fixture `deserialize`s, `validateVillage` returns `[]`, `computeOfflineProgress` for 24 h does not throw, `serialize→deserialize` round-trips, and the resources and Keep level are not lower than the fixture's.
  3. Policy: each SAVE_VERSION bump adds the fixture for the version it leaves.
- Tests: as above (they must fail if a migration step is deleted).
- Done when: 24+ fixtures load in CI.
- Don't break: never drop progress; saves migrate.

### SAV-10 — Idempotency-Key is regenerated on every attempt, so it never dedupes a client retry
- Severity: LOW
- Status: PARTIAL
- Kind: CODE + DOCS
- Compartment: backend/net
- Checklist refs: Checklist 2.10 idempotent grants
- Evidence (read): `newKey()` is called inside `exchange` for every non-GET request (`httpAdapter.ts:244`). Writes are not retried by the adapter (`httpAdapter.ts:302`); higher-level retries (`reportDuel` loop `connection.ts:414-422`, outbox flushes, `deliverUnfinished`) each mint a new key. `docs/PROTOCOL.md:39` says "a fresh id per action". Safety today comes from domain ids (ticket `response`, command `seq`, store transaction id), so no double grant was found. But non-domain writes (chat post, friend request, purchase intent → a cap reservation held 30 min) are duplicated when an answer is lost.
- Fix:
  1. Let `HttpServerAdapter` take an optional `idempotencyKey` per call; the outbox item, `purchaseVerifier.intent` and chat send create one key per action and reuse it on retry (`OutboxItem.key`, stored).
  2. Correct `docs/PROTOCOL.md:39` to describe the behaviour.
- Tests: `tests/backend/net/httpAdapter.test.ts`: two attempts of the same outbox item carry the same `Idempotency-Key`.
- Done when: a lost answer to a purchase intent retried by the game does not reserve the cap twice.
- Don't break: server `422 idempotency_mismatch` (same key, same body only).

### SAV-11 — R02 residue: raid reports later than 72 h, and all war/duel reports after 1 h, become practice with no message
- Severity: LOW
- Status: PARTIAL
- Kind: CODE + DESIGN
- Compartment: server + presentation/ui
- Checklist refs: R02; Checklist networking "long outage"
- Evidence (read): `server/core/pvp.ts:41,52,466`: `TICKET_TTL_MS` 1 h, `LATE_REPORT_MS` 72 h for `kind === 'pvp'` only (wars end on their own clock, `groveRaid.ts:218`, `gangWars.ts:314`). The client turns a non-retryable refusal into practice (`connection.ts:1421-1425`). The player-facing late-report message is listed "not taken" (`WORLDWIDE_AUDIT.md:1202`, P7-17..20).
- Fix:
  1. `rejectedWhy` (`main.ts:166-169`) already has `expired`: make sure the toast or News entry names the raid, its date and "sent too late (after 72 h)". Add `news.refused.lateRaid` to `locales/en/ui.json`.
  2. Owner decision: document the 72 h promise in the help text and store listing (R01/R02 offline promise).
- Tests: `tests/presentation/dom/`: a settled `expired` raid shows the late-report line in News.
- Done when: every raid that becomes practice from lateness is told to the player once, with the reason.
- Don't break: server owns online truth; honesty (no fake loot).

### SAV-12 — X1: windowed claims may be dated up to 12 h back while the village is idle (owner decision)
- Severity: LOW
- Status: OWNER
- Kind: DESIGN
- Compartment: server
- Checklist refs: Checklist "clock manipulation"; security audit X1
- Evidence (read): `server/core/village.ts:45` (`MAX_BACKDATE_MS` 12 h), floor `max(row.at, now−12h)`, with timer commands at `now−10min` (`village.ts:51`, `villageReplay.ts:94-95`). Daily chest, calendar, tasks, Bounty Hunt, rematch and drill use the claimed time. The gain is bounded: at most one earlier local day's chest or calendar step after a missed day; none of these is sold (CLAUDE.md money rules). For a truly missed day there is no device-side evidence that separates honest offline play from a backdated claim. Per-device last contact (`device_seqs`, `player_tokens.last_used_at`) only helps when the device was online during the window (reasoned).
- Fix (owner picks one):
  1. Accept and record it as a known limitation, signed off by the owner.
  2. Narrow it for windowed claims only: floor = `max(row.at, now−12h, lastAuthenticatedRequest(token) − CLOCK_SKEW_MS)` using `player_tokens.last_used_at` read before this request updates it. That stops backdating behind a session the device was demonstrably online for, and keeps honest offline across midnight.
  3. Cap windowed claims to the server's current or previous local day only when the batch also contains a command dated after midnight.
- Tests (option 2): `tests/backend/server/x1-window.test.ts`: a token used at 20:00 day N−1, a chest claim dated 21:00 day N−1 sent on day N is accepted; a claim dated 19:00 is refused.
- Done when: the owner's decision is recorded in `docs/DECISIONS.md` and, if option 2, the test passes.
- Don't break: offline play for poor connections; server owns online truth.

### SAV-13 — No client-server time sync: serverTime is ignored and war phases use the device clock
- Severity: LOW
- Status: PARTIAL
- Kind: CODE + DOCS
- Compartment: backend/net + gameplay/control
- Checklist refs: Checklist networking "time sync between client and server"
- Evidence (read/grep): `HelloResponse.serverTime` is documented "so all players agree on Grove Raid times" (`protocol.ts:267-268`) but is read nowhere in `src/` (grep: only the type and the server). `checkPrepOffer`/`raidPhase(now)` use `deps.clock.now()` (`controller.ts:236-250`); timers and task days follow the device clock. A device whose clock is off by more than 2 minutes gets repeated corrections (server clamp at `village.ts:37`) and wrong war countdowns.
- Fix:
  1. `Connection.runSync`: keep `clockOffsetMs = server.serverTime − (t0 + rtt/2)` (median of the last 3).
  2. Show a Settings/HUD note when `|offset| > 5 min` ("Your device clock is N min off; online timers follow the server").
  3. Use `now + offset` for Alliance/Gang War countdowns in the HUD only (the sim's `Clock` stays the injected clock; for a server-held village `main.ts` may wrap `OffsetClock` with the offset).
  4. Or correct the protocol doc comment.
- Tests: `tests/backend/net/connection.test.ts`: a hello with `serverTime` 10 min ahead sets `clockOffsetMs ≈ 600000` and `clockWarning`.
- Done when: a device 10 min off shows the warning and correct war countdowns.
- Don't break: battles replay exactly (the offset never enters the sim's battle code); sim purity (`Date.now()` stays out of `sim/`).

### SAV-14 — Every command writes the whole village, uncoalesced
- Severity: LOW
- Status: NEEDS-DEVICE
- Kind: CODE
- Compartment: gameplay/control
- Checklist refs: Checklist 2.2 write frequency / dirty check
- Evidence (read): `dispatch` → `void this.save()` (`controller.ts:189`); `tick` → save (`controller.ts:511`); `persist` runs `serialize` (`structuredClone`) at once and chains one IDB `put` per call (`controller.ts:660-690`, `save.ts:46-48`). Ten quick taps mean ten clones and ten 150-300 KB writes. The autosave dirty check (`main.ts:869-880`) does not cover these.
- Fix: in `persist()`, if a save is already queued and not started, replace its file instead of chaining another (keep the `awaitingSave` receipt bookkeeping: the merged save covers both). Clone lazily when the chain reaches it.
- Tests: `tests/gameplay/control/controller.test.ts`: 10 dispatches within one microtask produce at most 2 `store.save` calls, and receipts awaiting save are finished after the last.
- Done when: rapid commands produce at most two writes per burst; frame-time impact measured on a cheap Android (NEEDS-DEVICE).
- Don't break: GLOBAL-003 (a receipt is finished only after a save containing it landed); the save-on-hide ordering.

### SAV-15 — Reinstall, eviction and restore paths are unverified, and linking is never prompted
- Severity: LOW (code) / owner decision
- Status: OWNER / NEEDS-DEVICE
- Kind: OWNER + DEVICE
- Compartment: presentation/ui + ops
- Checklist refs: Checklist 2.6 reinstall-and-restore, iOS 7-day eviction (F6); R08
- Evidence (read): a linked sign-in adopts the server village on a new device (`villageSync.ts:241-247`, `connection.ts:985-1000`). Linking lives only in Settings → Account (`hud.ts:1185-1198`); nothing prompts after a purchase or a Keep milestone (grep, inferred). Android: localStorage excluded from backup, so a restored phone registers a new account and imports the restored village under it (`data_extraction_rules.xml`; import provenance holds the purchase value back, `server/core/villageImport.ts`). iOS has no Keychain token (security audit F3). Web Safari eviction: banner + advice only (`main.ts:779-790`).
- Fix:
  1. Owner: decide whether to prompt "Link a sign-in to keep your village" once after the first purchase and at Keep 4, worded without pressure, adults and minors alike.
  2. Device test plan below.
- Tests (device): (a) iOS app: play, no link, delete and reinstall → expect a fresh village; with a link → sign in restores the village and purchases. (b) Android: Google backup → new phone → document which account and village appear. (c) Safari tab unused 8 days, not on the Home Screen → document the eviction and the banner. (d) Home Screen PWA vs Safari: the separate village hint shows.
- Done when: results are recorded in `docs/store/WORLDWIDE_AUDIT.md` with device and OS versions.
- Don't break: privacy (no data before opt-in); minors protections; honesty.

### SAV-16 — Device checks for save durability and network handoff
- Severity: LOW
- Status: NEEDS-DEVICE
- Kind: DEVICE
- Compartment: ops
- Checklist refs: Checklist 2.1 kill during write, networking airplane/handoff/latency
- Evidence: the code paths are sound on reading (IDB transaction `saveStore.ts:116-140`, reconnecting handle `idb.ts:57-150`, lifecycle `main.ts:886-933`, outbox and queue in localStorage), but nothing was run on hardware.
- Tests (device, each on Pixel 7, a cheap Android at 2-3 GB and an iPhone):
  1. Force-stop during a storm of actions (Collect all + 5 upgrades) → reopen: the village equals the last save or the one before it, never damaged.
  2. Fill device storage to under 50 MB → play → expect the "could not be saved" toast and no lost save after freeing space.
  3. Airplane mode during a raid's last 10 s → finish → reconnect after 10 min → raid settles with loot.
  4. Wi-Fi→cellular handoff during a purchase confirm → purchase delivered exactly once.
  5. 500 ms RTT + 5% loss (Android emulator network profile or a hardware link conditioner) → Alliance chat, village import, scouting and report times recorded.
  6. iOS app backgrounded 10 min → resume → saves land (IDB reconnection).
- Done when: the results table is in the audit file.
- Don't break: n/a.

## 3. Verified sound

- **Revision-checked atomic save**: the read and the write share one IDB transaction, and an abort reports `SaveConflictError` (`src/backend/persist/saveStore.ts:116-140`); `takenOver` stops all further writes (`controller.ts:661,676`); tests `tests/backend/persist/saveStore.test.ts:22-65`.
- **Newer save never overwritten**: `save.ts:56`, `controller.ts:127`, boot error card with Update and Copy save code (`main.ts:1076-1117`); for a server village from a newer build, `incompatible` without adoption (`connection.ts:1144-1148`, `villageSync.test.ts:62-66`).
- **IDB connection loss (iOS)**: reconnecting handle, a one-time retry of `transact`, a retried save via `reconnected` (`idb.ts:57-196`, `main.ts:943-951`); a 5 s open timeout so boot never hangs (`idb.ts:13`). The fallback behaviour itself is SAV-01.
- **Migrations are additive and default-safe** v1→v24 with per-load repairs (`save.ts:52-260`); a v1 save loads and plays 24 h offline (`migration-full.test.ts:6-47`).
- **Lifecycle saves**: hidden, `pagehide`, Capacitor `pause`, visible (`main.ts:886-933`); the 15 s autosave with a dirty check and a 2-minute floor (`main.ts:869-880`).
- **Purchase delivery is durable and idempotent**: intent before charge, release on cancel/pending, redeem → grant → finish only after a landed save (`awaitingSave`), transaction ids unique (`controller.ts:327-418`); unfinished receipts retried 15 s→15 min with backoff (`main.ts:344-356`).
- **Command queue integrity**: one `seq` per command, device-scoped numbering, a repeated `seq` refuses the whole batch (`server/core/village.ts:181-208`); a failed queue write is surfaced (`storageProblem`) and pushed to the server (`villageSync.ts:155-171`).
- **Server clock authority for held villages**: commands clamped to 12 h back / 2 min ahead and timers to 10 min back (`server/core/village.ts:37-51,235`); battle start times believed only within 600 s (closure #4).
- **Bounded HTTP**: the whole exchange (headers, body, JSON) under a 15 s deadline that rejects even if fetch ignores abort; a cut-off success is a retryable error, never "no data" (`httpAdapter.ts:214-283`); only GETs auto-retry, never on `rate_limited` (`httpAdapter.ts:302`).
- **Alliance polling (R04)**: serial polls, 4 s/20 s while visible, none while hidden, exponential backoff to 60 s with ±15% jitter, a slow answer stretches the wait (`social/groveSource.ts:250-430`).
- **Forced update**: server `426` below `MIN_PROTOCOL` 7 (`server/app.ts:254-264`), `supportedRules`/`minClientBuild` check (`net/versionCheck.ts:19-27`), the HUD "Update Kagemura" once per session plus a Settings button (`hud.ts:893,930`); tested (`tests/backend/net/connection.test.ts:100-109`).
- **Late raid reports** up to 72 h after ticket expiry; retention keeps those tickets (`server/core/pvp.ts:52,466`, `retention.ts:48-49`).
- **Non-finite values cannot persist**: `validateVillage` checks resources, timestamps, seeds, trophies and timers (`save.ts:324-372`); the server rejects a non-finite `t` (`village.ts:187`); the security audit fuzzed 23,156 command variants with no non-finite output (closure record 2026-11-20).
- **Tutorial cannot soft-lock**: completion is read from state, Skip (with confirm) on every step but the last, Replay in Settings (`ui/tutorial.ts:42-199`, `settingsUi.ts:117`).
- **Android backup excludes the token and queue** (no two phones becoming one online device) (`android/app/src/main/res/xml/data_extraction_rules.xml`).
- **Interrupted battles**: `pendingBattle` is kept in the save and settled or abandoned on the next launch (`controller.ts:548-595`); pending online attacks missing from the outbox are re-queued from the battle log (`connection.ts:1408`).
