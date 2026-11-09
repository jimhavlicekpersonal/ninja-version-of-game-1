---
document_type: turkish_implementation
schema_version: 1
language: tr
variant: Standard Turkish with informal sen, also served to Turkish-language devices in Cyprus
status: implemented_in_repo_release_checks_remain
measurements: SPANISH_SIZE.json (measured.tr)
---

# Turkish translation

Turkish (`tr`) was released on 2026-11-09. It is written in standard Turkish with informal *sen* (lowercase, also in the legal pages) and served to `tr-TR`, `tr-CY` and plain `tr` devices. It covers every namespace (3,019 entries), the six public pages and the PWA manifest under `public/tr/`, the account-deletion form (`/account/delete?lang=tr`), server push text, iOS (`tr.lproj`) and Android (`values-tr`) resources, StoreKit fixtures for `tr`, and listing and product copy in `docs/store/tr/`. Terms: `locales/tr/TERMS.md`. Reviewed warnings: `locales/tr/REVIEW.json`.

The translation is AI-written and validated by the repository checks below. **No native Turkish speaker has reviewed it**, and neither the legal pages nor their KVKK/GDPR wording has been reviewed.

## Turkish specifics

- **No suffix on a placeholder.** Turkish case endings, possessives and the apostrophe before a suffix on a proper name follow vowel harmony, and the game does not know the last vowel of `{name}`, `{building}` or a number. So a placeholder sits after a colon (`Yükseltme bitti: {building}`), before a postposition (`{name} ile`), before *adlı* (`{name} adlı oyuncu`) or before a noun (`{n} savaşçı`). `turkish.test.ts` rejects any letter or apostrophe directly after a placeholder; the only exceptions are the `time.*` unit abbreviations (`{d}g {h}sa`).
- Turkish nouns stay singular after a number (5 savaşçı), so `one` and `other` plural branches usually carry the same text. `Intl.PluralRules('tr')` puts 0 in `other`.
- Generated names use the default order (first part, space, second part; no `generatedNames` setting). First parts are adjectives or bare material nouns (*Sessiz*, *Gürleyen*, *Çamlı*, *Granit*) and second parts are bare nouns (*Zirve*, *Boğaz*, *Çiçek*), so no possessive suffix (*Zirvesi*) is ever needed: Gürleyen Zirve, Kızıl Boğaz, Karanlık Çiçek.
- Dotted and dotless i: `html[lang="tr"]` makes CSS `text-transform` produce İ and I correctly. The one place that capitalized text in script (the Season Scroll end-date chip in `economyUi.ts`) now uses `toLocaleUpperCase` with the interface language.
- `Intl` writes 1.234.567 and 2.400 (Turkish groups four-digit numbers), a decimal comma, and the percent sign before the number (%20). Sentences with a percentage placeholder write `%{arg}`.

## Storage

`npm run i18n:build` (`measured.tr`): 218,890 bytes UTF-8 (72,742 gzip, 62,028 Brotli), about the size of Italian. The six pages and the manifest add 50,696 bytes. Turkish uses the existing Latin fonts; no font download.

## Validation

- `npm run i18n:check -- tr`: no errors. The English-identical entries are reviewed in `REVIEW.json` (Japanese names, brands, script names, parameter-only strings, and Premium, tank, fps, test). The three length warnings are the Japanese statutory titles.
- `tests/locales/turkish.test.ts` covers: the catalog is complete and ready, device choice, numbers, plurals, adjective + noun names, no suffix on a placeholder, unchanged canonical data, the pages, the account form and push text.
- The translation was written in nine parallel batches against one term list. A consistency pass afterwards unified Tempering (*su verme*), Settle the score (*Rövanş al*), the Season Scroll rail label (*Parşömen*), HP (*Can*), decimal commas and the jade pack names.

## Remaining before release

1. Deploy the server (Turkish push catalog and account form) before or with the game.
2. Native Turkish review, including the tutorial, purchases, safety text and legal pages, and a Turkish-law (KVKK, consumer law) review of the terms and privacy policy.
3. Physical iOS and Android checks, and uploading `docs/store/tr/` to App Store Connect and Google Play with Turkish screenshots.
4. Turkish moderation coverage: the chat filter's word list is English only.
