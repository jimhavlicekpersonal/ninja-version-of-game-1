---
document_type: ukrainian_implementation
schema_version: 1
language: uk
variant: Standard Ukrainian, translated from English (never from Russian); informal ти in the game, polite ви (lowercase) in the legal, support and account-deletion pages; no past tense or adjective agreeing with the player or a placeholder
status: implemented_in_repo_release_checks_remain
measurements: SPANISH_SIZE.json (measured.uk)
---

# Ukrainian translation

Ukrainian (`uk`, script `Cyrl`) was released together with Russian and Polish in commit `RELEASE_COMMIT`. It covers every namespace (3,022 entries), the six public pages and PWA manifest under `public/uk/`, the account-deletion form (`/account/delete?lang=uk`), server push text, iOS (`uk.lproj`) and Android (`values-uk`) resources, StoreKit fixtures (`uk`), and listing and product copy in `docs/store/uk/`. Terms: `locales/uk/TERMS.md`; reviewed warnings: `locales/uk/REVIEW.json`.

The translation is AI-written and validated by the repository checks below. **No native Ukrainian speaker has reviewed it**, nor the legal pages.

## What Ukrainian needed

| Issue | Rule |
|---|---|
| **Must not be a conversion of Russian.** The language note: "Translate from English, never from Russian." | Translated from the English source; `i18n:check` fails on ы э ъ ё in `uk` (and on і ї є ґ in `ru`), `tools/i18n/lib.mjs`. |
| **Past tenses and adjectives agree in gender.** | No past tense or adjective agreeing with the player or `{name}`: «отримано», «ти отримуєш», `Набіг: {name}` (`GLOSSARY.md`, Slavic languages). |
| **Seven cases; a placeholder cannot take an ending.** | Placeholders stay nominative after a colon or in apposition (`{building}: покращити до рів. {level}`, `Село: {name}`). |
| **Two registers.** | ти for the game and Sensei Hoshi (Сенсей Хоші); ви for legal, support and account-deletion text, so the account form's error is in ви. |
| **Generated names would need gender agreement.** | `generatedNames: noun-first`: noun, space, invariant genitive noun (Пік Грому, Клинок Близнюків). |
| **Cyrillic is not in the bundled fonts** (Latin-1 subsets). | No code change: glyphs come from the system fallback stack; the display font switches to it through `html[data-script]:not([data-script="Latn"])`. |

Conventions: apostrophe ’ (U+2019), quotes «…»; Japanese names in Cyrillic (Кайто, Хана, Такеда, Ліга Каґе); brands in Latin letters. Key terms: Твердиня клану, Нефрит, Сувій сезону, Тіньові випробування, Димова бомба, Диверсант, Точки проникнення, Альянс, Банда, Платня клану, Крамниця; Ліга Каґе stays distinct from Тіньова ліга.

`Intl.PluralRules('uk')` gives `one` (1, 21), `few` (2–4), `many` (0, 5–20) and `other` (fractions); every plural message has all four. `Intl` groups numbers with a no-break space (1 234 567) and writes Ukrainian dates (14 листопада 2026 р.).

## Storage

`npm run i18n:build` (`measured.uk`): 297,288 bytes UTF-8 (84,468 gzip, 67,913 Brotli) for 2,708 strings.

## Validation

- `npm run i18n:check -- uk`: no errors; English-identical entries reviewed in `REVIEW.json`.
- Store copy limits checked with Node: App Store subtitle 26/30 characters, Play short description 74/80, keywords 95/100 bytes, promotional text 103/170; StoreKit names at most 30 characters (no `displayNames` override needed).

## Remaining before release

1. Deploy the server (Ukrainian push catalog and account form) before or with the game.
2. Native Ukrainian review of the game text, tutorial, purchase, safety and legal pages, and a Ukrainian-law review of the terms and privacy policy (personal-data and consumer-protection law, and the state-language rules for software interfaces).
3. Upload `docs/store/uk/` to App Store Connect and Google Play with Ukrainian screenshots (`npm run store:screenshots -- --language=uk`); age rating through the stores.
4. Physical iOS and Android checks: language selection, `uk.lproj`/`values-uk` registration, і ї є ґ and the apostrophe in device fonts on cheap Android phones, Ukrainian keyboard input in chat, store purchase screens.
5. Ukrainian moderation coverage: the chat filter's word list is English only.
6. Computer players' generated names (Kaito Mori) stay in Latin letters because they are stored text.
