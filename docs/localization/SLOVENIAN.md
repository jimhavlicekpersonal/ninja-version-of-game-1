---
document_type: slovenian_implementation
schema_version: 1
language: sl
variant: Standard Slovenian (sl-SI), friendly informal ti, no gender agreement with the player or {name}, dual plural forms
status: implemented_in_repo_release_checks_remain
measurements: SPANISH_SIZE.json (measured.sl)
---

# Slovenian translation

Slovenian (`sl`, script `Latn`) was released with Czech and Slovak in commit `d6ab7b8`. It covers every namespace (3,022 entries; 2,708 built strings), the six public pages and PWA manifest under `public/sl/`, and the store, native and server text in `docs/store/sl/` (`LOCALE.json`, `LISTING.md`), which the release integration wires into the account-deletion form (`/account/delete?lang=sl`), push text, iOS/Android resources and StoreKit fixtures. Terms: `locales/sl/TERMS.md`; reviewed warnings: `locales/sl/REVIEW.json`.

The translation is AI-written and validated by the repository checks below. **No native Slovenian speaker has reviewed it**, nor the legal pages.

## What Slovenian needed

| Issue | Handling |
|---|---|
| **A dual number.** Slovenian has singular, dual and plural: 1 bojevnik, 2 bojevnika, 3 bojevniki, 5 bojevnikov. | Every ICU plural writes `one`, `two`, `few` and `other` (`languages.json` note, `GLOSSARY.md`); `few` also takes fractions. |
| **Past tense and adjectives agree in gender** (zgradil/zgradila, pripravljen/pripravljena). The game does not know the gender of the player or a `{name}`. | Present tense, imperative, impersonal forms (zgrajeno, uspelo je) or nouns (`Zmaga: {name}`). `i18n:check` has no Slovenian-specific rule for this; it rests on the terms and AI review. |
| **Six cases; endings and agreeing prepositions cannot attach to a placeholder.** | Placeholders stay in the nominative, after a colon (`Izboljšaj: {building}`) or in apposition (`stavba {building}`); Jade amounts use the genitive (`{n} žada`). |
| **Letters outside the bundled Latin-1 fonts** (č š ž). | `sl` is in `SYSTEM_FONT_LANGS` and the system-font CSS rule (device fonts throughout); `latin-fonts.test.ts` enforces it. |
| **Capitalisation.** | Slovenian orthography: only the first word of a name is capitalised (Klanska trdnjava); resources are common nouns (kovanci, živež, žad); sensei Hoshi lowercase mid-sentence. |

Plural categories (`Intl.PluralRules('sl')`): `one`, `two`, `few` and `other`. Numbers group with dots and a decimal comma (1.234.567,5).

Generated names: `noun-first` (`locales/languages.json`). Second parts are nouns (Vrh, Prelaz, Dolina), first parts lowercase genitives that fit any gender: Prelaz groma, Dolina železa, Žerjav polnoči.

Key terms: Clan Keep = Klanska trdnjava, Jade = žad, Season Scroll = Sezonski zvitek (premium track: premijska pot), Clan Stipend = Klanska renta, Shadow Trials = Senčne preizkušnje, Alliance War = vojna zavezništev, Gang = tolpa, Smoke Bomb = dimna bomba, Infiltration Points = točke vdora. Store product names all fit 30 characters; `LOCALE.json` needs no `displayNames` override.

## Storage

`measured.sl` in `SPANISH_SIZE.json`: 216,197 bytes UTF-8 (73,653 gzip, 62,980 Brotli) for 2,708 strings.

## Validation

- `node tools/i18n/i18n.mjs check sl`: passes; English-identical entries (Shinobi, Kage, brands, placeholder-only strings) reviewed in `REVIEW.json`.
- `docs/store/sl/`: subtitle 24, Play short description 71, promotional text 101 characters, keywords 96 bytes; StoreKit names within 30 and descriptions within 55 characters; NFC, no invisible characters.
- No Slovenian-specific test file and no browser smoke run in Slovenian are recorded here.

## Remaining before release

1. Deploy the server (Slovenian push text and account form) before or with the game.
2. Native Slovenian review of the game text, tutorial, purchase, safety and legal pages; a Slovenian/EU law review of the terms and privacy policy.
3. Upload `docs/store/sl/` to App Store Connect and Google Play with Slovenian screenshots (`npm run store:screenshots -- --language=sl`).
4. Physical iOS and Android checks: language selection, `sl.lproj`/`values-sl`, the dual forms on screen, diacritics in cheap Android phones' fonts, chat input, store purchase screens.
5. Slovenian moderation coverage: the chat filter's word list is English only.
6. Computer players' generated names (Kaito Mori) stay in Latin letters because they are stored text.
