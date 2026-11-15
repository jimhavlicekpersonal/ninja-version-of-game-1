---
document_type: telugu_implementation
schema_version: 1
language: te
variant: Standard colloquial Telugu (te-IN), friendly and polite with మీరు and polite imperatives in sentences, short forms on buttons
status: implemented_in_repo_release_checks_remain
measurements: SPANISH_SIZE.json (measured.te)
---

# Telugu translation

Telugu (`te`, script `Telu`, left to right, wave 3) is complete in every namespace (`boot`, `ui`, `data`, `messages`, `pages`), with the six public pages and PWA manifest under `public/te/` and listing and store-integration copy in `docs/store/te/` (`LISTING.md`, `LOCALE.json`), added in `d6ab7b8`. Terms: `locales/te/TERMS.md`; reviewed warnings: `locales/te/REVIEW.json`.

The translation is AI-written and validated by the repository checks. **No native Telugu speaker has reviewed it**, nor the legal pages.

## What Telugu needed

| Issue | Handling |
|---|---|
| **Singular verbs state gender.** చేరాడు (he joined) / చేరింది (she joined); players and {name} have no known gender. | Honorific plural verbs for players and {name} (చేరారు, గెలిచారు), which are gender-neutral; warriors in the plural (యోధులు). Sensei Hoshi says నేను/మనం. |
| **Suffixes join the word.** Case endings (కి, ను, లో) attach to the noun before them. | Glossary rule for the Dravidian languages: nothing directly after `{name}`, `{building}`, `{n}` or `#`; a colon (`సిద్ధం: {building}`) or a noun that carries the ending (`{building} కట్టడాన్ని`). This is a translation rule, not an `i18n:check` error (the suffix check covers only Turkish, Hungarian and Finnish). |
| **ZWNJ in loanwords.** English words with a suffix (సెట్టింగ్‌లు) use U+200C to keep the visible virama. | `i18n:check` accepts ZWJ/ZWNJ as spelling characters and refuses other invisible controls. |
| **Script and fonts.** No Telugu font is bundled and none is named in the CSS or canvas stacks. | Text falls back to the phone's system Telugu font (Noto Sans Telugu, Kohinoor Telugu, Nirmala UI); the script-share check counts vowel signs as letters (`9f382e0`). |

Brands (Kagemura, App Store, Google Play, Game Center) stay in Latin letters; Japanese names are transliterated (కైతో, గురువు హోషి).

## Grammar the code relies on

- Plural categories (`Intl.PluralRules('te')`): `one` (1 only) and `other` (0 included); the number comes before the noun (`{n} యోధులు`).
- Numbers use Indian grouping through `Intl` (12,34,567) with Western digits.
- Generated names use the default order (`locales/languages.json` sets no `generatedNames`): modifier, space, noun (ఉరుము + శిఖరం = ఉరుము శిఖరం), no యొక్క or case ending.

## Storage

`npm run i18n:build` (`measured.te`): 371,618 bytes UTF-8 (83,518 gzip, 65,764 Brotli) for 2,705 strings.

## Remaining before release

1. Native Telugu review of the game text, tutorial, purchase, safety and legal pages, and a review of the terms and privacy policy for India (DPDP Act 2023).
2. iOS (`te.lproj`), Android (`values-te`), StoreKit and server push resources from `docs/store/te/LOCALE.json`, then deploy the server before the game.
3. Upload `docs/store/te/` to App Store Connect and Google Play with Telugu screenshots (`npm run store:screenshots -- --language=te` on a machine with a Telugu font); age rating through the stores.
4. Physical iOS and Android checks: language selection, conjunct rendering and line fit on cheap Android phones, Telugu keyboard input in chat, store purchase screens. Emulation is not device evidence.
5. Telugu moderation coverage: the chat filter's word list is English only.
6. Computer players' generated names (Kaito Mori) stay in Latin letters because they are stored text.
