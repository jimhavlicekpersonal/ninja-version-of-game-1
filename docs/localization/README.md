---
document_type: ai_implementation_inventory_and_plan
schema_version: 2
status: spanish_implemented_release_validation_recorded
primary_source_ref: 9d0eaa7bf245c752b66dfe3d9575738ac6fe4df9
checkout_source_ref: 2a4b2222a411bc12a83b3ff991455e714ec5e417
inventory: INVENTORY.json
generator: ../../tools/i18n/inventory.mjs
language_catalog: ../../locales/languages.json
translation_targets: 49
languages_including_english: 50
---

# Every player-visible surface: translation inventory and implementation plan

This is the entry point for an AI asked to localize Kagemura. Read `AGENTS.md`,
the applicable compartment brief, and `docs/store/WORLDWIDE_AUDIT.md` first.
The original inventory records every player-visible surface and its translation steps.
The subsequent implementation supplies Spanish across the first-party game,
public pages, notifications and native resources. Read
[SPANISH_IMPLEMENTATION.json](SPANISH_IMPLEMENTATION.json) for current surface
status and evidence, [SPANISH.md](SPANISH.md) for the packaging decision, and
[SPANISH_SIZE.json](SPANISH_SIZE.json) for measured bytes and explicit projections.
English, Spanish, Hindi and Brazilian Portuguese are selectable ([HINDI.md](HINDI.md) records the Hindi release and what it changed for non-Latin scripts, [PORTUGUESE.md](PORTUGUESE.md) the Portuguese one); the other 46 target languages remain unready.
Native device, storefront, publisher and legal gates are recorded separately.

Use this document for scope, ownership, sequencing and acceptance criteria.
Use [INVENTORY.json](INVENTORY.json) for individual source strings, expressions,
locations, English catalog keys, native resources and asset review targets.
Do not load the whole inventory into an AI context; query by path or surface.

## Baseline and what the numbers mean

The historical census compared checkout `2a4b222` with locally available
`origin/main` at `9d0eaa7` (17 commits newer). Spanish implementation first
fast-forwarded the working branch to `9d0eaa7`, preserving the inventory work.
`INVENTORY.json` remains that pinned historical discovery snapshot; it is not
a hash claim about the modified implementation. Current English catalogs,
`messages.sources.json`, `pages.sources.json`, `legacy-patterns.json`, and the
implementation record supply the active mappings. File hashes in the census
pin the original source contents. Source locations refer to each entry's baseline, not necessarily the
currently open file. Before implementation, integrate/rebase documentation onto
the intended current code and regenerate; do not copy obsolete English back
over newer main or assume the two branches have the same features.

| Baseline | English game-data keys | English UI keys | Filled non-English entries | Runtime consumption |
|---|---:|---:|---:|---|
| Checkout `2a4b222` | 648 | 0 | 0 | No locale worksheets consumed |
| Primary `9d0eaa7` | 659 | 99 | 0 | Partial `ui.json` layer; `data.json` not consumed |

**758 is not the complete translation workload.** It is the existing primary
English worksheet key count. The 99 UI keys cover only part of the interface;
the older audit's roughly 400 remaining UI strings is an estimate, not an
exhaustive count. Even game-data extraction misses visible fields: the three
rival leaders and their biographies in `names.json`, and resource display-name
maps, need explicit coverage. The generator records these source values too.

`INVENTORY.json.summary` gives exact census counts for the pinned snapshots.
Those are **source units, not unique production messages**: generated catalogs
and their originals repeat English; a sentence assembled from several literals
must become one message; one English word can need different translations in
different contexts. Optional staff/gallery content and ambiguous technical
tokens are tagged separately. Do not advertise the raw census total as a
translator-ready word/string count.

The baseline 80% activation threshold checked only the 99 extracted UI keys.
It does not establish coverage of the game, data, server responses, pages,
notifications or native wrappers. Completion must use the gates below.

The pinned census covers 289 primary source files and 270 checkout source
files. It records 8,750 source units across both snapshots, including 157
checkout-only units. These include technical/context-review candidates and
duplicate wording, so they must not be described as 8,750 required translations.

## Reading the machine inventory

Every unit has a stable `id`, source `path`, `surface`, `owner`, `kind`,
`disposition`, `text`, and occurrences with baseline/line/column/context.
Template parameters retain their source expressions as `arg1`, `arg2`, etc.;
replace these with meaningful, typed placeholder names during message design.
Markup text nodes are discovery fragments, not instructions to translate a
paragraph one node at a time. Native string syntax requires native-code review.

| Disposition | Required treatment |
|---|---|
| `catalog` | Existing English key. Verify the key is consumed and all locales contain a valid translation. Includes non-word entries such as the bot reply `:)`. |
| `catalog_equivalent` | Exact English matches an existing catalog value. Trace the meaning before reusing a key. For example resource Jade matching a generated-name part does not make that name-part key an appropriate resource label. |
| `translate` | Visible text or prose candidate. Confirm its consumer, combine fragments into a full message, then assign a stable English key and context. This tag alone is not proof of runtime reachability. |
| `review` | Ambiguous enum, one-word label, protocol value, publishing instruction or diagnostic. Trace the consumer; record translate/preserve/exclude and a reason. Do not send unresolved tokens to translators. |
| `format_or_symbol` | Check abbreviation, units, direction and accessible name; many glyphs need no word translation. |
| `preserve_brand` | Keep the Kagemura brand according to the glossary; translate surrounding description/subtitle where appropriate. |
| `moderation_list` | Build native-language moderation coverage; do not mechanically translate English offensive words. |

`files` records source hashes and exclusions; `translation_key_references`
records existing `t()` uses; `dynamic_display_calls` records display boundaries
including dynamic text and DOM/canvas calls. Trace their variables back to data,
user input, providers or server output: static English literals are not the
only way text reaches a player. `assets` lists fonts/images/audio for review.
`immutable_snapshot_files` lists archived simulation sources; localize their
presentation/history output without editing those snapshots.

The census deliberately errs toward retaining candidates. Type/module names,
known DOM classes/styles/selectors, paths, URLs, colors and machine identifiers
in proven contexts are excluded with reasons. Data comments/art descriptions
are excluded. Remaining operational diagnostics can be classified out after
tracing their consumers. This is a source inventory, not a claim that every
candidate is visible, that all images have passed visual inspection, or that
OS/store/owner-supplied text has been translated.

Examples of bounded queries from the repo root:

```sh
node --input-type=module -e "import {readFileSync} from 'node:fs'; const d=JSON.parse(readFileSync('docs/localization/INVENTORY.json')); console.log(d.summary)"
node --input-type=module -e "import {readFileSync} from 'node:fs'; const d=JSON.parse(readFileSync('docs/localization/INVENTORY.json')); console.log(d.units.filter(u=>u.path==='src/presentation/ui/friendsUi.ts'))"
node --input-type=module -e "import {readFileSync} from 'node:fs'; const d=JSON.parse(readFileSync('docs/localization/INVENTORY.json')); console.log(d.units.filter(u=>u.surface==='native_android'))"
```

## Complete surface register

Namespaces in this original table describe ownership boundaries. The implemented
catalogs use `boot`, `ui`, `data`, `messages`, and `pages`; `messages` contains
UI, error, system, native and legacy-display keys. Match current status by S01–S48
in SPANISH_IMPLEMENTATION.json. The table remains the complete scope register. All paths are
relative to the repository. A row is complete only when its primary-path units,
dynamic display inputs, relevant checkout-only differences, and tests are closed.

| ID | What a player sees, including less common states | Source / display consumers | Proposed namespace; lead owner |
|---|---|---|---|
| S01 | Initial page title, loading slogan/status, no-script and unsupported-browser text, slow-load/retry, failed startup, save rescue before the UI loads | `index.html`, `src/backend/pwa/boot.js`, `src/main.ts` (`bootStatus`, fallback cards) | `boot`; INTEGRATION + BACKEND |
| S02 | App/PWA name and description, home-screen installation copy and metadata, share previews if introduced | `public/manifest.webmanifest`, `index.html`, `capacitor.config.ts`, native resources | `metadata`; INTEGRATION + BACKEND |
| S03 | Resource names, amounts, capacities, empty/free labels, cost chips, abbreviations, level/housing/range/damage/HP/time units | `src/presentation/ui/chips.ts`, `format.ts`, `hud.ts`, `src/gameplay/data/economy.json` | `ui.resources`, `ui.units`; GUI |
| S04 | Main navigation, rail, toolbars, tabs, Settings, dialogs, confirmations, buttons, empty/loading/error/busy states, keyboard/camera instructions | `hud.ts`, `dom.ts`, `src/main.ts`, `src/app.ts` | `ui`; GUI + INTEGRATION |
| S05 | Building catalog, categories, locked requirements, construction, upgrades, finish/cancel, move/store/sell/clear, builders, walls/decor and obstacle details | `hud.ts`, `chips.ts`, `src/gameplay/data/buildings.json`, `hall.json`, `progression.json`, sim `village.ts` | `data` + `ui.build`; GUI + GAME THEORY |
| S06 | Warrior names/descriptions/skills, hero and Codex, role/tier labels, filters, unlock/Keep/Dojo requirements, stats/counters | `armyUi.ts`, `troops.json`, `roster.json`, `battle.json`, `progression.json` | `data` + `ui.army`; GUI + GAME THEORY |
| S07 | Training/research queues, Fill/top-up/skip/cancel, research lanes, dismiss, presets, default preset names and battle-ready validation | `armyUi.ts`, sim `army.ts`, `armyView.ts`, `research.ts`, `village.ts` | `ui.army`, `sim`; GUI + GAME THEORY |
| S08 | Tutorial/mentor dialog, skip/next/step labels and targets, age form/month names, explanations and validation, community-rules acknowledgement | `tutorial.ts`, `ageScreen.ts`, `communityRules.ts`, `hud.ts` | `ui.onboarding`, `legal.rulesShort`; GUI |
| S09 | Contextual objective chip and notifications question; stats/crash-report consent and explanations; play-break reminders | `hud.ts`, `src/main.ts`, sim `objective.ts`, backend analytics `share.ts`/prefs | `ui.objectives`, `ui.consent`; GUI + INTEGRATION |
| S10 | Scout/opponent card, Next fee, generated/practice/real-player disclosure, army setup and why Attack is blocked | `src/app.ts`, `battleHud.ts`, `BattleScene.ts`, sim `net.ts`, `matchmaking.ts` | `ui.scout`, `sim`; GUI + GAME THEORY |
| S11 | Battle instructions, troop cards, hero ability, smoke/sabotage, point labels/full/locked state, timers, surrender/replay controls, tooltip/aria text | `battleHud.ts`, `src/presentation/render/BattleScene.ts`, `battle.json` | `ui.battle`, `data`; GUI |
| S12 | Victory/defeat, stars/destruction, loot/overflow/league/event bonuses, pending/practice/settlement, close calls, replay-unavailable, battle/defense log and rematch | `battleHud.ts`, `hud.ts`, `src/app.ts`, sim `battle/closecall.ts`, `defense.ts`, `rematch.ts`, backend `connection.ts` | `ui.results`, `sim`, `errors`; GUI + GAME THEORY + BACKEND |
| S13 | Canvas building labels, floating resource amounts, timers, point markers, and any future text painted into assets | `VillageScene.ts`, `BattleScene.ts`, `fonts.ts`, `assets.ts`, art and icons | `ui.canvas`; GUI + ART |
| S14 | Shadow Trials tiers, layout/modifier names, rewards, first-clear/repeat/locked state and strategy details | `dailyUi.ts`, `src/app.ts`, `trials.json`, sim `trials.ts` | `data` + `ui.trials`; GUI + GAME THEORY |
| S15 | Daily chest, odds table, streak/repair, 28-day calendar, dates/day labels, goal/achievement titles and progress | `dailyUi.ts`, `hud.ts`, `daily.json`, `achievements.json`, sim `daily.ts`, `calendar.ts`, `achievements.ts` | `data` + `ui.daily`; GUI + GAME THEORY |
| S16 | Season Scroll, free/premium tracks, tasks, reward grants, season ending/expired states | `economyUi.ts`, `hud.ts`, `pass.json`, sim `pass.ts` | `data` + `ui.pass`; GUI + GAME THEORY |
| S17 | Events/schedules, Bounty Hunt/ladder, event reward rules, limited-time availability | `dailyUi.ts`, `hud.ts`, `events.json`, sim `events.ts`, `goalEvents.ts` | `data` + `ui.events`; GUI + GAME THEORY |
| S18 | Shop/products/offers, grant contents, premium/Keep looks, stipend, top-ups, discount/value text, age/spending limits and confirmation | `economyUi.ts`, `offers.json`, `store.json`, `cosmetics.json`, sim `monetization.ts`, `offers.ts`, `stipend.ts` | `data` + `ui.store`; GUI + GAME THEORY |
| S19 | Price unavailable/not sold, cancellation/pending/approval, failed/retried/unsaved delivery, restoration/refund/debt, storefront notices | backend `payments/*.ts`, `net/connection.ts`, control `controller.ts`, `server/core/purchases.ts`, `economyUi.ts`, native store bridges | `errors.purchase`, `ui.store`; BACKEND + GUI |
| S20 | Device-save failure/conflict/quota, earlier-village restoration, invalid/newer save, copying/loading/exporting codes, restart/update/offline notices | backend `persist/*.ts`, sim `save.ts`, `serverEconomy.ts`, control `controller.ts`, `hud.ts`, `src/main.ts` | `errors.storage`, `ui.saves`; BACKEND + GAME THEORY + GUI |
| S21 | Network status/timeout/retry, server-held migration/import holds and reasons, queued/refused commands, version mismatch and update instructions | backend `net/connection.ts`, `httpAdapter.ts`, `villageSync.ts`, `versionCheck.ts`, `server/core/village*.ts`, `hud.ts` | `errors.network`, `ui.online`; BACKEND + GUI |
| S22 | Sign-in/link/unlink/recovery, Game Center friend permissions, sign out other devices, account deletion/code and privacy settings | backend `platform/auth.ts`, `net/connection.ts`, `hud.ts`, native auth bridges; server `core/links.ts`, `identity/*`, `core/account.ts` | `errors.identity`, `ui.account`; BACKEND + GUI |
| S23 | Player-name shape/reserved/taken/too-short/mixed-script/cooldown/hold explanations, suggestions, deleted-player label, staff badge and formerly | sim `social/names.ts`, backend `net/names.ts`, server `core/names.ts`, `repo.ts`, UI `friendsUi.ts`/`hud.ts` | `errors.names`, `ui.identity`; BACKEND + GAME THEORY + GUI |
| S24 | Friends search, codes/QR/share invitation text, requests/suggestions/last-online, discovery/privacy, report/block/unblock/remove and platform friends | `friendsUi.ts`, backend `net/connection.ts`, `httpAdapter.ts`, server `core/friends.ts` | `ui.friends`, `system`; GUI + BACKEND |
| S25 | Friendly Duels/challenges, ready/expired/answered states, scores/results/rivalries and no-reward disclosures | `friendsUi.ts`, `src/app.ts`, server `core/duels.ts` | `ui.duels`, `system`, `errors`; GUI + BACKEND |
| S26 | Alliance find/create/join/leave, member roles/leader changes, troop requests/donations, free-text composer/help, bot labels and bot messages | `groveUi.ts`, backend `social/groveSource.ts`, `social.json`, `names.json`, sim `social/grove.ts`, server `core/groves.ts` | `data`, `ui.alliance`, `system`; GUI + GAME THEORY + BACKEND |
| S27 | Alliance War preparation/battle/results, enemy lists, eligibility, attacks left, chests and disclosures | `groveUi.ts`, sim `social/groveRaid.ts`, server `core/groveRaid.ts` | `ui.allianceWar`, `system`, `sim`; GUI + GAME THEORY + BACKEND |
| S28 | Gang creation/invites/leader/leave/cooldown, members, chat and troop gifts | `gangUi.ts`, server `core/squads.ts`, shared grove chat code | `ui.gang`, `system`, `errors`; GUI + BACKEND |
| S29 | Gang War queue/prep/day, solo/relay, targets/locks/carry-over, generated rivals, remaining attacks, outcomes/chests | `gangWarUi.ts`, `src/app.ts`, sim `social/gangWar.ts`, server `core/gangWars.ts` | `ui.gangWar`, `system`, `sim`; GUI + GAME THEORY + BACKEND |
| S30 | Honor/Power rankings, league labels, ranks, season resets, promoted/demoted/reward and computer-player labels | `hud.ts`, `ranks.json`, sim `ranks.ts`/`rating.ts`/`pass.ts`, server leaderboards/seasons | `data` + `ui.ranking`; GUI + GAME THEORY + BACKEND |
| S31 | Generated place/person/Alliance name parts, rival clan/leader names and bios; preserved actual player-chosen names | `names.json`, `social.json`, sim `rivals.ts`, `battle/basegen.ts`, `social/grove.ts`, UI scout/member cards | `data.names`; GAME THEORY + GUI |
| S32 | Fixed under-13 chat phrases, sent/incoming canned messages, contact-removal markers | backend `net/protocol.ts` (`PRESET_CHAT`), UI group chat, sim `social/grove.ts`, server `core/age.ts`/`groves.ts` | `chat`, `system`; BACKEND + GUI + GAME THEORY |
| S33 | Reporting reason labels/forms, block results, notices/inbox, mute/suspension/deletion/report-outcome/appeal text and dates | UI `groveUi.ts`, `friendsUi.ts`, `gangUi.ts`, `hud.ts`; server `core/moderation.ts`, `identity.ts`, `account.ts`, `admin.ts` | `moderation`, `errors`; BACKEND + GUI |
| S34 | Local notification title/body for construction, clearing, research, army, collectors, shield, daily chest, events and Alliance War | sim `reminders.ts`, `notifications.json`, backend `platform/reminders.ts`, `native.ts` | `notifications`; GAME THEORY + BACKEND |
| S35 | Server push for raids, donations, Alliance War, friends/duels, Gang invitations and all Gang War states | server `core/pvp.ts`, `groves.ts`, `groveRaid.ts`, `friends.ts`, `duels.ts`, `squads.ts`, `gangWars.ts`, `push/push.ts`, `core/pushTokens.ts` | `notifications`; BACKEND |
| S36 | Notification switch labels/quiet hours, OS channel name/description if created, permission pre-explanations and denied state | `notifications.json`, `hud.ts`, backend `platform/push.ts`, `native.ts`, native bridges | `ui.notifications`, `native`; GUI + BACKEND |
| S37 | Privacy/support/community/terms navigation, all page prose, fallback/unpublished notices, mail/link labels and configured facts | `public/privacy.html`, `support.html`, `community.html`, `terms.html`, `legal.js`, `legal-config.js`, `legal.css` | `legal`, `support`; BACKEND + GUI |
| S38 | Japanese commerce/prepaid notices, references from shop/support and storefront-specific disclosure | `public/tokushoho.html`, `shikin-kessai.html`, `economyUi.ts`, `docs/legal/JAPAN.md` | `legal.japan`; BACKEND + native legal reviewer |
| S39 | Standalone web deletion page, fields/help/validation, success/reference, network errors and accessibility | `server/accountPage.ts`, server `core/account.ts`, `app.ts` deletion route | `accountWeb`, `errors`; BACKEND |
| S40 | First-party native auth/billing/age messages and fallback errors, launch-storyboard text, app display labels | `ios/App/App/Tk*.swift`, `Info.plist`, `Base.lproj/*.storyboard`; `android/app/src/main/java/.../Tk*.java`, `res/values/strings.xml`, manifest | `native`; BACKEND |
| S41 | Store-controlled purchase/auth/permissions/age/Game Center sheets, product display names/descriptions and localized prices | StoreKit/Play/identity/Capacitor services; `ios/App/Products.storekit`; store console product entries | platform/console localization; BACKEND + owner |
| S42 | App Store/Play title, subtitle, short/long/promotional description, keywords, release notes, support/policy links and product copy | `docs/store/LISTING.md`, `REVIEW_NOTES.md`, `PRIVACY_POLICY.md`, app/store catalogs; external consoles | `store`; INTEGRATION + owner |
| S43 | Screenshot UI/captions, feature graphic/preview, icon/splash/logo/tagline, future landing/share metadata, image alt/title and audible wording | `tools/store/*`, `tools/brand/brand.mjs`, `docs/art/brand/*`, `public/art/manifest.json`, native assets, art/audio sources | `storeMedia`, `metadata`; ART + GUI + owner |
| S44 | Accessible names, descriptions, tooltips, placeholders, dialog names, live regions, canvas fallback description, directional glyphs | All UI/DOM/canvas/HTML/native rows; `aria-*`, `alt`, `title`, `placeholder`, `data-unset`, CSS `content` | same namespace as visible control; GUI + BACKEND |
| S45 | Saved battle notes, chat/system history, inbox, ledger reasons, exports and older-version replay descriptions | sim `types.ts`/`save.ts`, backend `villageSync.ts`, server `repo.ts`/`core/village.ts`, archived rules; `hud.ts` log/ledger consumers | versioned `system`/`sim` + legacy renderer; all runtime owners |
| S46 | Player-accessible sandbox/debug notices and time-skip/test-store explanations, including public query-string entry points | `src/main.ts`, `hud.ts`, `economyUi.ts` | `dev`; GUI + INTEGRATION; included wherever reachable in the distributed build |
| S47 | Developer-only gallery controls and authenticated staff/admin console | `tools/art-gallery/*`, `server/adminPage.ts`, `core/admin.ts` | `dev`, `staff`; separately recorded non-player scope, with its own localization policy |
| S48 | Browser form validation, framework-generated HTTP/schema errors, clipboard/share/install/permission sheets and third-party failure text | Native/browser APIs, Fastify/schema handling in `server/app.ts`, client `httpAdapter.ts`, DOM forms and provider bridges | platform output or `errors`/`native`; BACKEND + GUI; supply localized game fallbacks and verify the actual language |

S44 and S45 cut across every feature; they cannot be closed just by translating
one menu. The `art_audio`/`canvas` census includes technical candidates; inspect
actual visible text or voice before commissioning translated media. Current
audio is synthesized music/effects, not a recorded spoken script. A filename,
font manifest, or absence of `fillText` in one folder is not an image/voice audit.

## Ownership of displayed content

1. **Game-controlled wording:** translate every row's messages, labels and known
   system events. Preserve their meaning and behavior, including computer/practice
   disclosures, spending limits, refund/recovery status and eligibility rules.
2. **Player content:** preserve chosen usernames, user-named presets/groups,
   free-text chat and player/staff-authored notes as authored. Localize the
   surrounding UI and standardized decisions; do not silently machine-translate
   or rename identity. Unicode names already work independently of UI language.
3. **Stable identifiers:** never translate internal building/troop/resource IDs,
   protocol/message codes, friend/deletion/save codes, URLs, product IDs, hashes,
   metric names or simulation values. Render explicit localized label maps for
   exposed enums (roles, categories, statuses, reasons), not prettified raw IDs.
4. **Owner-provided copy:** `SERVER_NOTICE`, support/contact/legal configuration,
   arbitrary operator notices and remote pages need locale variants or an
   explicit visible-language policy. Proper names, addresses, emails, phone
   numbers and URLs remain factual; localize surrounding words and format dates/
   retention durations from structured values, not invented translations.
5. **Platform-controlled UI:** Apple/Google/OS sheets use their supported app/OS/
   storefront languages. Supply localized app resources/product metadata and
   verify them. Do not duplicate or translate store-returned formatted prices,
   change currency, or promise control of arbitrary provider error text. Map
   first-party bridge errors to known game messages with a localized fallback.

Use `isolateName` or `<bdi>` for names in translated sentences. Keep the pinned
grapheme implementation, NFC, width limits and script policy. Translation does
not require renaming players, relaxing validation, or treating all group-name
validators as identical: `server/core/squads.ts` currently has a separate Gang
name validator. Name errors and role labels still need localized messages.

## Ordered implementation steps

These are the original acceptance steps. Spanish implementation and its remaining
release gates are recorded in SPANISH_IMPLEMENTATION.json; L13 for all 49 targets
and L14 across every language/device are not claimed complete. Canonical English
in simulation/history remains immutable and is translated at owned display
boundaries through explicit keys or the legacy message registry.

All steps below are **TODO**. Existing partial implementation is useful input,
not completion of a step. Each step ends with a reviewable diff and its stated
evidence. Keep edits in the owners' lanes; INTEGRATION handles shared contracts.

### L01 — Reconcile the baseline and classify every census item

- Owner: INTEGRATION. Depends on: none. Sources: this document, inventory, root
  briefs, latest `origin/main`, original download/language prompt and audit closure.
- Reconcile primary/checkout-only differences against the intended current
  branch. Query every surface/file; trace `review` and dynamic display inputs.
  Classify visible text, context-dependent label, platform/owner/user content,
  immutable history, diagnostic or non-visible implementation detail.
- Produce a reviewed mapping keyed by inventory ID with disposition, reason,
  consumer, namespace/key, placeholder types, reachability (live/planned/debug/
  staff) and reviewer. Keep justified exclusions. Do not edit generated census
  classifications as a substitute for a persistent reviewed mapping.
- Evidence: every registered surface and census file is accounted for; no
  unresolved production candidates; source hashes match. Now derive the actual
  message/key/word workload per namespace. That exact number does not exist yet.
- Contracts/versioning: none. Do not implement gameplay as part of classification.

### L02 — Define complete message and catalog contracts

- Owners: INTEGRATION + GUI + BACKEND + GAME THEORY. Depends on: L01.
- Keep stable existing English keys. Define namespaces from the surface table;
  explicit enum labels; typed `MessageRef { key, params }` or equivalent;
  numeric/entity/name/date/duration parameter types; rich-text tokens; missing-key
  behavior; source/context/length/meaning metadata and version compatibility.
- Translate whole sentences, not concatenated English suffixes or HTML text
  nodes. ICU-lite currently supports basic placeholders/plurals, not full ICU:
  validate its grammar and branch/argument rules or deliberately extend it.
  Use structured rich-text tokens/components rather than translator-supplied HTML.
- Evidence: examples for Arabic plurals, Russian few/many, Turkish reordered
  placeholders, resources/entities, named players and linked support paragraphs.
  Reject unescaped markup and missing/extra/wrong-type parameters.
- Contracts: message/event/error types and namespace-loader contract; INTEGRATION
  coordinates callers. Determine protocol/save bumps before changing wire/state.

### L03 — Make extraction, sync, completeness and build output exhaustive

- Owners: INTEGRATION + localization tooling. Depends on: L02.
- Extend `tools/i18n` beyond selected data fields: cover rival `leader`/`bio`,
  resource-name maps, interface, error, system, notification, native/page/store
  sources, context and stable array IDs. Keep comments/art descriptions and
  actual moderation lists out of ordinary translation worksheets.
- Retain `old` translations when English changes. Validate ICU variables,
  selectors/branches and rich-text tokens, not just the current simple regex.
  Add per-namespace completeness, stale-key and explicit unchanged-English review.
- Build compact runtime maps of `text` values, not full `{en,text,old}` worksheets;
  generate readiness/coverage metadata without downloading every worksheet merely
  to populate Settings. Missing translations remain diagnosable; do not hide them
  behind a successful structural check or an 80% subset threshold.
- Evidence: every approved inventory mapping has an English key; every target
  worksheet is synchronized; completeness distinguishes empty from translated;
  per-language build/size output and placeholder failures are checked.
- Contracts/versioning: English/catalog/tool contracts; no save/protocol change
  just to store a device language. No new runtime dependency without measured need.

### L04 — Convert the complete client UI and accessibility layer

- Owner: GUI; INTEGRATION for `main.ts`/`app.ts`. Depends on: L02–L03.
- Convert S03–S30 and S44, including all success/failure/empty/locked/pending
  paths, accessible-only text, enums/maps, default generated labels and every
  player-accessible sandbox/debug path. Use `t()` everywhere approved wording originates.
  Treat the 99 existing keys as a starting subset.
- Replace English text used as selectors/identifiers with stable IDs/data
  attributes. Localize numbers, compact amounts, durations, ordinal/day/month/date
  formats, percent and units using the selected language. Preserve the existing
  Western-digit policy and actual game reset/time-zone mechanics.
- Evidence: an approved-inventory-to-key check, a hard-coded-text guard with
  reviewed exclusions, accessible-name assertions and pseudo-locale traversal.
  Inspect canvas labels separately from the DOM.
- Contracts/versioning: GUI callers/English sources; no economy or combat changes.

### L05 — Render all game-data names and descriptions by stable ID

- Owners: GUI + GAME THEORY. Depends on: L02–L03.
- Wire runtime `data` messages into buildings, troops, roles/skills/hero,
  progression, achievements/tasks, Trials, events, seasons, offers/looks,
  resources, reminders and generated-world names/biographies (S05–S18, S31).
- Keep authoritative `GameData`, IDs, RNG, source name-part positions, numeric
  stats, save hashes and battle/replay inputs language-independent. Add view
  lookup helpers instead of replacing the simulation's English data with a
  translated copy. Separate generated NPC labels from persisted player identity.
- Evidence: every approved data key has a display consumer; rival bios/leaders
  and resource maps are included; a locale switch changes text while fixed-seed
  battle outcomes, commands, economy hashes and player names stay identical.
- Contracts/versioning: presentation/data lookup; any changed sim/state contract
  needs GAME THEORY + INTEGRATION review before a SIM_RULES/save bump.

### L06 — Replace simulation English with message IDs and parameters

- Owner: GAME THEORY, with GUI/BACKEND consumers. Depends on: L02–L05.
- Cover command failures, quotes/requirements, close calls, practice/settlement
  notes, generated social replies, ledger reasons and notifications in control/
  sim. Keep the sim pure: no device locale, DOM, network or translation loader.
- Add typed event/reason payloads and render at the display boundary. Audit
  historic saves/replays/inboxes for stored English; design versioned renderers or
  safe known-template adapters. Preserve old records and immutable archived rules.
  Do not reinterpret arbitrary player text as a system message.
- Evidence: deterministic tests across locales plus fixtures of every known
  historical system-message shape; unknown legacy content has a documented,
  localized wrapper and fallback policy, never silent data loss. Full historical
  coverage is not claimed while known system English remains unhandled.
- Contracts/versioning: sim/control/types and persisted message shape. Assess
  SAVE_VERSION, replay compatibility and SIM_RULES explicitly; don't bump combat
  rules just because display wording changes.

### L07 — Localize server, social, identity and moderation output per reader

- Owner: BACKEND + GUI; INTEGRATION for protocol. Depends on: L02–L03, L06.
- Cover every player-facing `ApiError`/`ServerError`, validation/native fallback,
  registration/rename/lookup, migration, purchases, reports/appeals, notices,
  deleted-player labels, standardized chat/system events and ledger reasons.
  Generic codes such as `bad_request` have multiple meanings: add a precise
  message key and typed details rather than mapping the code to one sentence.
- Persist/send message IDs and parameters for system events; render in each
  reader's language. Send preset-chat IDs rather than an English phrase; support
  old senders/records. Preserve authored chat, names and staff free-text reasons.
  Define locale variants for operator `SERVER_NOTICE` and configured public copy.
- Keep machine codes, HTTP behavior, moderation decisions and account safeguards
  unchanged. Do not display arbitrary SDK/DB/server diagnostics as the only
  explanation; give a localized supported fallback and a diagnostic reference.
- Evidence: API and multi-reader tests, every error shape from the inventory,
  under-13 presets, notices/appeals and old/current client compatibility.
- Contracts/versioning: protocol/events/error/notice/preset shapes, persistence
  and adapters; numbered DB migration if needed, never edit applied migrations.
  Follow the agreed current/previous-version support window.

### L08 — Localize scheduled and server push notifications

- Owners: GAME THEORY + BACKEND. Depends on: L06–L07.
- Replace `Reminder.title/body` and `PushMessage.title/body` English construction
  with message references; format at delivery for the receiving device. Record
  locale on push registration, not merely the account; update on language change.
- Reschedule local notifications after language/time-zone changes without
  duplicate delivery. Handle a player with two devices in different languages,
  opt-out/quiet hours, offline scheduling and notification types/channels.
- Evidence: fixtures for every S34–S36 title/body/state, plurals/entity names,
  two-language devices, rescheduling and a real locked/background device check.
- Contracts/versioning: reminder/push token protocol and storage if locale is
  added; coordinate a protocol bump/migration and preserve old-client fallback.

### L09 — Finish first-frame language, switching, offline and native selection

- Owners: INTEGRATION + BACKEND + GUI. Depends on: L03–L05.
- Follow `docs/prompts/DOWNLOAD_AND_LANGUAGE.md` owner decisions: stored device
  choice, native per-app/device preference list and catalog aliases/script/region,
  then English; no IP/network language decision or blocking first-run picker.
  The language stays outside the village save.
- Localize boot/unsupported/retry/rescue screens before the module can fail.
  Declare actual supported codes in iOS localizations and Android locale config;
  verify WebView signals and OS changes on devices. Finish the non-blocking chip,
  searchable native-name picker and safe language-change/redraw behavior.
- All 50 text packs ship in native builds; the web requests only the selected
  pack until a switch, caches it offline and preserves unchanged files on updates.
  System fonts serve non-Latin scripts; keep the small bundled Latin fonts.
- Evidence: first-frame/slow-network/offline screenshots, failed-pack fallback,
  persisted choice and native per-app language checks. Expand matcher cases to
  the prompt's full matrix. Production readiness uses L14, not 80% of UI alone.
- Contracts/versioning: native/boot/loader/service-worker interfaces; no save
  migration solely for language; measure compressed bytes and first interaction.

### L10 — Localize standalone pages and configured factual content

- Owner: BACKEND + GUI, with legal/native-language reviewers. Depends on: L02–L03.
- Cover all S37–S39 text, navigation, metadata, accessibility, empty configuration
  markers, form errors/success, server replies, Japanese originals and linked
  routes. Pick language independently on a standalone first visit; preserve it
  through links/forms and set correct `lang`/`dir`.
- Reuse reviewed whole-paragraph rich text; keep links functional and escaped.
  Structure configurable durations/dates separately from names/addresses. Maintain
  factual content and document/acceptance versions; translations must not invent
  publisher details, legal promises, rights or response deadlines.
- Evidence: every page in every language, including no prior app visit, direct
  deletion URL, missing configuration, form failure/success, native legal frame
  and packaged offline pages. Localize game language without changing storefront-
  or market-based legal applicability.
- Contracts/versioning: page catalog/loader and acceptance metadata as needed;
  legal text reviewed before it is marked ready.

### L11 — Complete native and store-supplied wording

- Owner: BACKEND + owner of store configuration. Depends on: L03, L07, L09.
- Inventory every custom Swift/Java error and display resource, bridge it to
  message keys or localized native string resources, and preserve fallback
  parameters. Wire app-name/permission-purpose resources only where actually used.
- Populate product display names/descriptions in App Store Connect/Play for the
  real product IDs. Keep `Products.storekit` localized fixtures synchronized;
  they are not production console configuration. Preserve store-provided prices.
- Evidence: signed-install purchase/auth/age/permission/restore/pending/error
  flows under app/OS/storefront language combinations; Apple/Google wording is
  identified as provider-controlled, with game-controlled surrounding UI covered.
- Contracts/versioning: native bridge payloads coordinated with JS; code shipping
  follows native release rules. No new permission just to obtain a language.

### L12 — Complete media, installation and publishing surfaces

- Owners: ART + GUI + INTEGRATION + store owner. Depends on: L04–L05, L09–L11.
- Review all indexed images/SVGs/audio/fonts for baked words, spoken copy, glyphs,
  glyph shaping and readable typography. Preserve approved brand marks; translate
  taglines/captions/alt text. Redraw/review canvas text after font/language changes.
- Localize store title/subtitle/description/keywords/promotional/product/release
  copy, actual screenshot UI and overlays, preview subtitles, feature graphics,
  public metadata and any future landing/share/install copy. Separate review-team
  instructions from public listing copy.
- Evidence: source-to-export mapping and language-labelled assets, native-speaker
  checks, storefront field/character limits and displayed screenshots. The 50
  game languages and store locale/region variants are different inventories;
  verify supported console fields and record any unsupported locale explicitly.
- Contracts/versioning: art manifests/metadata/console outputs; no blanket claim
  of 50-language availability before the game passes L14.

### L13 — Translate and review all approved sources in all 49 targets

- Owners: TRANSLATION AI (one language folder per session), native reviewers,
  and moderation/legal specialists. Depends on: L03–L12 source contracts.
- Use the fixed catalog/waves and glossary; make consistent `TERMS.md`, short
  phone-friendly labels, proper-name/transliteration decisions, correct plural
  forms and typed parameters. Fill every approved namespace, not only `data/ui`.
  Keep region variants/aliases honest. Do not add Persian or other uncatalogued
  languages just because an old design example mentions them.
- Translate stored bot/NPC/preset wording appropriately; retain player identity.
  Build language-specific slur/harassment/contact/grooming coverage with native
  speakers and staffed moderation. The existing 30-word English list is not
  worldwide moderation coverage. Keep filter lists separate from ordinary copy.
- Evidence: 100% approved-key completion, zero stale/invalid entries, reviewed
  intentional unchanged English, glossary decisions, native review of tutorial,
  purchase/recovery/safety/legal and store copy. Record language/surface sign-off.
- Contracts/versioning: translators edit only their own locale folder; unclear
  English goes back to the owner rather than being independently rewritten.

### L14 — Verify the entire user journey and block incomplete release claims

- Owners: INTEGRATION + all runtime owners + language/device reviewers.
  Depends on: L01–L13. Gates below are mandatory evidence, not current passes.
- Run schema/catalog/key/placeholder/ICU completeness, reviewed inventory drift,
  no-unapproved-English checks, deterministic locale-independent sim/save tests,
  and English regression tests. Test intentional brand/user/provider exceptions.
- Traverse the full journey matrix below with real translations and a stretched
  pseudo-locale; use an RTL pseudo-locale as well. Smoke all 50 languages and do
  detailed typography for CJK/Arabic/Hebrew/Urdu/Indic/Thai/Ethiopic/Vietnamese and
  extended Latin. Test 320/360/390 px, landscape, larger text, screen readers,
  touch targets, line breaking, dialog/tooltip/keyboard and bidirectional names.
  Confirm actual glyph coverage and shaping, including cheap-phone system fonts;
  a language with missing glyphs cannot pass. Mirror interface edges appropriately,
  without changing battlefield coordinates, point IDs or gameplay geometry.
- On real iOS/Android and web, verify first launch, offline packs, repeated
  outages, updates, per-app language, background notifications, sign-in/purchases
  and opening every standalone page. Browser emulation is separate evidence.
- Evidence: coverage report per language × surface × platform with screenshots,
  test/device/ref/reviewer and unresolved failures. No production surface may be
  silently excluded because its path is rare. Public sandbox/debug routes count
  as player surfaces. Authenticated staff/developer-only tools have an explicit
  separate policy, not a misleading player-coverage denominator.
- Re-run required repo checks; update briefs, glossary's outdated plural note,
  worksheet instructions, listing language claims and audit closure records
  with fixing commits and limitations only after actual implementation/verification.

## Full journey matrix for L14

1. Fresh install/first web visit → splash/tutorial → age/rules/consent; also old
   browser, failed JS, slow startup, no storage, offline and interrupted boot.
2. Build/collect/upgrade/clear/move/sell; insufficient resources/builders, locked
   Keep, top-up, cancellation, timers and all building/warrior/hero descriptions.
3. Train/research/queue/presets/dismiss; empty army, full housing and invalid
   setup; switch language with each panel open without losing game state.
4. Scout generated and real opponents → attack/ability/hero/surrender/results;
   win/loss/perfect/close call/overflow/practice/pending/late/refused settlement;
   replay and rematch from old/current records; logs, ranks and deleted players.
5. Trials/modifiers/first-clear/repeat; daily chest/odds/streak/calendar, every
   task/achievement, season free/premium/expired, events/Bounty/stipend/looks.
6. Sign-in/link/unlink/reinstall recovery; local/server village import/holds,
   two devices, queue correction, no connection, required update, blocked saves,
   invalid/newer/corrupt save code, backup restore, export and deletion code.
7. Shop available/unavailable products, localized price/contents, age cap,
   cancel/approval/decline/pending, storage failure, retry/restore/refund/debt.
8. Friends exact Unicode name/code/QR/link, request/accept/reject/privacy/block;
   duels/challenges; Alliance and Gang find/create/join/leave/lead/chat/request/
   donate; under-13 presets; both war types and all relay/lock/result states.
9. Reports, notices, mute/suspension/rejection/appeal, contact markers and deleted
   accounts; standardized system messages viewed by players in different languages.
10. Every local/server notification on each device's selected language; language
    switch after scheduling, quiet hours, background delivery and disabled types.
11. Every support/privacy/community/terms/Japan/deletion page, direct links,
    native frames, missing publisher facts and form/network validation/results.
12. Home-screen app metadata/launch, OS provider sheets, published listing and
    product copy, screenshots/preview/feature graphic, screen-reader-only text.

## Definition of complete for one language

- Every **approved game-controlled** surface/key in the current baseline has a
  valid, reviewed translation and a real display consumer, including errors,
  accessibility, standalone pages, notifications, native wrappers and data.
- Every census candidate has a reviewed mapping or justified exclusion; new
  source changes fail the inventory/key gate until classified. No known English
  leakage remains except explicit brand/user/factual/provider/legacy policies.
- Data keys, protocol/state compatibility, old messages, typography, RTL,
  formatters, offline loading and all journey evidence pass. Translation edits
  never change game mechanics, identity, balances, RNG, hashes or saved progress.
- Store/platform external steps and their reviewers are recorded. Unsupported
  provider/store locales are disclosed rather than counted as game translation.
- A language is marked complete only after these gates pass. Structural
  `i18n:check`, 80% of UI, all 758 current keys, or a successful build alone is
  insufficient. All 49 target languages must meet the same scope to claim the
  owner's complete 50-language game.

## Regeneration and verification of this inventory

`tools/i18n/inventory.mjs` uses the existing TypeScript dev dependency, parses
TS/JS templates and JSON values, extracts visible markup/attributes/inline JS,
indexes native strings/resources and publishing copy, and records rendering
boundaries. It does not execute game/native code, access a network, translate
text, mutate worksheets or edit simulation snapshots. Output is deterministic
for identical source trees and flags. `--check` compares without writing.

To reproduce these pinned snapshots, from the repo root:

```sh
node -e "require('node:fs').mkdirSync('work/localization/main',{recursive:true}); require('node:fs').mkdirSync('work/localization/checkout',{recursive:true})"
git archive --format=tar --output=work/localization/main.tar 9d0eaa7bf245c752b66dfe3d9575738ac6fe4df9
git archive --format=tar --output=work/localization/checkout.tar 2a4b2222a411bc12a83b3ff991455e714ec5e417
tar -xf work/localization/main.tar -C work/localization/main
tar -xf work/localization/checkout.tar -C work/localization/checkout
node tools/i18n/inventory.mjs --source-root work/localization/main --source-ref 9d0eaa7bf245c752b66dfe3d9575738ac6fe4df9 --compare-root work/localization/checkout --compare-ref 2a4b2222a411bc12a83b3ff991455e714ec5e417 --check
```

For future work, use `--source-root . --source-ref <actual-commit-or-working-tree>`
and omit comparison flags once the historical differences have been reconciled.
Use `--output work/localization/proposed.json` for a reviewable comparison before
updating the checked-in snapshot. Refresh this document's baseline/counts and
the reviewed mapping when sources change; never silently treat an old inventory
as proof of coverage for a newer release.

Verification performed for this inventory:

- Generator syntax and deterministic `--check`: passed. Both source snapshots
  are enumerated; all 758 primary and 648 checkout English keys are represented,
  including the non-word bot reply `:)`; target translations remain zero.
- Source-ID uniqueness, source line/column bounds, exact catalog text/key
  coverage, representative UI/server/native/page/store entries and the missed
  rival biography: passed. `git diff --check`: passed.
- `npm run build`: passed on the checkout. It checks the unchanged current
  runtime; it does not build newer-main code from the inventory's primary snapshot.
- `npm test` on the checkout: 1,001 passed, 34 skipped, 4 failed tests across
  seven failed test files (three files failed setup), with two unhandled errors.
  Loopback listeners were refused with `listen EPERM`; network-interface
  enumeration returned `uv_interface_addresses` system error 1; the Redis-hang
  and release-tools tests timed out after their listener failures. The locale
  CLI assertion was the previously reproduced blocked `spawnSync ... EPERM`
  (empty child stderr). Direct unknown-language CLI calls return the expected
  exit code 1 and explanation. This is not a green full-suite result.
- No Postgres/Redis integration services, browser/native/store verification,
  translation review or L14 language-acceptance gate was run for this documentation
  task. Existing unrelated test files/runtime behavior were not changed to mask
  environment failures. Runtime code, game data and locale worksheets are unchanged.
