---
document_type: czech_implementation
schema_version: 1
language: cs
variant: Standard Czech (cs-CZ), friendly informal ty (lowercase), no gendered past tense or adjectives for the player or a {name}
status: implemented_in_repo_release_checks_remain
measurements: SPANISH_SIZE.json (measured.cs)
---

# Czech translation

Czech (`cs`, script `Latn`) was released with Slovak and Slovenian in commit `d6ab7b8`. It covers every namespace (3,022 entries; 2,708 built strings), the six public pages and PWA manifest under `public/cs/`, and the store, native and server text in `docs/store/cs/` (`LOCALE.json`, `LISTING.md`), which the release integration wires into the account-deletion form (`/account/delete?lang=cs`), push text, iOS/Android resources and StoreKit fixtures. Terms: `locales/cs/TERMS.md`; reviewed warnings: `locales/cs/REVIEW.json`.

The translation is AI-written and validated by the repository checks below. **No native Czech speaker has reviewed it**, nor the legal pages.

## What Czech needed

| Issue | Handling |
|---|---|
| **Past tense, conditionals and adjectives agree in gender** (postavil/postavila, připraven/připravena, abys mohl/mohla). The game does not know the gender of the player or a `{name}`. | `GLOSSARY.md` (Slavic languages) and `TERMS.md`: present tense, imperative, impersonal forms (podařilo se, bylo postaveno) or nouns (`Vítěz: {name}`). `i18n:check` has no Czech-specific rule for this; it rests on the terms and AI review. |
| **Seven cases; endings cannot attach to a placeholder.** | Placeholders stay in the nominative, after a colon (`Vylepšit: {building}`) or in apposition (`budova {building}`). Amounts of Jade use the genitive that fits any number (`{n} nefritu`) or a colon (`Potřebný nefrit: {n}`). |
| **Letters outside the bundled Latin-1 fonts** (ě š č ř ž ů ď ť ň). | `cs` is in `SYSTEM_FONT_LANGS` and the system-font CSS rule (device fonts throughout); `latin-fonts.test.ts` enforces it. |
| **Capitalisation.** | Only the first word of a building, warrior or resource name is capitalised (Klanová pevnost, Věž s kunai); resources are common nouns (nefrit, proviant). |

Plural categories (`Intl.PluralRules('cs')`): `one`, `few`, `many` (fractions) and `other` (0 and 5+); every ICU message writes all four. Numbers group with a narrow space and a decimal comma (1 234 567,5).

Generated names: `noun-first` (`locales/languages.json`). Second parts are nominative nouns (Vrchol, Průsmyk, Údolí), first parts genitive nouns that fit any gender: Průsmyk Hromu, Údolí Železa.

Key terms: Clan Keep = Klanová pevnost, Jade = nefrit, Season Scroll = Sezónní svitek (premium track: prémiová cesta), Clan Stipend = Klanový žold, Shadow Trials = Stínové zkoušky, Alliance War = Válka aliancí, Smoke Bomb = Dýmovnice, Infiltration Points = Body průniku. Store product names all fit 30 characters; `LOCALE.json` needs no `displayNames` override.

## Storage

`measured.cs` in `SPANISH_SIZE.json`: 222,932 bytes UTF-8 (76,785 gzip, 64,924 Brotli) for 2,708 strings.

## Validation

- `node tools/i18n/i18n.mjs check cs`: passes; English-identical entries (Shinobi, Kage, brands, placeholder-only strings) reviewed in `REVIEW.json`.
- `docs/store/cs/`: subtitle 30, Play short description 79, promotional text 94 characters, keywords 96 bytes; StoreKit names within 30 and descriptions within 55 characters; NFC, no invisible characters.
- No Czech-specific test file and no browser smoke run in Czech are recorded here.

## Remaining before release

1. Deploy the server (Czech push text and account form) before or with the game.
2. Native Czech review of the game text, tutorial, purchase, safety and legal pages; a Czech/EU law review of the terms and privacy policy.
3. Upload `docs/store/cs/` to App Store Connect and Google Play with Czech screenshots (`npm run store:screenshots -- --language=cs`).
4. Physical iOS and Android checks: language selection, `cs.lproj`/`values-cs`, diacritics in cheap Android phones' fonts, chat input, store purchase screens.
5. Czech moderation coverage: the chat filter's word list is English only.
6. Computer players' generated names (Kaito Mori) stay in Latin letters because they are stored text.
