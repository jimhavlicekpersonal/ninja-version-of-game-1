# TRANSLATION AI: locales/

**Current numbers** (protocol, battle rules, save format, migrations, roster, languages) are in `docs/STATUS.md`, generated from the code; where this brief names a version, the status file wins.

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
- No HTML, no line breaks, and no leading or trailing spaces unless the English has them. The checker counts a no-break space (U+00A0, U+202F) as a space too, so French punctuation spacing goes only between words, never at the start or end of a string (`: {arg1}` stays as it is).
- No-break spaces U+00A0 and U+202F are allowed where your language's typography needs them (French before `: ; ! ?`, `%` and inside « »); they are not invisible characters.
- Latin-script letters the check enforces: Romanian uses the comma-below ș ț Ș Ț (U+0219, U+021B, U+0218, U+021A); the cedilla forms ş ţ Ş Ţ fail. Catalan writes the *l·l* with the middle dot U+00B7 (col·lecció); the legacy single characters ŀ Ŀ (U+0140, U+013F) fail. Dutch writes IJ as the two letters i + j (IJzer); the ligatures ĳ Ĳ (U+0133, U+0132) fail.
- Use your language's own script (the check fails if most letters are in another script). Write Unicode NFC. Never add invisible direction marks, zero-width spaces, control characters or invisible fillers. ZWJ/ZWNJ are allowed when the language’s spelling requires them.
- NFC is not always the precomposed letter. In Devanagari (Hindi, Marathi) the nukta letters क़ ख़ ग़ ज़ ड़ ढ़ फ़ य़ (U+0958–U+095F) are composition exclusions: NFC stores them as the base letter plus ़ (U+093C), and the check rejects the single-code-point form. The same applies to the Bengali and Gurmukhi nukta letters. Normalize your text (`text.normalize('NFC')`) rather than trusting a keyboard.
- Plurals, selects and gender: read "Placeholders and numbers" in `GLOSSARY.md`. Plural categories follow your language (Hindi `one` covers 0 and 1), and nothing may agree in gender with a placeholder or with the player, whose gender the game does not know. That includes articles, possessives and case endings (German *der/die/das*, *dein/deine*, a genitive `{name}s`).
- `names.placeFirst`/`placeSecond` and `social.groveNames.first`/`second` are combined, every first part with every second part. Read "Generated names" in `GLOSSARY.md` and your language's `generatedNames` setting before translating them.
- Chinese and Japanese (and other languages written without spaces): read "Chinese, Japanese and other languages written without spaces" in `GLOSSARY.md`: measure words, where half-width spaces go, full-width punctuation outside the ASCII ICU syntax, and no 他/她 for players. Simplified Chinese must use Simplified characters only; the check fails on common Traditional and Japanese forms, since Unicode gives all three one Han script. Write Japanese names in kanji, not by sound.
- Right-to-left languages (Arabic, Urdu, Hebrew): write normally. The game sets the direction.
- Lists in `names.*` and `social.groveNames.*` must keep the same number of items. The game picks them by position.
- Do not translate `profanity` lists or anything not in your worksheet. Moderation lists are a separate task.
- If the English is wrong or unclear, translate your best reading and list the key in your final message. Do not edit `en/`.

## For other compartments (not the translator)

- When game data text changes (`src/gameplay/data/*.json`), run `npm run i18n:extract && npm run i18n:sync`. `tests/locales/locales.test.ts` fails until you do. Changed English sends affected entries back to every translator's to-do list, with the old translation kept as a hint.
- English namespaces now cover `boot`, `ui`, `data`, `messages` and `pages`. UI code calls keyed messages; canonical simulation/server/history wording is rendered through `locales/runtime.ts` only at owned display boundaries. Never pass authored names/chat through a translation matcher.
- `tools/i18n/build.mjs` emits compact text-only `public/lang/<code>-<hash>.json` packs and server catalogs. It never bundles worksheets. Readiness requires 100% of all source namespaces, matching English, valid placeholders/ICU and rich tokens. English, Spanish, Hindi, Portuguese (Brazil), German, French, Italian, Simplified Chinese, Romanian, Catalan, Dutch and Swedish currently pass; Settings hides incomplete languages. Activating another completed language is an integration step: set `generatedNames` in `languages.json` (`"noun-first"` if the language puts the noun before its modifier, as Spanish, Portuguese, French, Italian, Romanian and Catalan; `"compound"` if it joins the two parts into one word, as German, Dutch, Swedish and Chinese; see "Generated names" in `GLOSSARY.md`), add its compiled catalog to `server/localization.ts` and its pages to `server/accountPage.ts`, its account-form failure line to `ACCOUNT_FAILURE` in `tools/i18n/pages.mjs` and its fallback to `public/legal.js`, its native resources (`ios/App/App/<code>.lproj`, `knownRegions`, `CFBundleLocalizations`, `android/.../values-<code>`, `locales_config.xml`), StoreKit fixtures (`tools/store/storekit.mjs`), store copy in `docs/store/<code>/`, and a release test like `tests/locales/hindi.test.ts`, `portuguese.test.ts`, `german.test.ts` `chinese.test.ts`, `dutch.test.ts` or `swedish.test.ts`. Use the platform's own code for the language in native resources: Chinese is `zh-Hans.lproj` and `values-b+zh+Hans`, not the worksheet folder name alone.
- Native installs carry every completed text pack. Web startup loads the selected pack and its service worker caches only that language's text/pages. Spanish uses existing Latin fonts; other scripts follow the established system-font fallback policy (Hindi: Noto Sans Devanagari on Android, Kohinoor Devanagari on iOS, Nirmala UI on Windows; `html[data-script="Deva"]` drops letter-spacing, which breaks the Devanagari headline). Han scripts share code points with Japanese (Han unification), and the shared fallback lists Japanese fonts first, so `html[data-script="Hans"]`/`"Hant"` put the Chinese system fonts first (PingFang SC/TC, Microsoft YaHei/JhengHei; Android picks Noto Sans CJK from `<html lang>`) and keep the Latin subset away from Chinese punctuation (`M PLUS 1 Han`); canvas text does the same in `render/fonts.ts`. Japanese and Korean need their own rule when they ship. The bundled Latin fonts cover Latin-1 only: a Latin-script language with other letters (Romanian ă ș ț; later Polish, Czech, Turkish, Vietnamese…) goes in `SYSTEM_FONT_LANGS` (`render/fonts.ts`) and the `html:is([lang=…])` rule in `styles.css`, so it uses the device fonts throughout; `tests/locales/latin-fonts.test.ts` fails until it does. Do not add font downloads without a new owner decision.
- `tools/i18n/pages.mjs` preserves trusted HTML through `{tN}` tokens: translate whole blocks, retain every token exactly once, and never add HTML. Runtime params use ICU-lite plurals/select; preserve variable names, use the language's branches and keep `other`.
- Build/sync and structural checks are not native linguistic, legal, storefront, accessibility or physical-device approval. The current record and exact-size report are in `docs/localization/`. Translators still edit only their assigned locale unless an integration task is explicitly authorized.

The import-boundary test scans `locales/` and `tools/i18n/` as well as game sources, including `.mjs` files. This checks code imports; it is not a filesystem sandbox enforcing a translator’s edit permissions.
