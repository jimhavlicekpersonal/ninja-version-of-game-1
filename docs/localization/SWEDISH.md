---
document_type: swedish_implementation
schema_version: 1
language: sv
variant: Standard Swedish (Sweden) with du, also served to Swedish-speaking Finland
status: implemented_in_repo_release_checks_remain
measurements: SPANISH_SIZE.json (measured.sv)
---

# Swedish translation

Swedish (`sv`) was released together with Dutch on 2026-11-10 in commit `DUTCH_SWEDISH_COMMIT`. It is written in standard Swedish with *du*, also in the legal pages, and served to `sv-SE`, `sv-FI`, `sv-AX` and plain `sv` devices. It covers every namespace (3,020 entries), the six public pages and PWA manifest under `public/sv/`, the account-deletion form (`/account/delete?lang=sv`), server push text, iOS (`sv.lproj`) and Android (`values-sv`) resources, StoreKit fixtures for `sv`, and listing and product copy in `docs/store/sv/`. Terms: `locales/sv/TERMS.md`; reviewed warnings: `locales/sv/REVIEW.json`.

The translation is AI-written and validated by the repository checks below. **No native Swedish speaker has reviewed it**, nor the legal pages.

## Instruction fixes it needed (commit `9a4ede4`)

Swedish had no note in `languages.json` at all. Before translating:

- **Definite article and genitive are endings.** *byn*, *tornet* and *Annas by* attach to the word, and *en/ett* gender changes adjectives and possessives (*stor/stort*, *din/ditt*). The note, `GLOSSARY.md` and `TERMS.md` now say to attach nothing to a placeholder and let nothing agree with it: `By: {name}`, `Klart: {building}`, `Uppgradera {building}`, never `{name}s by`. `swedish.test.ts` refuses a placeholder followed by *s*, *en*, *et*, *n*, *t* or *na*.
- **Generated names.** `generatedNames: "compound"`, with second parts in the indefinite form so every first part fits (*topp*, not *toppen*): *Åsktopp*, *Järnport*, *Midnattsblom*.
- **Typography.** Quotation marks ”…” (U+201D on both sides); `Intl` groups thousands with a no-break space (1 234 567) and writes percent with one (20 %), so translators write `{n} %` in running text.
- **Variety.** Swedish-speaking Finland is named so translators avoid Sweden-only slang. A device that lists Finnish first gets Swedish only because Finnish is not ready yet (first completed preference).

## Fonts

Swedish letters (å ä ö é) are inside the Latin-1 subsets of the bundled fonts, so Swedish keeps the bundled fonts; `tests/locales/latin-fonts.test.ts` confirms it does not need `SYSTEM_FONT_LANGS`.

## Swedish specifics

- Plural `one` is only 1 (*0 krigare*); many nouns have the same singular and plural (*krigare*, *försvar*, *anfall*, *köp*), but both branches are kept.
- Nothing agrees with the player: *Välkommen tillbaka*, *Du gick med i {arg1}!*.
- *Drake* means both kite and dragon in Swedish; kite units use it (*Drakplundrare*, *Åskdrake*, *Drakskärarballista*), and the Dragon Kite Crew is *Drakbesättning*.

## Storage

`npm run i18n:build` (`measured.sv`): 213,140 bytes UTF-8 (71,451 gzip, 60,998 Brotli), the smallest Latin-script pack so far. The six pages and manifest add about 48 KB.

## Validation

- `npm run i18n:check -- sv`: no errors; English-identical entries reviewed in `REVIEW.json` (Japanese names, brands, parameter-only templates, script names and words Swedish uses as they are). The length warnings are the Japanese statutory titles.
- `tests/locales/swedish.test.ts`: catalog complete and ready, device choice, no-break-space numbers, one/other, Swedish letters and quotes, compound names, nothing attached to a placeholder, unchanged canonical data, pages, account form and push text. `npm test` passes (153 files).
- Built client in Chromium (`sv-SE`, scratch copy of `tools/i18n/smoke.mjs`): all 12 panels and tabs with no untranslated markers or page errors; the Army action buttons do not overflow; the bottom bar fits and Build opens at 320, 360, 390, 568 and 844 px; the scout card shows no English rival names; only the Swedish pack is fetched and cached; offline reload stays in Swedish; switching to English keeps every building's identity; a failed language fetch keeps the working preference. Emulation is not physical-device evidence.

## Remaining before release

1. Deploy the server (Swedish push catalog and account form) before or with the game.
2. Native Swedish review (Sweden and Finland), including the tutorial, purchase, safety and legal pages, and a Swedish- and Finnish-law review of the terms and privacy policy (IMY and the Finnish Data Protection Ombudsman named as local authorities).
3. Physical iOS and Android checks; uploading `docs/store/sv/` to App Store Connect and Google Play with Swedish screenshots.
4. Swedish moderation coverage: the chat filter's word list is English only.
