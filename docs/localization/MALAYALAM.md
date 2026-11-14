---
document_type: malayalam_implementation
schema_version: 1
language: ml
variant: Standard friendly Malayalam (ml-IN), നിങ്ങൾ for the player, short verb forms on buttons
status: implemented_in_repo_release_checks_remain
measurements: SPANISH_SIZE.json (measured.ml)
---

# Malayalam translation

Malayalam (`ml`, script `Mlym`, left to right, wave 3) is complete in every namespace (`boot`, `ui`, `data`, `messages`, `pages`), with the six public pages and PWA manifest under `public/ml/` and listing and store-integration copy in `docs/store/ml/` (`LISTING.md`, `LOCALE.json`), added in `d6ab7b8`. Terms: `locales/ml/TERMS.md`; reviewed warnings: `locales/ml/REVIEW.json`.

The translation is AI-written and validated by the repository checks. **No native Malayalam speaker has reviewed it**, nor the legal pages.

## What Malayalam needed

| Issue | Handling |
|---|---|
| **Gendered words.** അവൻ/അവൾ and the -കാരൻ/-കാരി endings state gender; players and {name} have none. | Repeat the name, or use അവർ or എതിരാളി; leader is the neutral നേതാവ്. |
| **Suffixes join the word.** Case endings (-ന്റെ, -ന്, -ൽ) fuse with the noun before them. | Glossary rule for the Dravidian languages: nothing directly after `{name}`, `{building}`, `{n}` or `#`; a colon (`ഗ്രാമം: {name}`) or a noun that carries the ending (`{building} എന്ന കെട്ടിടത്തിന്`, `{n} തവണ`). This is a translation rule, not an `i18n:check` error (the suffix check covers only Turkish, Hungarian and Finnish). |
| **Two ways to write chillu letters.** ൻ ർ ൽ ൾ ൺ can be atomic code points or consonant + virama + ZWJ; mixing them breaks search and matching. | Atomic chillu letters and NFC throughout (TERMS.md); `i18n:check` accepts ZWJ/ZWNJ as spelling characters and refuses other invisible controls. |
| **Long words.** The language note says words run long. | Short labels and abbreviations in TERMS.md (ഡോജോ, `{h} മ {m} മി`). |
| **Script and fonts.** No Malayalam font is bundled and none is named in the CSS or canvas stacks. | Text falls back to the phone's system Malayalam font (Noto Sans Malayalam, Malayalam Sangam MN, Nirmala UI); the script-share check counts vowel signs as letters (`9f382e0`). |

Brands (Kagemura, App Store, Google Play, Game Center) stay in Latin letters; Japanese names are transliterated (കൈറ്റോ, ഹോഷി സെൻസെയ്).

## Grammar the code relies on

- Plural categories (`Intl.PluralRules('ml')`): `one` (1 only) and `other` (0, 2…).
- Numbers use Indian grouping through `Intl` (12,34,567) with Western digits.
- Generated names use the default order (`locales/languages.json` sets no `generatedNames`): modifier, space, noun (ഇടിമിന്നൽ + കൊടുമുടി = ഇടിമിന്നൽ കൊടുമുടി), no -ന്റെ and no gender agreement.

## Storage

`npm run i18n:build` (`measured.ml`): 402,870 bytes UTF-8 (85,146 gzip, 66,847 Brotli) for 2,705 strings.

## Remaining before release

1. Native Malayalam review of the game text, tutorial, purchase, safety and legal pages, and a review of the terms and privacy policy for India (DPDP Act 2023).
2. iOS (`ml.lproj`), Android (`values-ml`), StoreKit and server push resources from `docs/store/ml/LOCALE.json`, then deploy the server before the game.
3. Upload `docs/store/ml/` to App Store Connect and Google Play with Malayalam screenshots (`npm run store:screenshots -- --language=ml` on a machine with a Malayalam font); age rating through the stores.
4. Physical iOS and Android checks: language selection, chillu and conjunct rendering and line fit on cheap Android phones, Malayalam keyboard input in chat, store purchase screens. Emulation is not device evidence.
5. Malayalam moderation coverage: the chat filter's word list is English only.
6. Computer players' generated names (Kaito Mori) stay in Latin letters because they are stored text.
