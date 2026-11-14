---
document_type: indonesian_implementation
schema_version: 1
language: id
variant: Standard Indonesian (id-ID), friendly with kamu (-mu), aku for Sensei Hoshi, nothing attached to a placeholder
status: implemented_in_repo_release_checks_remain
measurements: SPANISH_SIZE.json (measured.id)
---

# Indonesian translation

Indonesian (`id`, script `Latn`) is released in commit `RELEASE_COMMIT`. It is served to `id`, `id-ID`, the legacy Android/Java code `in` (`LANGUAGE_ALIASES`), and Javanese (`jv`) and Sundanese (`su`) devices through `alsoFor`. It covers every namespace (2,708 strings in the measured pack), the public pages and PWA manifest under `public/id/`, the account-deletion form (`/account/delete?lang=id`), and the store copy in `docs/store/id/` (`LISTING.md`, `LOCALE.json`). Terms: `locales/id/TERMS.md`; reviewed warnings: `locales/id/REVIEW.json`.

The translation is AI-written and validated by the repository checks below. **No native Indonesian speaker has reviewed it**, nor the legal pages.

## What Indonesian needed

| Issue | Rule |
|---|---|
| **Enclitics on placeholders.** Indonesian attaches -nya, -mu, -ku to words; on `{name}` or a number that reads badly and cannot be checked. | `TERMS.md`: nothing attached to a placeholder (`desa {name}`, never `{name}-nya`). Possessives attach only to fixed words (desamu, prajuritmu). |
| **No grammatical gender, but register.** | The player is *kamu*; other players are their name, *lawan* or *pemain itu* (neutral *dia* allowed). |
| **Keep vs. fortress.** Both would naturally be *benteng*. | *Benteng* is only the Clan Keep; Shadow Trials fortresses are *kubu*. Kage League (*Liga Kage*) stays distinct from the Shadow League (*Liga Bayangan*). |
| **Generated names.** Indonesian puts the modifier after the noun. | `generatedNames: "noun-first"` in `languages.json`: Puncak + Guntur = Puncak Guntur, Gerbang Besi, Bilah Kembar. |

No language-specific checker rule was added; `npm run i18n:check -- id` applies the shared rules (placeholders, ICU, NFC, script share, length).

## Fonts

Indonesian uses only ASCII letters (plus the ō of Japanese names, which English already uses), so it keeps the bundled Latin-1 fonts; `tests/locales/latin-fonts.test.ts` covers it.

## Plurals and numbers

`Intl.PluralRules('id')` gives only `other`; the number comes before an unchanged noun ({n} prajurit, {n} bangunan). `Intl` writes 1.234.567,5. Short times: {d}h {h}j, {h}j {m}m, {m}m {s}d.

## Storage

`npm run i18n:build` (`measured.id`): 216,201 bytes UTF-8 (69,834 gzip, 59,398 Brotli) for 2,708 strings.

## Validation

- `npm run i18n:check -- id`: no errors; English-identical entries (Japanese names, Shinobi, brands, placeholder-only strings) reviewed in `REVIEW.json`.
- Store copy lengths checked with Node: subtitle 28/30, short description 69/80, keywords 89/100 bytes, StoreKit names and descriptions within 30/55. No `displayNames` override was needed.
- No Indonesian-specific test file and no Chromium smoke run were made for this release; emulation would not be physical-device evidence anyway.

## Remaining before release

1. Deploy the server (Indonesian push text and account form) before or with the game.
2. Native Indonesian review of the game text, tutorial, purchase, safety and legal pages, and an Indonesian-law review of the terms and privacy policy (Personal Data Protection Law 27/2022) and of the electronic-system-operator (PSE) registration Indonesia requires of online services.
3. Upload `docs/store/id/` to App Store Connect and Google Play with Indonesian screenshots (`npm run store:screenshots -- --language=id`); age rating through the stores.
4. Physical iOS and Android checks: language selection (including `in-ID` and Javanese/Sundanese devices), native resources, store purchase screens.
5. Indonesian moderation coverage: the chat filter's word list is English only.
