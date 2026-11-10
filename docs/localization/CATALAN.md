---
document_type: catalan_implementation
schema_version: 1
language: ca
variant: Standard central Catalan with tu, also served to Valencia, the Balearic Islands, Andorra and Roussillon
status: implemented_in_repo_release_checks_remain
measurements: SPANISH_SIZE.json (measured.ca)
---

# Catalan translation

Catalan (`ca`) was released together with Romanian on 2026-11-10 (commit recorded in [ROMANIAN.md](ROMANIAN.md)). It is written in standard central Catalan with *tu*, also in the legal pages, and served to `ca-ES`, `ca-AD`, `ca-FR` and `ca-ES-valencia` devices; a device that ranks Spanish above Catalan keeps Spanish. It covers every namespace (3,020 entries), the six public pages and PWA manifest under `public/ca/`, the account-deletion form (`/account/delete?lang=ca`), server push text, iOS (`ca.lproj`) and Android (`values-ca`) resources, StoreKit fixtures for `ca`, and listing and product copy in `docs/store/ca/`. Terms: `locales/ca/TERMS.md`; reviewed warnings: `locales/ca/REVIEW.json`.

The translation is AI-written and validated by the repository checks below. **No native Catalan speaker has reviewed it**, nor the legal pages.

## Instruction fixes it needed (commit `cc0ce64`)

Catalan had no note in `languages.json`. Before translating:

- **Apostrophe, contractions and the personal article.** *el/la* → *l'*, *de* → *d'*, *de/a/per + el* → *del/al/pel*, and *en/na* before names all depend on a word the game does not know. As for French, nothing of the kind goes directly before a placeholder (*Poble: {name}*); `GLOSSARY.md` lists the Catalan forms and `catalan.test.ts` checks it. Numbers that could be 1 or 11 (*l'1*, *d'11*) are also kept away from *el/de* (*Pas {n}/{total}*).
- **Ela geminada.** *l·l* uses the middle dot U+00B7; `npm run i18n:check` now fails on the legacy ŀ Ŀ.
- **Plurals.** `one` is only 1 (0 guerrers); `Intl` also has `many` for whole millions, which falls back to `other`.
- **Generated names.** `generatedNames: "noun-first"` with invariant first parts (*del Tro*, *de la Boira*, *Carmesí*): *Cim del Tro*, *Gorja Carmesí*.

## Catalan specifics

- Every Catalan letter, the middle dot included, is in the bundled Latin-1 font subsets, so Catalan keeps the bundled fonts (`tests/locales/latin-fonts.test.ts`).
- Nothing agrees with the player: *Et dono la benvinguda* (not *Benvingut*), *Has bloquejat: {arg1}*; *líder* is common gender.
- Resource amounts take no *de* (*500 Jade*, *Honor: 1.200*). `Intl` writes 1.234.567 and 2.400, percentages with a no-break space (20 %).

## Storage

`npm run i18n:build` (`measured.ca`): 224,895 bytes UTF-8 (74,007 gzip, 62,732 Brotli), the size of Italian. The six pages and manifest add 50,738 bytes.

## Validation

- `npm run i18n:check -- ca`: no errors; English-identical entries reviewed in `REVIEW.json` (Japanese names, brands, parameter-only templates, script names and Catalan words spelled as in English: Honor, Jade, Provisions, Base, Duel). Three length warnings are the Japanese statutory titles.
- `tests/locales/catalan.test.ts`: catalog complete and ready, device choice (Catalan first, Spanish kept when preferred), numbers, plurals, middle dot (and the check refusing ŀ), noun-first names, no article, contraction or personal article before a name or label, unchanged canonical data, pages, account form and push text.
- Built client in Chromium (`ca-ES`, scratch copy of `tools/i18n/smoke.mjs`): all 12 panels and tabs, no page errors; the bottom bar fits and Build opens at 320, 360, 390, 568 and 844 px; only the Catalan pack is fetched and cached; offline reload stays in Catalan; switching to English keeps every building's identity, and a failed language fetch keeps the working preference. The *Next* train-ahead buttons in the Army panel clip their count at 390 px, as in Spanish, which already ships. Emulation is not physical-device evidence.

## Remaining before release

1. Deploy the server (Catalan push catalog and account form) before or with the game.
2. Native Catalan review (including whether Valencian players want a separate variant), the tutorial, purchase, safety and legal pages, and a Spanish/Andorran-law review of the terms and privacy policy.
3. Physical iOS and Android checks; uploading `docs/store/ca/` to App Store Connect and Google Play with Catalan screenshots.
4. Catalan moderation coverage: the chat filter's word list is English only.
