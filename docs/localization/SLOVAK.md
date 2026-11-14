---
document_type: slovak_implementation
schema_version: 1
language: sk
variant: Standard Slovak (sk-SK), friendly informal ty, no gendered past tense or adjectives for the player or {name}
status: implemented_in_repo_release_checks_remain
measurements: SPANISH_SIZE.json (measured.sk)
---

# Slovak translation

Slovak (`sk`, script `Latn`) was released with Czech and Slovenian in commit `RELEASE_COMMIT`. It covers every namespace (3,022 entries; 2,708 built strings), the six public pages and PWA manifest under `public/sk/`, and the store, native and server text in `docs/store/sk/` (`LOCALE.json`, `LISTING.md`), which the release integration wires into the account-deletion form (`/account/delete?lang=sk`), push text, iOS/Android resources and StoreKit fixtures. Terms: `locales/sk/TERMS.md`; reviewed warnings: `locales/sk/REVIEW.json`.

The translation is AI-written and validated by the repository checks below. **No native Slovak speaker has reviewed it**, nor the legal pages.

## What Slovak needed

| Issue | Handling |
|---|---|
| **Past tense and adjectives agree in gender** (postavil si / postavila si, pripravený/pripravená). The game does not know the gender of the player or a `{name}`. | `GLOSSARY.md` (Slavic languages) and `TERMS.md`: present tense, imperative, impersonal forms (podarilo sa, postavené) or nouns (`Víťaz: {name}`). `i18n:check` has no Slovak-specific rule for this; it rests on the terms and AI review. |
| **Six cases; endings cannot attach to a placeholder.** | Placeholders stay in the nominative, after a colon (`Vylepšiť: {building}`) or in apposition (`budova {building}`); a bare `{n}` before a noun is avoided (`Bojovníci: {n}`), Jade amounts use the genitive (`{n} Nefritu`). |
| **Letters outside the bundled Latin-1 fonts** (ľ ĺ ŕ č ť š ž ď ň). | `sk` is in `SYSTEM_FONT_LANGS` and the system-font CSS rule (device fonts throughout); `latin-fonts.test.ts` enforces it. |
| **Capitalisation and quotes.** | Only the first word of a name is capitalised (Pevnosť klanu, Tieňový atrament); the resources keep the game's capitals (Mince, Zásoby, Nefrit); quotes „ “. |

Plural categories (`Intl.PluralRules('sk')`): `one`, `few`, `many` (fractions) and `other` (0 and 5+); every ICU message writes all four. Numbers group with a narrow space and a decimal comma (1 234 567,5).

Generated names: `noun-first` (`locales/languages.json`). Second parts are capitalised nouns (Štít, Priesmyk, Údolie), first parts lowercase genitives that fit any gender: Priesmyk hromu, Údolie železa (also Alliance names).

Key terms: Clan Keep = Pevnosť klanu, Jade = Nefrit, Season Scroll = Sezónny zvitok (premium track: prémiová cesta), Clan Stipend = Klanový žold, Shadow Trials = Skúšky tieňa, Alliance War = Vojna aliancií, Gang = Banda, Smoke Bomb = Dymovnica, Infiltration Points = Body infiltrácie. Store product names all fit 30 characters; `LOCALE.json` needs no `displayNames` override.

## Storage

`measured.sk` in `SPANISH_SIZE.json`: 223,097 bytes UTF-8 (76,800 gzip, 65,045 Brotli) for 2,708 strings.

## Validation

- `node tools/i18n/i18n.mjs check sk`: passes; English-identical entries (Shinobi, Kage, brands, placeholder-only strings) reviewed in `REVIEW.json`.
- `docs/store/sk/`: subtitle 30, Play short description 78, promotional text 87 characters, keywords 95 bytes; StoreKit names within 30 and descriptions within 55 characters; NFC, no invisible characters.
- No Slovak-specific test file and no browser smoke run in Slovak are recorded here.

## Remaining before release

1. Deploy the server (Slovak push text and account form) before or with the game.
2. Native Slovak review of the game text, tutorial, purchase, safety and legal pages; a Slovak/EU law review of the terms and privacy policy.
3. Upload `docs/store/sk/` to App Store Connect and Google Play with Slovak screenshots (`npm run store:screenshots -- --language=sk`).
4. Physical iOS and Android checks: language selection, `sk.lproj`/`values-sk`, diacritics in cheap Android phones' fonts, chat input, store purchase screens.
5. Slovak moderation coverage: the chat filter's word list is English only.
6. Computer players' generated names (Kaito Mori) stay in Latin letters because they are stored text.
