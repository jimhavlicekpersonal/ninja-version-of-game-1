---
document_type: language_release
schema_version: 1
languages: [id, ms, tr, ru, uk, pl, cs, sk, sl, hr, hu, fi, el, he, ur, bn, or, pa, mr, gu, kn, ta, te, ml, sw, ha, yo, ig, zu, am]
status: implemented_in_repo_release_checks_remain
---

# The 30 languages of 2026-11-14

Every target language except Arabic was translated on 2026-11-13/14 and integrated in `d6ab7b8`: game text (all five namespaces, 3,022 entries each), the six public pages and manifest, the account-deletion form, server push text, the legal-page fallback, iOS `InfoPlist.strings` and `CFBundleLocalizations`, Android `values-<code>` and `locales_config.xml` (plus the legacy `values-iw` and `values-in` folders older Android devices use for Hebrew and Indonesian), store copy in `docs/store/<code>/` and one release test for all of them, `tests/locales/languages-2026-11.test.ts`.

**Every translation is AI-written. No native speaker has reviewed any of them, the legal pages included.** Each language's `locales/<code>/REVIEW.json` says so (`humanNativeReview: false`) and lists the entries left identical to English; `locales/<code>/TERMS.md` records its term choices. Wave 3 (the Indic and African languages) is where machine translation is weakest and native review matters most.

| Language | Code | Script | Wave | Generated names | App Store product localization | Fonts | Record |
|---|---|---|---|---|---|---|---|
| Indonesian | `id` | Latn | 1 | noun-first | yes | bundled Latin | [INDONESIAN.md](INDONESIAN.md) |
| Malay | `ms` | Latn | 2 | noun-first | yes | bundled Latin | [MALAY.md](MALAY.md) |
| Turkish | `tr` | Latn | 1 | default | yes | device fonts | [TURKISH.md](TURKISH.md) |
| Russian | `ru` | Cyrl | 1 | noun-first | yes | system fallback | [RUSSIAN.md](RUSSIAN.md) |
| Ukrainian | `uk` | Cyrl | 2 | noun-first | yes | system fallback | [UKRAINIAN.md](UKRAINIAN.md) |
| Polish | `pl` | Latn | 2 | noun-first | yes | device fonts | [POLISH.md](POLISH.md) |
| Czech | `cs` | Latn | 4 | noun-first | yes | device fonts | [CZECH.md](CZECH.md) |
| Slovak | `sk` | Latn | 4 | noun-first | yes | device fonts | [SLOVAK.md](SLOVAK.md) |
| Slovenian | `sl` | Latn | 4 | noun-first | no (Play copy only) | device fonts | [SLOVENIAN.md](SLOVENIAN.md) |
| Croatian | `hr` | Latn | 4 | noun-first | yes | device fonts | [CROATIAN.md](CROATIAN.md) |
| Hungarian | `hu` | Latn | 4 | default | yes | device fonts | [HUNGARIAN.md](HUNGARIAN.md) |
| Finnish | `fi` | Latn | 4 | compound | yes | bundled Latin | [FINNISH.md](FINNISH.md) |
| Greek | `el` | Grek | 4 | noun-first | yes | system fallback | [GREEK.md](GREEK.md) |
| Hebrew | `he` | Hebr | 4 | noun-first | yes | system fallback | [HEBREW.md](HEBREW.md) |
| Urdu | `ur` | Arab | 2 | default | no (Play copy only) | system fallback | [URDU.md](URDU.md) |
| Bangla | `bn` | Beng | 2 | default | no (Play copy only) | system fallback | [BANGLA.md](BANGLA.md) |
| Odia | `or` | Orya | 4 | default | no (Play copy only) | system fallback | [ODIA.md](ODIA.md) |
| Punjabi | `pa` | Guru | 3 | default | no (Play copy only) | system fallback | [PUNJABI.md](PUNJABI.md) |
| Marathi | `mr` | Deva | 3 | default | no (Play copy only) | system fallback | [MARATHI.md](MARATHI.md) |
| Gujarati | `gu` | Gujr | 3 | default | no (Play copy only) | system fallback | [GUJARATI.md](GUJARATI.md) |
| Kannada | `kn` | Knda | 3 | default | no (Play copy only) | system fallback | [KANNADA.md](KANNADA.md) |
| Tamil | `ta` | Taml | 3 | default | no (Play copy only) | system fallback | [TAMIL.md](TAMIL.md) |
| Telugu | `te` | Telu | 3 | default | no (Play copy only) | system fallback | [TELUGU.md](TELUGU.md) |
| Malayalam | `ml` | Mlym | 3 | default | no (Play copy only) | system fallback | [MALAYALAM.md](MALAYALAM.md) |
| Swahili | `sw` | Latn | 2 | noun-first | no (Play copy only) | bundled Latin | [SWAHILI.md](SWAHILI.md) |
| Hausa | `ha` | Latn | 2 | noun-first | no (Play copy only) | device fonts | [HAUSA.md](HAUSA.md) |
| Yoruba | `yo` | Latn | 3 | noun-first | no (Play copy only) | device fonts | [YORUBA.md](YORUBA.md) |
| Igbo | `ig` | Latn | 3 | noun-first | no (Play copy only) | device fonts | [IGBO.md](IGBO.md) |
| Zulu | `zu` | Latn | 3 | noun-first | no (Play copy only) | bundled Latin | [ZULU.md](ZULU.md) |
| Amharic | `am` | Ethi | 3 | default | no (Play copy only) | system fallback | [AMHARIC.md](AMHARIC.md) |

## What the release added beyond the worksheets

- Checker rules (`tools/i18n/lib.mjs`): Ukrainian and Russian refuse each other's letters; Turkish, Hungarian and Finnish refuse a suffix attached to a placeholder or `#`; the script-share warning counts vowel signs (marks) as letters, so Indic, Thai and Ethiopic text is no longer undercounted. New glossary sections for the Slavic, suffixing, right-to-left, Indic, Ethiopic and African Latin-script languages.
- Fonts: Latin languages with letters outside the bundled Latin-1 subsets use the device fonts (`SYSTEM_FONT_LANGS`, `styles.css`); every Indic script and Ethiopic gets the Devanagari rule (no letter-spacing, taller round-button lines).
- Store: `tools/store/storekit.mjs` reads `docs/store/<code>/LOCALE.json` for the 13 languages App Store Connect offers as product localizations (Indonesian, Malay, Turkish, Russian, Ukrainian, Polish, Czech, Slovak, Croatian, Hungarian, Finnish, Greek, Hebrew); the others have Google Play copy only. Which listing languages each store offers must be confirmed in App Store Connect and the Play Console.

## What remains (owner, device and review steps)

- Native-speaker review of game text, store copy and legal pages, starting with wave 3.
- Store upload of listings and product localizations; confirming each store's listing languages.
- Device checks: Urdu draws in the device's Naskh fallback, not Nastaliq; Odia compact numbers from `Intl` look like "1.2ନି"; Indic and Ethiopic rendering on low-end Android.
- Local-law review of the legal pages for each market (the per-language records name the laws the translators were aware of; none is verified).
