# Generated files (do not hand-edit)

Files below are written by a tool; an edit by hand is lost the next time the tool runs. Change the
source (or the generator) and run the command instead. Markdown outputs say so in their first lines;
JSON outputs carry a `generated`/`$generated` key where their readers tolerate one, and are listed
here where they do not (the store and Xcode read some of them, and the language assets are read by
the game). `tests/architecture/generated.test.ts` checks that every file listed here exists, that
generated Markdown says it is generated, and that the cheap generator (`npm run docs:progression`)
would change nothing; `tests/architecture/status.test.ts` does the same for `docs/STATUS.md`.
Quality finding 5 (`docs/audit/areas/08-code-quality.md`).

## Docs and reports

| File | Written by | Source | Checked |
|---|---|---|---|
| `docs/STATUS.md` | `npm run status` (`tools/status/`) | the code's version constants, data, locales, tests | `status.test.ts` (no-op) |
| `docs/game-theory/ROSTER.md` | `npm run docs:progression` | `progression.json`, `roster.json`, `sim/progression.ts` | `generated.test.ts` (no-op) |
| `docs/art/ICON_MANIFEST.md` | `npm run docs:progression` | the progression model | `generated.test.ts` (no-op) |
| `docs/art/ICON_MANIFEST.json` | `npm run docs:progression` (`generated` key) | the progression model | `generated.test.ts` (no-op) |
| `docs/game-theory/CAMPAIGN.md` | `npm run balance:campaign` (about 3 min) | model-player campaigns | `campaign-gates.test.ts` bounds |
| `docs/game-theory/campaign.json` | `npm run balance:campaign` (`$generated` key) | model-player campaigns | `campaign-gates.test.ts` bounds |
| `docs/game-theory/ARMY_BALANCE.md` | `npm run balance:armies` | army lab battles | — (slow) |
| `docs/localization/SPANISH_SIZE.json` | every `tools/i18n/build.mjs` run (written only when its text changes); `npm run i18n:size` adds the built-JavaScript bytes | locale worksheets, `dist/` | — |
| `docs/localization/INVENTORY.json` | `node tools/i18n/inventory.mjs` (pinned sources, see `docs/localization/README.md`) | the pinned source trees | the tool's own compare mode |
| `docs/art/brand/icon.svg`, `docs/art/brand/splash.svg` | `npm run brand -- --svg` | `tools/brand/brand.mjs` | — |

## Language assets

| File | Written by | Source |
|---|---|---|
| `locales/availability.json` | `tools/i18n/build.mjs` (before every test, typecheck and build) | worksheets in `locales/<code>/` |
| `locales/en/pages.json` | `tools/i18n/pages.mjs` | `locales/pages.sources.json` |
| `locales/pages.sources.json` | `tools/i18n/pages.mjs` | the English public pages |
| `public/<code>/*.html`, `public/<code>/manifest.webmanifest` | `tools/i18n/build.mjs` / `pages.mjs` | page worksheets, `public/manifest.webmanifest` |
| `locales/compiled/`, `public/lang/` | `tools/i18n/build.mjs` | worksheets (not committed) |

## Release and store

| File | Written by | Source |
|---|---|---|
| `ios/App/Products.storekit` | `npm run store:storekit` | `src/gameplay/data/store.json` (checked by `release-config.test.ts`) |
| `server/rules/manifest.json` | `npm run rules:snapshot` | the archived rules |
| `server/rules/v<N>/` | `npm run rules:snapshot` (before a `SIM_RULES` bump; never edited) | `src/gameplay/sim`, `src/gameplay/data` |
| `tests/backend/fixtures/rules/v<N>.json` | `npm run rules:fixture` | recorded battles under rules N |

## Game data rewritten by one-off tools

These data files are hand-maintained, but a tool once rewrote (and may rewrite again) the fields named;
rerunning it overwrites hand edits to those fields. They carry no marker because the game reads every
key of their maps (a `$comment` entry in `troops.json` would be a troop).

| File | Fields | Tool |
|---|---|---|
| `src/gameplay/data/troops.json` | one role's HP/damage per level | `tools/progression/rolecut.mjs` |
| `src/gameplay/data/troops.json` | research cost/time, training time past tier 1 | `tools/progression/pacing.mjs` |
| `src/gameplay/data/progression.json` | role budgets | `tools/progression/rolecut.mjs` |
| `src/gameplay/data/store.json` | `topUpScaleByHall` | `tools/balance/topup.mjs` |
| `src/gameplay/data/buildings.json` | mid-Keep defense HP/damage | `tools/balance/midkeep.mjs` |
