---
document_type: tamil_implementation
schema_version: 1
language: ta
variant: Standard written Tamil (ta-IN, readable in Sri Lanka), friendly and respectful with நீங்கள் and -ங்கள் imperatives in sentences, short imperative buttons
status: implemented_in_repo_release_checks_remain
measurements: SPANISH_SIZE.json (measured.ta)
---

# Tamil translation

Tamil (`ta`, script `Taml`, left to right, wave 3) is complete in every namespace (`boot`, `ui`, `data`, `messages`, `pages`), with the six public pages and PWA manifest under `public/ta/` and listing and store-integration copy in `docs/store/ta/` (`LISTING.md`, `LOCALE.json`), added in `d6ab7b8`. Terms: `locales/ta/TERMS.md`; reviewed warnings: `locales/ta/REVIEW.json`.

The translation is AI-written and validated by the repository checks. **No native Tamil speaker has reviewed it**, nor the legal pages.

## What Tamil needed

| Issue | Handling |
|---|---|
| **Suffixes join the word.** Case endings (-ஐ, -இன், -க்கு) fuse with the noun before them and change with its last sound, which a placeholder does not have. | Glossary rule for the Dravidian languages: nothing directly after `{name}`, `{building}`, `{n}` or `#`; a colon (`தயார்: {building}`) or a noun that carries the ending (`{building} கட்டடத்தை`, `{name} என்பவரின்`). This is a translation rule, not an `i18n:check` error (the suffix check covers only Turkish, Hungarian and Finnish). |
| **Gendered pronouns.** அவன்/அவள் state gender; players and {name} have none. | Repeat the name or say எதிராளி / ஆட்டக்காரர்; the neutral அவர் only when needed. |
| **Long words.** The language note says Tamil words run long. | Short noun or imperative buttons (சேமி, மேம்படுத்து), abbreviations in TERMS.md (டோஜோ). |
| **Script and fonts.** No Tamil font is bundled and none is named in the CSS or canvas stacks. | Text falls back to the phone's system Tamil font (Noto Sans Tamil, Tamil Sangam MN, Nirmala UI); the script-share check counts vowel signs as letters (`9f382e0`). |

Brands (Kagemura, App Store, Google Play, Game Center) stay in Latin letters; Japanese names are transliterated (கைட்டோ, குரு ஹோஷி).

## Grammar the code relies on

- Plural categories (`Intl.PluralRules('ta')`): `one` (1 only) and `other` (0 included).
- Numbers use Indian grouping through `Intl` (12,34,567) with Western digits.
- Generated names use the default order (`locales/languages.json` sets no `generatedNames`): modifier, space, noun (இடி + சிகரம் = இடி சிகரம்), no இன் or joining consonant.

## Storage

`npm run i18n:build` (`measured.ta`): 421,743 bytes UTF-8 (84,186 gzip, 65,898 Brotli) for 2,705 strings; Tamil script is three bytes per letter in UTF-8.

## Remaining before release

1. Native Tamil review of the game text, tutorial, purchase, safety and legal pages, and a review of the terms and privacy policy for India (DPDP Act 2023) and Sri Lanka.
2. iOS (`ta.lproj`), Android (`values-ta`), StoreKit and server push resources from `docs/store/ta/LOCALE.json`, then deploy the server before the game.
3. Upload `docs/store/ta/` to App Store Connect and Google Play with Tamil screenshots (`npm run store:screenshots -- --language=ta` on a machine with a Tamil font); age rating through the stores.
4. Physical iOS and Android checks: language selection, Tamil rendering and line fit on cheap Android phones, Tamil keyboard input in chat, store purchase screens. Emulation is not device evidence.
5. Tamil moderation coverage: the chat filter's word list is English only.
6. Computer players' generated names (Kaito Mori) stay in Latin letters because they are stored text.
