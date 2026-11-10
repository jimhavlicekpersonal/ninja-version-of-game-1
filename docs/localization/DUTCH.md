---
document_type: dutch_implementation
schema_version: 1
language: nl
variant: Standard Dutch with je, also served to Flanders (nl-BE) and Suriname
status: implemented_in_repo_release_checks_remain
measurements: SPANISH_SIZE.json (measured.nl)
---

# Dutch translation

Dutch (`nl`) was released together with Swedish on 2026-11-10 in commit `642deab`. It is written in standard Dutch with *je/jij*, also in the legal pages, and served to `nl-NL`, `nl-BE`, `nl-SR` and plain `nl` devices (a Belgian device that ranks French first keeps French). It covers every namespace (3,020 entries), the six public pages and PWA manifest under `public/nl/`, the account-deletion form (`/account/delete?lang=nl`), server push text, iOS (`nl.lproj`) and Android (`values-nl`) resources, StoreKit fixtures for `nl_NL`, and listing and product copy in `docs/store/nl/`. Terms: `locales/nl/TERMS.md`; reviewed warnings: `locales/nl/REVIEW.json`.

The translation is AI-written and validated by the repository checks below. **No native Dutch speaker has reviewed it**, nor the legal pages.

## Instruction fixes it needed (commit `9a4ede4`)

The Dutch line in `languages.json` only said "Informal je. Also served to Flemish (nl-BE)". Before translating:

- **Articles, adjective endings and the genitive.** *de/het*, the inflected adjective (*sterk/sterke*) and the genitive *'s/-s* depend on a word the game does not know. The note, `GLOSSARY.md` and `TERMS.md` now say to put nothing before or on a placeholder: `{building} verbeteren`, `Klaar: {building}`, `Dorp van {name}`, never `{name}s dorp`. `dutch.test.ts` refuses an article before `{name}`, `{building}`, `{troop}` or `{label}` and any `{…}s`.
- **IJ.** The digraph is the two letters i + j (*IJzer*); the compatibility ligatures ĳ Ĳ (U+0133, U+0132) break search and sorting and fall outside the bundled Latin-1 fonts. `npm run i18n:check` now fails on them (`tools/i18n/lib.mjs`).
- **Generated names.** `generatedNames: "compound"`, like German: first parts are stems (*Donder*, *IJzer*, *Dennen*, *Tweeling*), second parts nouns (*piek*, *poort*, *kloof*): *Donderpiek*, *IJzerpoort*, *Middernachtbloesem*.
- **Variety.** Flanders and Suriname are named so translators avoid Netherlands-only slang.

## Fonts

Dutch letters (é ë ï ö) are inside the Latin-1 subsets of the bundled fonts, so Dutch keeps the bundled fonts; `tests/locales/latin-fonts.test.ts` confirms it does not need `SYSTEM_FONT_LANGS`.

## Dutch specifics

- Plural `one` is only 1 (*0 krijgers*); every counted noun has both branches.
- Nothing agrees with the player: *Welkom terug*, *Je bent lid geworden: {arg1}*.
- `Intl` writes 1.234.567 and 20% (no space).
- "Kite" units use *vlieger* in names (*Vliegerrover*, *Dondervlieger*); flying units in rules text are *vliegers* or *vliegende krijgers*.

## Storage

`npm run i18n:build` (`measured.nl`): 217,357 bytes UTF-8 (72,484 gzip, 61,966 Brotli). The six pages and manifest add 50,117 bytes.

## Validation

- `npm run i18n:check -- nl`: no errors; English-identical entries reviewed in `REVIEW.json` (Japanese names, brands, parameter-only templates, script names and words Dutch uses as they are). The length warnings are the Japanese statutory titles.
- `tests/locales/dutch.test.ts`: catalog complete and ready, device choice, numbers, one/other, IJ (and the check refusing ĳ), compound names, nothing attached to a placeholder, unchanged canonical data, pages, account form and push text. `npm test` passes (155 files, after merging Japanese).
- Built client in Chromium (`nl-BE`, scratch copy of `tools/i18n/smoke.mjs`): all 12 panels and tabs with no untranslated markers or page errors; the Army action buttons do not overflow; the bottom bar fits and Build opens at 320, 360, 390, 568 and 844 px; the scout card shows no English rival names; only the Dutch pack is fetched and cached; offline reload stays in Dutch; switching to English keeps every building's identity. The synthetic failed-switch step could not be reproduced (the pack was still served from the service-worker cache, so the switch succeeded), as in the Romanian run; the Swedish run covered it. Emulation is not physical-device evidence.

## Remaining before release

1. Deploy the server (Dutch push catalog and account form) before or with the game.
2. Native Dutch review (Netherlands and Flanders), including the tutorial, purchase, safety and legal pages, and a Dutch- and Belgian-law review of the terms and privacy policy (Autoriteit Persoonsgegevens and Gegevensbeschermingsautoriteit named as local authorities).
3. Physical iOS and Android checks; uploading `docs/store/nl/` to App Store Connect and Google Play with Dutch screenshots.
4. Dutch moderation coverage: the chat filter's word list is English only.
