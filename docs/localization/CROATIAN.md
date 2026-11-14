---
document_type: croatian_implementation
schema_version: 1
language: hr
variant: Standard Croatian (hr-HR), friendly ti (lowercase), no past participle or adjective that agrees with the player, another player or {name}
status: implemented_in_repo_release_checks_remain
measurements: SPANISH_SIZE.json (measured.hr)
---

# Croatian translation

Croatian (`hr`, script `Latn`) was released in commit `RELEASE_COMMIT`. It covers every namespace, the six public pages and PWA manifest under `public/hr/`, the account-deletion form (`/account/delete?lang=hr`), server push text, native and StoreKit text from `docs/store/hr/LOCALE.json`, and listing copy in `docs/store/hr/LISTING.md`. Terms: `locales/hr/TERMS.md`; reviewed warnings: `locales/hr/REVIEW.json`.

The translation is AI-written and validated by the repository checks. **No native Croatian speaker has reviewed it**, nor the legal pages.

## What Croatian needed

| Issue | How it is handled |
|---|---|
| **Past tense and adjectives state gender.** *Pobijedio/Pobijedila si* says who the player is; the game knows nobody's gender. | `GLOSSARY.md` (Slavic languages) and `TERMS.md`: present tense, impersonal forms or nouns (*Pobjeda!*, *Imaš…*, *Dobivaš…*), never a past participle or adjective whose subject is the player, another player or `{name}`. This rule is written guidance; `i18n:check` has no Croatian-specific test for it. |
| **Case endings.** Nouns decline; nothing can attach to a placeholder. | Placeholders go after a colon or in apposition to a declined noun (`zgradu {building}`, `ratnika {troop}`, `Selo: {name}`); amounts avoid number agreement (`žad ({jade})`, `Žad: {n}`). |
| **Letters outside Latin-1.** č ć đ š ž are not in the bundled fonts' subsets. | `hr` is in `SYSTEM_FONT_LANGS` (`render/fonts.ts`) and the `html:is([lang=…])` rule in `styles.css`, so it uses the device fonts; `tests/locales/latin-fonts.test.ts` enforces it. |
| **Generated names.** The modifier follows the noun in Croatian place names. | `generatedNames: "noun-first"` in `locales/languages.json`; first parts are invariable genitives in lowercase, second parts capitalised nouns: Vrh + groma = *Vrh groma*, *Dolina magle*. |

Plural categories (`Intl.PluralRules('hr')`): `one`, `few`, `other` (1 ratnik, 2 ratnika, 5 ratnika, 21 ratnik); `GLOSSARY.md` also lists `many` for Croatian, which `Intl` does not return. Numbers are 1.234.567,5; percent 20 %; dates *14. studenoga 2026.* Quotation marks „…“. Time units `{d} d {h} h`, `{h} h {m} min`, `{m} min {s} s`.

## Terms

Utvrda klana (Clan Keep), žad (Jade, lowercase as a common noun), Sezonski svitak / premium staza, Klanska renta, Savez / Rat saveza, Banda / Rat bandi, Iskušenja sjene, Dimna bomba, Saboter, Točke infiltracije, Liga Kage distinct from Liga sjene. Full table in `TERMS.md`.

## Storage

`npm run i18n:build` (`measured.hr`): 215,735 bytes UTF-8 (73,805 gzip, 62,926 Brotli) for 2,708 strings.

## Remaining before release

1. Deploy the server (Croatian push catalog and account form) before or with the game.
2. Native Croatian review of the game text, tutorial, purchase, safety and legal pages, and a Croatian-law review of the terms and privacy policy (AZOP as supervisory authority).
3. Upload `docs/store/hr/` to App Store Connect and Google Play with Croatian screenshots (`npm run store:screenshots -- --language=hr`); age rating through the stores.
4. Physical iOS and Android checks: language selection, native resource registration, č ć đ in device fonts on cheap Android phones, store purchase screens.
5. Croatian moderation coverage: the chat filter's word list is English only.
6. Computer players' generated names (Kaito Mori) stay in Latin letters because they are stored text.
