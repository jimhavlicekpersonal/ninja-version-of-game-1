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
5. After each chunk, run `npm run i18n:check -- <code>`. Fix every error and read every warning.
6. Commit each chunk on the branch `i18n/<code>` with the message `i18n(<code>): <what>`. Small commits survive interrupted sessions.
7. When the language is complete and the check passes, run `npm test -- tests/locales` and say so in your final message, with any terms you were unsure of.

## Rules

- Write natural, native text, as a game localized in your language would read. Not word-for-word.
- Keep placeholders such as `{n}` exactly. The check fails otherwise.
- No HTML, no line breaks, and no leading or trailing spaces unless the English has them.
- Use your language's own script (the check fails if most letters are in another script). Write Unicode NFC. Never add invisible direction marks or zero-width spaces.
- Right-to-left languages (Arabic, Urdu, Hebrew): write normally. The game sets the direction.
- Lists in `names.*` and `social.groveNames.*` must keep the same number of items. The game picks them by position.
- Do not translate `profanity` lists or anything not in your worksheet. Moderation lists are a separate task.
- If the English is wrong or unclear, translate your best reading and list the key in your final message. Do not edit `en/`.

## For other compartments (not the translator)

- When game data text changes (`src/gameplay/data/*.json`), run `npm run i18n:extract && npm run i18n:sync`. `tests/locales/locales.test.ts` fails until you do. Changed English sends affected entries back to every translator's to-do list, with the old translation kept as a hint.
- Interface text (`src/presentation`, `src/app.ts`, `index.html`) is not here yet. The text-layer step in `docs/prompts/DOWNLOAD_AND_LANGUAGE.md` moves it into `locales/en/ui.json`. `npm run i18n:sync` then adds it to every worksheet, with no tool changes.
- The game does not read `locales/` yet. The build will pack each worksheet's `text` values into a runtime file per language, falling back to English for any empty entry.
