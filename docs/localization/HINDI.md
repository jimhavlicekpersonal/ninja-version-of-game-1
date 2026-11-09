---
document_type: hindi_implementation
schema_version: 1
language: hi
status: implemented_in_repo_release_checks_remain
measurements: SPANISH_SIZE.json (measured.hi)
---

# Hindi translation

Hindi (`hi`, Devanagari, left to right) is the third complete language after English
and Spanish, and the first in a non-Latin script. It covers the same first-party
surfaces as Spanish ([SPANISH.md](SPANISH.md)): every namespace (`boot` 17, `ui` 125,
`data` 669, `messages` 1,862, `pages` 314 = 2,987 entries), the six public pages and
the PWA manifest under `public/hi/`, the server account-deletion form
(`/account/delete?lang=hi`), server push text, iOS and Android locale resources,
StoreKit fixtures, and store listing and product copy in `docs/store/hi/`. Term
decisions are in `locales/hi/TERMS.md`; reviewed English-identical, Latin-script and
length warnings in `locales/hi/REVIEW.json`.

The translation is AI-written and validated by the repository checks below. **No
native Hindi speaker has reviewed it**, nor the legal pages; that review, physical
devices and the store consoles remain release steps.

## What Hindi needed that Spanish did not

Found while preparing the translation; each is fixed in this change.

| Issue | Fix |
|---|---|
| The glossary said plural forms were unsupported, but the runtime formats ICU `plural`/`select` with `Intl.PluralRules`. Hindi puts **0 in `one`** with 1. | `GLOSSARY.md` documents the syntax, the per-language categories (Hindi, Bangla, Gujarati, Kannada, Punjabi, Amharic, Zulu, French, Portuguese put 0 in `one`) and `=N` branches. `tests/locales/hindi.test.ts` checks 0, 1 and 2. |
| NFC stores the Devanagari nukta letters क़ ख़ ग़ ज़ ड़ ढ़ फ़ य़ (U+0958–U+095F) as base + ़, so text typed with the precomposed letters fails the NFC check. | `locales/CLAUDE.md` explains it (also for Bengali and Gurmukhi); the Hindi test rejects U+0958–U+095F. |
| Hindi verbs and adjectives agree with their subject's gender; the game knows neither the player's gender nor a placeholder's (`{building}`, `{troop}`, `{name}`). | Rule in `GLOSSARY.md`, `locales/CLAUDE.md` and the Hindi note in `languages.json`: ने constructions, passives and noun phrases first; `आप … सकते हैं` only where Hindi has no natural neutral form. Sensei Hoshi's lines are neutral too. |
| The glossary's informal-you rule would give तुम, which reads as talking down to many adult players. | The Hindi note sets आप with polite imperatives (रद्द करें), the convention of Hindi software. |
| The script check counted ICU keywords (`plural`, `one`, `other`) as foreign letters, so every plural message warned in a non-Latin language. | `tools/i18n/lib.mjs` `scriptShare` ignores ICU syntax. |
| Several paths only knew Spanish: server push catalogs, the deletion page (`?lang=es` only), the Settings links to shipped legal pages, `legal.js`, and the account form's failure text. | Each now serves any completed language (`server/localization.ts`, `server/accountPage.ts`, `server/app.ts`, `hud.ts`, `public/legal.js`, `ACCOUNT_FAILURE` in `tools/i18n/pages.mjs`). The steps for the next language are listed in `locales/CLAUDE.md`. |
| CSS letter-spacing cuts the Devanagari headline (शिरोरेखा) into pieces; the two-line bottom-bar labels used a 1.05 line height that is tight for vowel signs above and below. | `styles.css`: `html[data-script="Deva"]` resets letter-spacing and gives those labels 1.25. |
| The StoreKit generator only wrote English and Spanish, and cut text with `slice`, which can split a Devanagari cluster. | `tools/store/storekit.mjs` writes Hindi and fails instead of cutting Hindi text. |

Found in the browser check, and wrong in Spanish too (fixed for both):

- The result screen sent the CSS classes ` on slam` through translation; the Spanish text replaced them, so earned stars stayed grey. `battleHud.ts` now uses the class names directly.
- The offline Alliance member list showed the player as "You", the generated enemy Alliance name stayed English, and the Shadow Trial fortress layout name stayed English. `groveUi.ts` and `hud.ts` now localize them.

## Numbers, fonts and storage

The game formats numbers in the Indian grouping with Western digits (12,34,567;
compact हज़ार, लाख, क॰) through `Intl`, as the Hindi note asks. No font is bundled: the
Latin subsets fall back per character to the phone's Devanagari font (Noto Sans
Devanagari on Android, Kohinoor Devanagari on iOS, Nirmala UI on Windows), the existing
owner policy.

Measured by `npm run i18n:build` (`SPANISH_SIZE.json`, `measured.hi`): the runtime pack
is 355,985 bytes UTF-8 (82,485 gzip, 65,118 Brotli) for 2,673 strings, against Spanish
222,762 (73,078 gzip). Devanagari takes three bytes a letter, so Hindi is 1.6× Spanish
raw but only 1.13× compressed; the six pages and manifest add 96,641 bytes. The
"50 × Spanish × 1.5–2" projection in `SPANISH.md` still covers it.

## Validation

- `npm run i18n:check -- hi`: no errors; every warning reviewed in `REVIEW.json`.
- `tests/locales/hindi.test.ts`: catalog complete and ready, NFC without U+0958–U+095F, device choice `hi-IN`, plural categories, Indian grouping, literal player parameters, unchanged canonical data and seeded bases, Hindi pages, account form, deletion page fallback and server push text.
- Built client in Chromium at 360×780 (scratch check modelled on `npm run i18n:smoke`, with Noto Sans Devanagari installed for the screenshots): all 12 panels and their tabs, no page errors, no English left except computer players' Japanese names, language names and units; the bottom bar fits at 320, 360, 390, 568 and 844 px with no clipped labels; only the Hindi pack and Hindi pages are fetched and cached, and an offline reload stays in Hindi. Emulation is not physical-device evidence.

## Remaining before release

1. Deploy the server (it holds the Hindi push catalog and account form) before or with the game.
2. Native Hindi review of the game text, the tutorial, purchase, safety and legal pages.
3. Physical iOS and Android checks: language selection, glyphs on cheap Android phones, permission sheets and store purchase screens (provider sheets follow the OS language).
4. Upload `docs/store/hi/` listing and product copy to App Store Connect and Google Play, with Hindi screenshots (`npm run store:screenshots -- --language=hi` on a machine with a Devanagari font).
5. Hindi moderation coverage: the chat filter's word list is English only.
