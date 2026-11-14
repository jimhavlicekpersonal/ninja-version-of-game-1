---
document_type: russian_implementation
schema_version: 1
language: ru
variant: Standard Russian (ru-RU), friendly informal ты (also in the legal and support pages), no gendered past tense or short adjective agreeing with the player or a placeholder
status: implemented_in_repo_release_checks_remain
measurements: SPANISH_SIZE.json (measured.ru)
---

# Russian translation

Russian (`ru`, script `Cyrl`) was released together with Ukrainian and Polish in commit `d6ab7b8`. It covers every namespace (3,022 entries), the six public pages and PWA manifest under `public/ru/`, the account-deletion form (`/account/delete?lang=ru`), server push text, iOS (`ru.lproj`) and Android (`values-ru`) resources, StoreKit fixtures (`ru`), and listing and product copy in `docs/store/ru/`. Terms: `locales/ru/TERMS.md`; reviewed warnings: `locales/ru/REVIEW.json`.

The translation is AI-written and validated by the repository checks below. **No native Russian speaker has reviewed it**, nor the legal pages.

## What Russian needed

| Issue | Rule |
|---|---|
| **Past tenses and short adjectives agree in gender.** The game knows neither the player's gender nor a `{name}`'s. | Present/future tense, impersonal and passive forms or nouns (`Набег: {name}`, `Пропущен # день`), never «ты построил(а)» or «{name} напал» (`GLOSSARY.md`, Slavic languages). |
| **Six cases; a placeholder cannot take an ending.** | `{building}`, `{troop}`, `{name}` stay nominative after a colon or in apposition (`Улучшить: {building}`, `игрок {name}`). |
| **Russian and Ukrainian are separate translations.** | `i18n:check` fails on і ї є ґ in `ru` (and on ы э ъ ё in `uk`), `tools/i18n/lib.mjs`. |
| **Generated names would need gender agreement.** | `generatedNames: noun-first`: noun, space, a genitive noun that agrees with nothing (Пик + Грома = Пик Грома, Клинок Рассвета). |
| **Cyrillic is not in the bundled fonts** (Latin-1 subsets). | No code change: Cyrillic glyphs come from the system fallback stack, and `html[data-script]:not([data-script="Latn"])` already switches the display font to it. |

Conventions: only the first word of building, warrior and resource names is capitalised (Монетный двор, Теневые чернила); proper names (Синоби, Каге, Хоси) are capitalised; Japanese names use the Polivanov transcription (Кайто, Такэда, Хоси); brands stay in Latin letters. Key terms: Замок клана, Нефрит, Свиток сезона, Испытания Тени, Дымовая бомба, Диверсант, Точки проникновения, Альянс, Банда, Жалованье клана; Лига Каге stays distinct from Лига Тени.

`Intl.PluralRules('ru')` gives `one` (1, 21), `few` (2–4), `many` (0, 5–20) and `other` (fractions); every plural message has all four. `Intl` groups numbers with a no-break space (1 234 567) and writes Russian dates (14 ноября 2026 г.).

## Storage

`npm run i18n:build` (`measured.ru`): 297,519 bytes UTF-8 (84,758 gzip, 67,730 Brotli) for 2,708 strings.

## Validation

- `npm run i18n:check -- ru`: no errors; English-identical entries (brands, placeholder-only strings) reviewed in `REVIEW.json`.
- Store copy limits checked with Node: App Store subtitle 29/30 characters, Play short description 78/80, keywords 99/100 bytes, promotional text 96/170; StoreKit names at most 30 characters (no `displayNames` override needed).

## Remaining before release

1. Deploy the server (Russian push catalog and account form) before or with the game.
2. Native Russian review of the game text, tutorial, purchase, safety and legal pages, and a legal review for each Russian-speaking market the publisher chooses (store availability, payments and personal-data rules differ by country and are owner decisions).
3. Upload `docs/store/ru/` to App Store Connect and Google Play with Russian screenshots (`npm run store:screenshots -- --language=ru`); age rating through the stores.
4. Physical iOS and Android checks: language selection, `ru.lproj`/`values-ru` registration, Cyrillic rendering and long words in tight labels on cheap Android phones, Cyrillic keyboard input in chat, store purchase screens.
5. Russian moderation coverage: the chat filter's word list is English only.
6. Computer players' generated names (Kaito Mori) stay in Latin letters because they are stored text.
