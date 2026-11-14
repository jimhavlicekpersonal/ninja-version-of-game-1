---
document_type: finnish_implementation
schema_version: 1
language: fi
variant: Standard Finnish (fi-FI, yleiskieli), friendly and relaxed sinä, preferring imperative or passive forms over the pronoun
status: implemented_in_repo_release_checks_remain
measurements: SPANISH_SIZE.json (measured.fi)
---

# Finnish translation

Finnish (`fi`, script `Latn`) was released in commit `d6ab7b8`. It covers every namespace, the six public pages and PWA manifest under `public/fi/`, the account-deletion form (`/account/delete?lang=fi`), server push text, native and StoreKit text from `docs/store/fi/LOCALE.json`, and listing copy in `docs/store/fi/LISTING.md`. Terms: `locales/fi/TERMS.md`; reviewed warnings: `locales/fi/REVIEW.json`.

The translation is AI-written and validated by the repository checks. **No native Finnish speaker has reviewed it**, nor the legal pages.

## What Finnish needed

| Issue | How it is handled |
|---|---|
| **Case endings attach to words.** *-n*, *-ssa/-ssä*, *-lla/-llä* follow vowel harmony and the word's stem, which the game cannot know for `{name}`, `{building}`, `{troop}` or a number. | The `fi` note in `locales/languages.json` ("rephrase so {n} needs none"); `fi` is in `SUFFIXING` (`tools/i18n/lib.mjs`), so `i18n:check` fails on a letter, apostrophe or hyphen suffix right after a placeholder or `#`. Rephrase with a colon (`Valmis: {building}`), a carrier noun (`rakennus {building}`, `pelaaja {name}`) or a form where the placeholder stays in the basic form (`Päivitä {building}`). |
| **Numerals take the partitive.** | ICU plurals: `one` only for 1 (`# soturi`), `other` partitive (`# soturia`, also 0); a bare `{n}` outside a plural goes after a colon or after the noun (`Jadea {jade}`). |
| **Generated names.** Finnish joins the parts into one word. | `generatedNames: "compound"`: first parts are stems or genitives (Hiljais, Ukkos, Rauta, Pajun), second parts nouns in the basic form: *Ukkoshuippu*, *Rautaportti*, *Hiljaissola*. |

Fonts: Finnish letters (ä ö å) are inside the Latin-1 subsets, so Finnish keeps the bundled fonts and is not in `SYSTEM_FONT_LANGS`; `tests/locales/latin-fonts.test.ts` covers this. No grammatical gender; players are referred to by name rather than *hän*.

Plural categories (`Intl.PluralRules('fi')`): `one`, `other`. Numbers are 1 234 567,5 (no-break space); percent 20 %; dates *14. marraskuuta 2026*. Quotation marks ”…” (U+201D on both sides). Time units `{d} pv {h} t`, `{h} t {m} min`, `{m} min {s} s`.

## Terms

Klaanilinna / Linna, Jade, Kausikäärö / premium-polku, Klaanin apuraha, Liitto / Liittosota, Jengi / Jengisota, Varjokoetukset, Savupommi, Sabotööri, Soluttautumispisteet, Kage-liiga distinct from Varjoliiga. GDPR terms follow the Finnish text of the regulation. Full table in `TERMS.md`.

## Storage

`npm run i18n:build` (`measured.fi`): 219,753 bytes UTF-8 (73,877 gzip, 63,181 Brotli) for 2,708 strings.

## Remaining before release

1. Deploy the server (Finnish push catalog and account form) before or with the game.
2. Native Finnish review of the game text, tutorial, purchase, safety and legal pages, and a Finnish-law review of the terms and privacy policy (the Office of the Data Protection Ombudsman as supervisory authority).
3. Upload `docs/store/fi/` to App Store Connect and Google Play with Finnish screenshots (`npm run store:screenshots -- --language=fi`); age rating through the stores.
4. Physical iOS and Android checks: language selection, native resource registration, store purchase screens. Devices listing Finnish first previously fell back to Swedish; check they now get Finnish.
5. Finnish moderation coverage: the chat filter's word list is English only.
6. Computer players' generated names (Kaito Mori) stay in Latin letters because they are stored text.
