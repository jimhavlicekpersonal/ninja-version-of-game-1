---
document_type: hungarian_implementation
schema_version: 1
language: hu
variant: Standard Hungarian (hu-HU), friendly te; Sensei Hoshi is Hoshi mester and also uses te
status: implemented_in_repo_release_checks_remain
measurements: SPANISH_SIZE.json (measured.hu)
---

# Hungarian translation

Hungarian (`hu`, script `Latn`) was released in commit `d6ab7b8`. It covers every namespace, the six public pages and PWA manifest under `public/hu/`, the account-deletion form (`/account/delete?lang=hu`), server push text, native and StoreKit text from `docs/store/hu/LOCALE.json`, and listing copy in `docs/store/hu/LISTING.md`. Terms: `locales/hu/TERMS.md`; reviewed warnings: `locales/hu/REVIEW.json`.

The translation is AI-written and validated by the repository checks. **No native Hungarian speaker has reviewed it**, nor the legal pages.

## What Hungarian needed

| Issue | How it is handled |
|---|---|
| **Suffixes follow vowel harmony and the last sound.** *-ban/-ben*, *-nak/-nek*, *-szor/-szer/-ször* depend on the word, which the game cannot know for `{name}`, `{building}`, `{troop}` or a number. | `hu` is in `SUFFIXING` (`tools/i18n/lib.mjs`): `i18n:check` fails on a letter, apostrophe suffix or hyphen suffix right after a placeholder or `#`. Rephrase with a colon (`Kész: {building}`) or a carrier noun (`{building} épület`, `{name} nevű játékos`, `{n} alkalommal`). |
| **Article a/az depends on the next sound.** | No article directly before a placeholder (`TERMS.md`). |
| **Numbers take the singular.** | `{n} harcos`; the `one` and `other` branches have the same structure. |
| **Letters outside Latin-1.** ő and ű are not in the bundled fonts' subsets. | `hu` is in `SYSTEM_FONT_LANGS` (`render/fonts.ts`) and the `html:is([lang=…])` rule in `styles.css`; `tests/locales/latin-fonts.test.ts` enforces it. |

Generated names use the default order (first part, space, second part), since the Hungarian attribute precedes the noun and does not agree: *Mennydörgő* + *Csúcs* = *Mennydörgő Csúcs*. First parts are uninflected adjectives or attributive nouns.

Plural categories (`Intl.PluralRules('hu')`): `one`, `other`. Numbers are 1 234 567,5 (no-break space); percent 20%; dates *2026. november 14.* Quotation marks „…”. Time units `{d} n {h} ó`, `{h} ó {m} p`, `{m} p {s} mp`. Names capitalise only the first word (*Kunai-torony*, *Gyakorló dódzsó*).

## Terms

Klánvár / Vár, Jáde, Szezontekercs / prémium sáv, Klánjáradék, Szövetség / Szövetségi háború, Banda / Bandaháború, Árnypróbák, Füstbomba, Szabotőr, Beszivárgási pontok, Kage liga distinct from Árnyliga. Full table in `TERMS.md`.

## Storage

`npm run i18n:build` (`measured.hu`): 227,710 bytes UTF-8 (77,193 gzip, 65,199 Brotli) for 2,708 strings.

## Remaining before release

1. Deploy the server (Hungarian push catalog and account form) before or with the game.
2. Native Hungarian review of the game text, tutorial, purchase, safety and legal pages, and a Hungarian-law review of the terms and privacy policy (NAIH as supervisory authority).
3. Upload `docs/store/hu/` to App Store Connect and Google Play with Hungarian screenshots (`npm run store:screenshots -- --language=hu`); age rating through the stores.
4. Physical iOS and Android checks: language selection, native resource registration, ő and ű in device fonts on cheap Android phones, store purchase screens.
5. Hungarian moderation coverage: the chat filter's word list is English only.
6. Computer players' generated names (Kaito Mori) stay in Latin letters because they are stored text.
