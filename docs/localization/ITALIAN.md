---
document_type: italian_implementation
schema_version: 1
language: it
variant: Standard Italian with tu, also served to Switzerland and San Marino
status: implemented_in_repo_release_checks_remain
measurements: SPANISH_SIZE.json (measured.it)
---

# Italian translation

Italian (`it`) was released together with French on 2026-11-09; the instruction fixes both needed, and the two layout bugs found in the browser check, are recorded in [FRENCH.md](FRENCH.md). It is written in standard Italian with *tu*, also in the legal pages, and served to `it-IT`, `it-CH` and `it-SM` devices. It covers every namespace (2,988 entries), the six public pages and PWA manifest under `public/it/`, the account-deletion form (`/account/delete?lang=it`), server push text, iOS (`it.lproj`) and Android (`values-it`) resources, StoreKit fixtures for `it_IT`, and listing and product copy in `docs/store/it/`. Terms: `locales/it/TERMS.md`; reviewed warnings: `locales/it/REVIEW.json`.

The translation is AI-written and validated by the repository checks below. **No native Italian speaker has reviewed it**, nor the legal pages.

## Italian specifics

- Generated names are noun-first (`generatedNames: "noun-first"`) with invariant first parts: Picco del Tuono, Gola Cremisi, Fiore di Mezzanotte.
- Past participles with *essere* agree with their subject, so nothing refers to the player that way: *Ti do il benvenuto* (not *Benvenuto*), *la tua ultima presenza online* (not *sei stato online*), *Nuovo membro dell'Alleanza: {arg1}* (not *{arg1} è entrato*).
- No article or contracted preposition before a placeholder (`Costruzione completata: {arg1}`); `italian.test.ts` checks it.
- `Intl` puts 0 in `other` (0 guerrieri), writes 1.234.567 but 2400 (CLDR minimum grouping), compact 1,2K / 1,5 Mln, and percentages without a space (20%).

## Storage

`npm run i18n:build` (`measured.it`): 222,518 bytes UTF-8 (72,766 gzip, 61,920 Brotli), the size of Spanish. The six pages and manifest add 50,579 bytes.

## Validation

- `npm run i18n:check -- it`: no errors; English-identical entries reviewed in `REVIEW.json` (Japanese names, brands, parameter-only strings and words Italian uses as they are: Account, Chat, Codex, Online, Pass, Premium, Privacy, Replay, Staff, OK). Three length warnings are the Japanese statutory titles.
- `tests/locales/italian.test.ts`: catalog complete and ready, device choice, numbers, plurals, noun-first names, no article before a name or label, unchanged canonical data, pages, account form and push text.
- Built client in Chromium (`it-IT`): all 12 panels and tabs, no page errors, no English-only words, no overflowing element; the bottom bar fits and Build opens at 320–844 px ("Costruisci" wraps inside its button at 320 px); only the Italian pack is fetched and cached; offline reload stays in Italian. Emulation is not physical-device evidence.

## Remaining before release

1. Deploy the server (Italian push catalog and account form) before or with the game.
2. Native Italian review, including the tutorial, purchase, safety and legal pages, and an Italian-law review of the terms and privacy policy.
3. Physical iOS and Android checks; uploading `docs/store/it/` to App Store Connect and Google Play with Italian screenshots.
4. Italian moderation coverage: the chat filter's word list is English only.
