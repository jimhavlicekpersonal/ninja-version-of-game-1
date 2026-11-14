---
document_type: amharic_implementation
schema_version: 1
language: am
variant: Standard Amharic (am-ET), Ge'ez script, polite gender-neutral እርስዎ with plural-of-respect imperatives
status: implemented_in_repo_release_checks_remain
measurements: SPANISH_SIZE.json (measured.am)
---

# Amharic translation

Amharic (`am`, script `Ethi`) was released in commit `RELEASE_COMMIT`. It covers every namespace (3,022 entries; 2,705 strings in the built pack), the public pages and PWA manifest under `public/am/`, the account-deletion form (`/account/delete?lang=am`), and the store copy and native/StoreKit text in `docs/store/am/` (`LISTING.md`, `LOCALE.json`). Terms: `locales/am/TERMS.md`; reviewed warnings: `locales/am/REVIEW.json`.

The translation is AI-written and validated by the repository checks below. **No native Amharic speaker has reviewed it**, nor the legal pages.

## What Amharic needed

| Issue | Handling |
|---|---|
| **Singular "you" and imperatives state gender** (ገንባ/ገንቢ). | The player is እርስዎ with possessive -ዎ and plural-of-respect imperatives (ይገንቡ, ያሻሽሉ); a player or `{name}` in the third person takes honorific plural verbs (አሸንፈዋል), which state no gender. |
| **Prefixes and suffixes** (የ, በ, ለ, ከ, -ን, -ም) cannot attach to a placeholder or `#`. | A colon with the Ethiopic label colon ፦ (`ዝግጁ፦ {building}`) or a noun beside the placeholder. |
| **Ethiopic punctuation.** | ። and ፣ inside sentences (`GLOSSARY.md`, Indic/Amharic section). |
| **Script.** Ge'ez letters are not in the bundled fonts. | Rendered with the system fallback font; the `i18n:check` script-share warning recognises `Ethi`, and vowel-sign marks count as letters. |
| **Generated names.** | Default order (first part, space, second part): የነጎድጓድ + ጫፍ = የነጎድጓድ ጫፍ; no `generatedNames` value. Japanese names are transliterated (Kaito ካይቶ). |

`Intl` gives the plural (`one` for 0 and 1, and `other`), comma-grouped numbers (1,234,567) and dates (14 ኖቬምበር 2026). No language-specific `i18n:check` rule exists for Amharic beyond the shared ones.

Key terms: Jade = ጄድ, Season Scroll = የወቅት ጥቅልል (premium: ፕሪሚየም የወቅት ጥቅልል), Clan Keep = የጎሳ ምሽግ, Clan Stipend = የጎሳ ድጎማ. All store product names in `data.json` fit Apple's 30 characters, so `LOCALE.json` has no `displayNames` overrides.

## Storage

`npm run i18n:build` (`measured.am`): 286,919 bytes UTF-8 (80,961 gzip, 65,410 Brotli) for 2,705 strings.

## Validation

- `npm run i18n:check -- am`: catalog complete; English-identical entries (brands) reviewed in `REVIEW.json`.
- Store copy limits checked with node: App Store subtitle 20/30, Play short description 49/80, promotional text 60/170, keywords 99/100 bytes (Ge'ez letters are 3 bytes each); `LOCALE.json` StoreKit strings within 30/55.
- No Amharic-specific test file and no browser smoke run recorded for this language yet.

## Remaining before release

1. Deploy the server (push text and account form) before or with the game.
2. Native Amharic review of the game text, tutorial, purchase, safety and legal pages, and an Ethiopia-law review of the terms and privacy policy (Personal Data Protection Proclamation No. 1321/2024).
3. App Store Connect offers no Amharic listing locale (`appStore: false`); upload `docs/store/am/` to Google Play with Amharic screenshots (`npm run store:screenshots -- --language=am`, which needs a font with Ge'ez letters).
4. Physical iOS and Android checks: language selection, native resource registration, Ethiopic glyphs in cheap Android phones' system fonts, Amharic keyboard input in chat, store purchase screens.
5. Amharic moderation coverage: the chat filter's word list is English only.
6. Computer players' generated names (Kaito Mori) stay in Latin letters because they are stored text.
