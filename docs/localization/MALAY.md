---
document_type: malay_implementation
schema_version: 1
language: ms
variant: Malaysian Malay (ms-MY), kamu in the game, anda in web and legal pages, saya for Sensei Hoshi
status: implemented_in_repo_release_checks_remain
measurements: SPANISH_SIZE.json (measured.ms)
---

# Malay translation

Malay (`ms`, script `Latn`) is released in commit `RELEASE_COMMIT`. It is served to `ms` devices with any region (`ms-MY`, `ms-SG`, `ms-BN`). It covers every namespace (2,708 strings in the measured pack), the public pages and PWA manifest under `public/ms/`, the account-deletion form (`/account/delete?lang=ms`), and the store copy in `docs/store/ms/` (`LISTING.md`, `LOCALE.json`). Terms: `locales/ms/TERMS.md`; reviewed warnings: `locales/ms/REVIEW.json`.

The translation is AI-written and validated by the repository checks below. **No native Malay speaker has reviewed it**, nor the legal pages.

## What Malay needed

| Issue | Rule |
|---|---|
| **Malay is not Indonesian.** The two share most grammar but differ in everyday words; mixing them reads as foreign in Malaysia. | `languages.json` note and `TERMS.md`: Malaysian vocabulary (*kedai*, *tetapan*, *kemas kini*, *percuma*, *akaun*, *telefon*, *Jed*, *Kubu*). No checker rule enforces this yet. |
| **Two registers.** | *kamu* in the game and chat, *anda* in the web and legal pages; Sensei Hoshi says *saya*; player-typed labels and bot chat use *aku*. |
| **No grammatical gender.** | *dia* is neutral, so nothing agrees with `{name}` or the player. |
| **Generated names.** Malay puts the modifier after the noun. | `generatedNames: "noun-first"`: Puncak + Guruh = Puncak Guruh; first parts take no *yang* or *milik*. |

`npm run i18n:check -- ms` applies the shared rules (placeholders, ICU, NFC, script share, length).

## Fonts

Malay uses only ASCII letters (plus the ō of Japanese names, which English already uses), so it keeps the bundled Latin-1 fonts; `tests/locales/latin-fonts.test.ts` covers it.

## Plurals and numbers

`Intl.PluralRules('ms')` gives only `other`; the number comes before the noun with no reduplication ({n} pahlawan, {n} kali). `Intl` writes 1,234,567.5. Times: {d} hari {h} jam, {h} jam {m} min.

## Storage

`npm run i18n:build` (`measured.ms`): 221,678 bytes UTF-8 (70,503 gzip, 59,762 Brotli) for 2,708 strings.

## Validation

- `npm run i18n:check -- ms`: no errors; English-identical entries (Japanese names, Shinobi, brands, time units, placeholder-only strings) reviewed in `REVIEW.json`.
- Store copy lengths checked with Node: subtitle 30/30, short description 69/80, keywords 94/100 bytes, StoreKit names and descriptions within 30/55. No `displayNames` override was needed.
- No Malay-specific test file and no Chromium smoke run were made for this release; emulation would not be physical-device evidence anyway.

## Remaining before release

1. Deploy the server (Malay push text and account form) before or with the game.
2. Native Malaysian Malay review of the game text, tutorial, purchase, safety and legal pages (in particular for Indonesian words), and a Malaysian-law review of the terms and privacy policy (Personal Data Protection Act 2010 as amended in 2024).
3. Upload `docs/store/ms/` to App Store Connect and Google Play with Malay screenshots (`npm run store:screenshots -- --language=ms`); age rating through the stores.
4. Physical iOS and Android checks: language selection, native resources, store purchase screens.
5. Malay moderation coverage: the chat filter's word list is English only.
