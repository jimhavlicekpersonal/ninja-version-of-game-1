---
document_type: igbo_implementation
schema_version: 1
language: ig
variant: Standard Igbo (Igbo Izugbe, Nigeria), informal singular gị, dotted vowels ị ọ ụ and ṅ, tone marks only where needed to tell words apart
status: implemented_in_repo_release_checks_remain
measurements: SPANISH_SIZE.json (measured.ig)
---

# Igbo translation

Igbo (`ig`, script `Latn`) was released in commit `RELEASE_COMMIT`. It covers every namespace (3,022 entries; 2,705 strings in the built pack), the public pages and PWA manifest under `public/ig/`, the account-deletion form (`/account/delete?lang=ig`), and the store copy and native/StoreKit text in `docs/store/ig/` (`LISTING.md`, `LOCALE.json`). Terms: `locales/ig/TERMS.md`; reviewed warnings: `locales/ig/REVIEW.json`.

The translation is AI-written and validated by the repository checks below. **No native Igbo speaker has reviewed it**, nor the legal pages.

## What Igbo needed

| Issue | Handling |
|---|---|
| **Dotted vowels and ṅ.** ị ọ ụ ṅ are outside the bundled display font's Latin-1 subset and would render in a fallback face mid-word. | `ig` is in `SYSTEM_FONT_LANGS` (canvas text) and the system-font CSS rule; `latin-fonts.test.ts` keeps it enforced. Text is NFC (precomposed letters), which `i18n:check` enforces. |
| **No grammatical gender.** The pronoun ọ/o names no gender, so it is safe for the player, `{name}` and bots. | Player addressed as gị; no extra checker rule needed. |
| **Noun before modifier and owner; numbers after the noun.** | `obodo {name}`, `Kwalite {building}`, `ndị dike {n}`; nothing is attached to a placeholder (`GLOSSARY.md`, African Latin-script section). |
| **Generated names in the wrong order.** | `generatedNames: noun-first` in `locales/languages.json`: Ugwu + Egbe Eluigwe = Ugwu Egbe Eluigwe. |

`Intl` gives the plural (`other` only, so plural messages need only that branch), comma-grouped numbers (1,234,567) and dates (14 Novemba 2026). No language-specific `i18n:check` rule exists for Igbo beyond the shared ones (placeholders, NFC, invisible characters, script share).

Key terms: Jade = Jed, Season Scroll = Mpịakọta Oge (premium: Mpịakọta Oge pụrụ iche), Clan Keep = Obi Agbụrụ, Clan Stipend = Ụgwọ Agbụrụ. All store product names in `data.json` fit Apple's 30 characters, so `LOCALE.json` has no `displayNames` overrides.

## Storage

`npm run i18n:build` (`measured.ig`): 230,376 bytes UTF-8 (70,335 gzip, 59,391 Brotli) for 2,705 strings.

## Validation

- `npm run i18n:check -- ig`: catalog complete; English-identical entries (Shinobi, Kage, brands, Japanese names) reviewed in `REVIEW.json`.
- Store copy limits checked with node: App Store subtitle 27/30, Play short description 67/80, promotional text 106/170, keywords 90/100 bytes; `LOCALE.json` StoreKit strings within 30/55.
- No Igbo-specific test file and no browser smoke run recorded for this language yet.

## Remaining before release

1. Deploy the server (push text and account form) before or with the game.
2. Native Igbo review of the game text, tutorial, purchase, safety and legal pages, and a Nigeria-law review of the terms and privacy policy (Nigeria Data Protection Act 2023).
3. App Store Connect offers no Igbo listing locale (`appStore: false`); check whether Google Play Console offers Igbo before uploading `docs/store/ig/`, with Igbo screenshots (`npm run store:screenshots -- --language=ig`).
4. Physical iOS and Android checks: language selection, native resource registration, dotted vowels in cheap Android phones' system fonts, keyboard input of ị ọ ụ ṅ in chat, store purchase screens.
5. Igbo moderation coverage: the chat filter's word list is English only.
6. Computer players' generated names (Kaito Mori) stay in Latin letters because they are stored text.
