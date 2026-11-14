---
document_type: polish_implementation
schema_version: 1
language: pl
variant: Standard Polish (pl-PL), friendly informal ty (lowercase, also in the legal and support pages), gender-neutral towards the player and {name}
status: implemented_in_repo_release_checks_remain
measurements: SPANISH_SIZE.json (measured.pl)
---

# Polish translation

Polish (`pl`, script `Latn`) was released together with Russian and Ukrainian in commit `RELEASE_COMMIT`. It covers every namespace (3,022 entries), the six public pages and PWA manifest under `public/pl/`, the account-deletion form (`/account/delete?lang=pl`), server push text, iOS (`pl.lproj`) and Android (`values-pl`) resources, StoreKit fixtures (`pl`), and listing and product copy in `docs/store/pl/`. Terms: `locales/pl/TERMS.md`; reviewed warnings: `locales/pl/REVIEW.json`.

The translation is AI-written and validated by the repository checks below. **No native Polish speaker has reviewed it**, nor the legal pages.

## What Polish needed

| Issue | Rule |
|---|---|
| **Past tenses and adjectives agree in gender** (zbudowałeś/zbudowałaś, gotowy/gotowa). | No 1st- or 2nd-person past tense, no adjective describing the player, no past tense for `{name}`: present tense, imperative, impersonal forms (zbudowano, udało się) or nouns (`GLOSSARY.md`, Slavic languages). |
| **Seven cases; a placeholder cannot take an ending.** | Placeholders stay nominative after a colon (`Ulepsz: {building}`) or in apposition (`budynek {building}`). |
| **Generated names would need gender agreement.** | `generatedNames: noun-first`: noun, space, genitive noun (Przełęcz Gromu, Dolina Żelaza). |
| **ą ć ę ł ń ś ź ż are outside the bundled fonts' Latin-1 subsets**, so they would render in a fallback face mid-word. | `pl` is in `SYSTEM_FONT_LANGS` (`render/fonts.ts`, canvas text) and the `html:is([lang=…])` system-font rule in `styles.css`; `tests/locales/latin-fonts.test.ts` keeps it enforced. |

Conventions: names of buildings, warriors and resources capitalise every word (Twierdza Klanu, Tusz Cienia), plain text only the first; Japanese names in ordinary Latin spelling (Kaito, Takeda, Sensei Hoshi); brands unchanged; quotes „…”. Key terms: Twierdza Klanu, Jadeit, Zwój Sezonu, Próby Cienia, Bomba Dymna, Sabotażysta, Punkty Infiltracji, Sojusz, Banda, Stypendium Klanu; Liga Kage stays distinct from Liga Cienia.

`Intl.PluralRules('pl')` gives `one` (1 only), `few` (2–4, 22–24), `many` (0, 5–21, 25…) and `other` (fractions); every plural message has all four. `Intl` groups numbers of five or more digits with a no-break space (1234, 12 345) and writes Polish dates (14 listopada 2026).

## Storage

`npm run i18n:build` (`measured.pl`): 225,081 bytes UTF-8 (76,854 gzip, 65,396 Brotli) for 2,708 strings.

## Validation

- `npm run i18n:check -- pl`: no errors; English-identical entries (Shinobi, Sensei Hoshi, Kage, brands, placeholder-only strings) reviewed in `REVIEW.json`.
- Store copy limits checked with Node: App Store subtitle 28/30 characters, Play short description 66/80, keywords 90/100 bytes, promotional text 100/170; StoreKit names at most 30 characters (no `displayNames` override needed).

## Remaining before release

1. Deploy the server (Polish push catalog and account form) before or with the game.
2. Native Polish review of the game text, tutorial, purchase, safety and legal pages, and a Polish/EU-law review of the terms and privacy policy (GDPR, consumer rights for digital content).
3. Upload `docs/store/pl/` to App Store Connect and Google Play with Polish screenshots (`npm run store:screenshots -- --language=pl`); age rating (PEGI) through the stores.
4. Physical iOS and Android checks: language selection, `pl.lproj`/`values-pl` registration, Polish letters in device fonts on cheap Android phones, Polish keyboard input in chat, store purchase screens.
5. Polish moderation coverage: the chat filter's word list is English only.
6. Computer players' generated names (Kaito Mori) stay in Latin letters because they are stored text.
