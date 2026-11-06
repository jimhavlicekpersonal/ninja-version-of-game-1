# TRANSLATION AI: locales/

You translate Kagemura into one language per session. You own only `locales/<your code>/`. Everything else is read-only for you, including `locales/en/`, `locales/languages.json` and the game code.

## The layout

```
locales/
  languages.json     the 50 languages: code, script, direction, translation wave, notes
  GLOSSARY.md        game terms and naming rules. Read it before every session.
  en/<ns>.json       English source. data.json is generated from src/gameplay/data.
  <code>/<ns>.json   your worksheet: one entry per line
  <code>/TERMS.md    your language's chosen term translations (you create and keep it)
```

A worksheet entry looks like this:

```json
"troops.hedgehog_roller.description": { "en": "Fast, cheap melee fighter. Dashes to the nearest building.", "text": "" },
```

Fill `text` only. Never change a key or `en`. An entry may have `old`: an earlier translation whose English has since changed. Update it into `text`; the next sync removes `old`.

## A session, step by step

1. Run `npm run i18n:status`. It lists every language and names the **next** one. Take that one unless you were given a code.
2. Read `GLOSSARY.md`, your language's line in `languages.json` (its `note`), and `locales/<code>/TERMS.md` if it exists.
3. Run `npm run i18n:next -- <code> 80`. It shows the untranslated entries.
4. Translate in the worksheet, in file order, in chunks of about 100 entries. Read the key: it tells you what the text is. `.name` is a short label. `.description` and `.text` are sentences. `social.chatLines.*` are friendly bot chat messages. `names.*` are lists of name parts that the game combines.
5. After each chunk, run `npm run i18n:check -- <code>`. Fix every error and read every warning, including unchanged English in Latin-script languages. Proper names can legitimately remain unchanged; review them.
6. Commit each chunk on the branch `i18n/<code>` with the message `i18n(<code>): <what>`. Small commits survive interrupted sessions.
7. When the language is complete and the check passes, run `npm test -- tests/locales` and say so in your final message, with any terms you were unsure of.

## Rules

- Write natural, native text, as a game localized in your language would read. Not word-for-word.
- Keep placeholders such as `{n}` exactly. The check fails otherwise.
- No HTML, no line breaks, and no leading or trailing spaces unless the English has them.
- Use your language's own script (the check fails if most letters are in another script). Write Unicode NFC. Never add invisible direction marks, zero-width spaces, control characters or invisible fillers. ZWJ/ZWNJ are allowed when the language’s spelling requires them.
- Right-to-left languages (Arabic, Urdu, Hebrew): write normally. The game sets the direction.
- Lists in `names.*` and `social.groveNames.*` must keep the same number of items. The game picks them by position.
- Do not translate `profanity` lists or anything not in your worksheet. Moderation lists are a separate task.
- If the English is wrong or unclear, translate your best reading and list the key in your final message. Do not edit `en/`.

## For other compartments (not the translator)

- When game data text changes (`src/gameplay/data/*.json`), run `npm run i18n:extract && npm run i18n:sync`. `tests/locales/locales.test.ts` fails until you do. Changed English sends affected entries back to every translator's to-do list, with the old translation kept as a hint.
- English namespaces now cover `boot`, `ui`, `data`, `messages` and `pages`. UI code calls keyed messages; canonical simulation/server/history wording is rendered through `locales/runtime.ts` only at owned display boundaries. Never pass authored names/chat through a translation matcher.
- `tools/i18n/build.mjs` emits compact text-only `public/lang/<code>-<hash>.json` packs and server catalogs. It never bundles worksheets. Readiness requires 100% of all source namespaces, matching English, valid placeholders/ICU and rich tokens. Only English and Spanish currently pass; Settings hides incomplete languages.
- Native installs carry every completed text pack. Web startup loads the selected pack and its service worker caches only that language's text/pages. Spanish uses existing Latin fonts; other scripts follow the established system-font fallback policy. Do not add font downloads without a new owner decision.
- `tools/i18n/pages.mjs` preserves trusted HTML through `{tN}` tokens: translate whole blocks, retain every token exactly once, and never add HTML. Runtime params use ICU-lite plurals/select; preserve variable names, use the language's branches and keep `other`.
- Build/sync and structural checks are not native linguistic, legal, storefront, accessibility or physical-device approval. The current record and exact-size report are in `docs/localization/`. Translators still edit only their assigned locale unless an integration task is explicitly authorized.

The import-boundary test scans `locales/` and `tools/i18n/` as well as game sources, including `.mjs` files. This checks code imports; it is not a filesystem sandbox enforcing a translator’s edit permissions.
