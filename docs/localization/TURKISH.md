---
document_type: turkish_implementation
schema_version: 1
language: tr
variant: Standard Turkish (tr-TR), informal sen in the game, formal siz in legal pages, no suffix on a placeholder
status: implemented_in_repo_release_checks_remain
measurements: SPANISH_SIZE.json (measured.tr)
---

# Turkish translation

Turkish (`tr`, script `Latn`) is released in commit `RELEASE_COMMIT`. It is served to `tr` devices with any region (`tr-TR`, `tr-CY`). It covers every namespace (2,708 strings in the measured pack), the public pages and PWA manifest under `public/tr/`, the account-deletion form (`/account/delete?lang=tr`), and the store copy in `docs/store/tr/` (`LISTING.md`, `LOCALE.json`). Terms: `locales/tr/TERMS.md`; reviewed warnings: `locales/tr/REVIEW.json`.

The translation is AI-written and validated by the repository checks below. **No native Turkish speaker has reviewed it**, nor the legal pages.

## What Turkish needed

| Issue | Fix |
|---|---|
| **Suffixes follow vowel harmony and the last sound,** which the game cannot know for `{name}`, `{building}` or a number (`{n}'den`, `{building}ı`). | `GLOSSARY.md` (Turkish, Hungarian and Finnish) and `TERMS.md`: a colon or a noun after the placeholder carries the suffix (`Köy: {name}`, `{name} adlı oyuncu`, `{n} savaşçıyı`). `suffixAfterPlaceholder` (`SUFFIXING` in `tools/i18n/lib.mjs`) makes `i18n:check` fail on a letter, apostrophe or hyphen suffix after a placeholder or `#`. |
| **Percent sign comes first.** | `%{pct}` in Turkish text, unless `{pct}` already carries the sign. |
| **Dotted and dotless i** (i/İ, ı/I) are separate letters. | Written as such in the catalogs; `<html lang="tr">` lets the browser case them correctly. |
| **Generated names.** Turkish puts the modifier first. | Default order, no `generatedNames` setting: bare first parts (Demir, Kara, İkiz) and second parts with no possessive suffix (Tepe, Kaya, Kapı). |

## Fonts

ğ ı ş İ Ş are outside the bundled fonts' Latin-1 subsets, so `tr` is in `SYSTEM_FONT_LANGS` (`render/fonts.ts`) and the `html:is([lang=…])` rule in `styles.css` and uses the device fonts throughout; `tests/locales/latin-fonts.test.ts` keeps this enforced.

## Plurals and numbers

`Intl.PluralRules('tr')` gives `one` and `other`, but the noun stays singular after a number, so both branches are usually the same (`{n, plural, one {# savaşçı} other {# savaşçı}}`). `Intl` writes 1.234.567,5. Times: {d} g {h} sa, {h} sa {m} dk, {m} dk {s} sn.

## Storage

`npm run i18n:build` (`measured.tr`): 219,911 bytes UTF-8 (72,807 gzip, 61,846 Brotli) for 2,708 strings.

## Validation

- `npm run i18n:check -- tr`: no errors; English-identical entries (Japanese names, Shinobi, brands, placeholder-only strings) reviewed in `REVIEW.json`; one length warning is the Japanese statutory title.
- Store copy lengths checked with Node: subtitle 29/30, short description 67/80, keywords 88/100 bytes, StoreKit names and descriptions within 30/55 (the stipend reads `{jade} Yeşimlik {payments} günlük ödeme`, so no suffix follows a placeholder). No `displayNames` override was needed.
- No Turkish-specific test file and no Chromium smoke run were made for this release; emulation would not be physical-device evidence anyway.

## Remaining before release

1. Deploy the server (Turkish push text and account form) before or with the game.
2. Native Turkish review of the game text, tutorial, purchase, safety and legal pages, and a Turkish-law review of the terms and privacy policy (KVKK, Law 6698 on personal data) and the consumer and distance-sales rules.
3. Upload `docs/store/tr/` to App Store Connect and Google Play with Turkish screenshots (`npm run store:screenshots -- --language=tr`); age rating through the stores.
4. Physical iOS and Android checks: system-font rendering of ğ ı ş İ on cheap Android phones, language selection, native resources, Turkish keyboard input in chat, store purchase screens.
5. Turkish moderation coverage: the chat filter's word list is English only.
