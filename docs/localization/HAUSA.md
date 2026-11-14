---
document_type: hausa_implementation
schema_version: 1
language: ha
variant: Standard Hausa in Boko script (Nigeria and Niger), the player addressed with the respectful plural ku; no gendered pronoun or linker for players or placeholders
status: implemented_in_repo_release_checks_remain
measurements: SPANISH_SIZE.json (measured.ha)
---

# Hausa translation

Hausa (`ha`, script `Latn`) covers every namespace (2,708 strings in `boot`, `data`, `messages`, `pages` and `ui`), the public pages and PWA manifest under `public/ha/`, and listing and product copy in `docs/store/ha/` (added in `d6ab7b8`). Terms: `locales/ha/TERMS.md`; reviewed warnings: `locales/ha/REVIEW.json` (110 English-identical entries reviewed). `locales/languages.json` marks it `appStore: false`: App Store Connect offers no Hausa listing language, so it ships as a Google Play listing and an in-game language.

The translation is AI-written and validated by the repository checks below. **No native Hausa speaker has reviewed it**, nor the legal pages.

## What Hausa needed

| Issue | Rule |
|---|---|
| **Second person states gender.** ka/ki/kai/ke say whether the player is a man or a woman. | The player is always **ku** (kuna, kun, naku, -ku: ƙauyenku); buttons use the genderless imperative (Gina, Inganta, Karɓa). |
| **Third person states gender.** ya/ta/shi/ita for `{name}` or another player would guess their gender. | Rephrase with a noun (`Nasara: {name}`), an impersonal *an* sentence, or ɗan wasa / abokin hamayya. Fixed characters (Akane, Yoru, Gorō) may take ta/ya. |
| **Gendered linkers.** The genitive -n/-r follows the head noun's gender. | A linker attaches only to a fixed noun before a placeholder (`ƙauyen {name}`, `ginin {building}`), never to the placeholder. |
| **Hooked letters.** ɓ ɗ ƙ ƴ, never apostrophe spellings ('b, 'd, 'y). | `GLOSSARY.md` rule; the apostrophe stays only for the glottal stop (Masana'antar, nau'o'i). |
| **Generated names in the wrong order.** | `generatedNames: noun-first`; second parts carry their linker (Dutsen Tsawa, Ƙofar Ƙarfe). |
| **Missing letters in the bundled fonts.** ɓ ɗ ƙ ƴ are outside the display font's Latin-1 subset. | `ha` is in `SYSTEM_FONT_LANGS` (canvas) and the system-font CSS rule, with heavier weight for headings. |

Jade is transliterated as **Jed**, noun before the number (Jed 7500, mayaƙa 5). The checker (`npm run i18n:check -- ha`) has no Hausa-only rule; the general placeholder, ICU, NFC and identical-English checks apply.

`Intl` gives the plural categories `one` and `other`, comma-grouped numbers (1,234,567) and Hausa dates (14 Nuwamba, 2026). Name validation (`\p{L}`) accepts the hooked letters.

## Storage

`npm run i18n:build` (`measured.ha`): 218,623 bytes UTF-8 (70,455 gzip, 59,980 Brotli) for 2,708 strings.

## Remaining before release

1. Native Hausa review of the game text, tutorial, purchase, safety and legal pages, and a legal review for Nigeria (Nigeria Data Protection Act 2023, consumer law) and Niger.
2. iOS (`ha.lproj`), Android (`values-ha`), StoreKit fixture and server push/account-form coverage if not yet present; a dedicated `tests/locales/hausa.test.ts` does not exist yet.
3. Upload `docs/store/ha/` to Google Play with Hausa screenshots (`npm run store:screenshots -- --language=ha`, with a font that has ɓ ɗ ƙ ƴ); age rating through the stores.
4. Physical checks on cheap Android phones: ƴ and Ƴ (U+01B4/U+01B3) are missing from some system fonts; keyboard input of hooked letters in chat; store purchase screens.
5. Hausa moderation coverage: the chat filter's word list is English only.
6. Computer players' generated names (Kaito Mori) stay in Latin letters because they are stored text.
