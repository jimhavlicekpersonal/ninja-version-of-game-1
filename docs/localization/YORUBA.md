---
document_type: yoruba_implementation
schema_version: 1
language: yo
variant: Standard Yoruba (Nigeria), friendly, the player addressed as o / ìwọ with rẹ for "your"; full tone marks and dot-below letters, NFC
status: implemented_in_repo_release_checks_remain
measurements: SPANISH_SIZE.json (measured.yo)
---

# Yoruba translation

Yoruba (`yo`, script `Latn`) covers every namespace (2,708 strings in `boot`, `data`, `messages`, `pages` and `ui`), the public pages and PWA manifest under `public/yo/`, and listing and product copy in `docs/store/yo/` (added in `d6ab7b8`). Terms: `locales/yo/TERMS.md`; reviewed warnings: `locales/yo/REVIEW.json` (67 English-identical entries reviewed). `locales/languages.json` marks it `appStore: false`: App Store Connect offers no Yoruba listing language, so it ships as a Google Play listing and an in-game language.

The translation is AI-written and validated by the repository checks below. **No native Yoruba speaker has reviewed it**, nor the legal pages.

## What Yoruba needed

| Issue | Rule |
|---|---|
| **Tone marks on dot-below vowels.** Unicode has no precomposed ẹ̀, ọ́ and similar letters, so even in NFC they are a base letter plus a combining accent (about 4,000 combining marks in `data` and `messages`). | Full tone marks and dot-below letters (ẹ ọ ṣ) everywhere, NFC; `[...s].length` and `s.length` count more than the visible letters, so store limits are checked with `s.length`. |
| **Vowel elision before a placeholder.** Forms like "sílé" fuse a verb with the next noun. | Nothing is fused onto a placeholder: `sí {name}`, never an elided form. |
| **No grammatical gender.** ó and wọ́n are genderless. | Nothing to neutralise for the player or `{name}`. |
| **Generated names in the wrong order.** Modifiers follow the noun. | `generatedNames: noun-first` (Òkè + Àrá = Òkè Àrá, Ẹnubodè Irin). |
| **Missing letters in the bundled fonts.** ẹ ọ ṣ ǹ and the combining accents are outside the display font's Latin-1 subset, and stacked marks clip in tight labels. | `yo` is in `SYSTEM_FONT_LANGS` (canvas) and the system-font CSS rule, with heavier weight for headings. |

Jade is **Jéèdì**, noun before the number (Jéèdì 7500, jagunjagun 5); Kage League (Líìgì Kage) stays distinct from Shadow League (Líìgì Òjìji). The checker (`npm run i18n:check -- yo`) has no Yoruba-only rule; the general placeholder, ICU, NFC and identical-English checks apply.

`Intl` gives the plural category `other` only, comma-grouped numbers (1,234,567) and Yoruba dates (14 Oṣù Bélú 2026). Name validation accepts letters with combining marks (`\p{L}`, `\p{M}`).

## Storage

`npm run i18n:build` (`measured.yo`): 251,398 bytes UTF-8 (75,049 gzip, 62,012 Brotli) for 2,708 strings, the largest of the three because of the combining marks.

## Remaining before release

1. Native Yoruba review of the game text, tutorial, purchase, safety and legal pages (tone marking in particular), and a legal review for Nigeria (Nigeria Data Protection Act 2023, consumer law).
2. iOS (`yo.lproj`), Android (`values-yo`), StoreKit fixture and server push/account-form coverage if not yet present; a dedicated `tests/locales/yoruba.test.ts` does not exist yet.
3. Upload `docs/store/yo/` to Google Play with Yoruba screenshots (`npm run store:screenshots -- --language=yo`, with a font that renders combining tone marks on ẹ and ọ); age rating through the stores.
4. Physical checks on cheap Android phones: combining marks placed correctly over dot-below vowels, clipping in tight labels, keyboard input of tone marks in chat, store purchase screens.
5. Yoruba moderation coverage: the chat filter's word list is English only.
6. Computer players' generated names (Kaito Mori) stay in Latin letters because they are stored text.
