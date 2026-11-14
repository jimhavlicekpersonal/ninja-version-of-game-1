---
document_type: russian_implementation
schema_version: 1
language: ru
variant: Standard Russian (ru-RU) with ты, also in the legal pages; no gendered past tense toward the player; one/few/many plurals
status: implemented_in_repo_release_checks_remain
measurements: SPANISH_SIZE.json (measured.ru)
---

# Russian translation

Russian (`ru`, script `Cyrl`) was activated on 2026-11-14 in commit `ee21ee6` (layout and font fixes `9c351cf`, checks `d995636`, store copy `1ee11cb`) together with Arabic, Indonesian and Turkish (the first Cyrillic language). It is served to every `ru-*` device and covers every namespace (3,066 entries after the 10846c6 merge; 3,041 at activation), the six public pages and PWA manifest under `public/ru/`, the account-deletion form (`/account/delete?lang=ru`), server push text, iOS (`ru.lproj`) and Android (`values-ru`) resources, StoreKit fixtures (`ru`), and listing and product copy in `docs/store/ru/`. Terms: `locales/ru/TERMS.md`.

The translation is AI-written and validated by the repository checks below. **No native Russian speaker has reviewed it**, nor the legal pages.

## Translator's choices

- **ты everywhere, also in the legal pages** (parents are addressed as вы). Russian privacy policies and terms usually use вы; whether ты reads as too familiar there is an open question for the native and legal review.
- **No gender for the player**: Russian marks it on the past tense and short adjectives (ты атаковал/атаковала, готов/готова). Sentences about the player avoid both («Ты уже атаковал» → «Твоя атака уже была»); other players' actions are in the present tense (`{name} вступает в альянс`); placeholders stand in the nominative after a colon (`Построено: {building}`).
- **one/few/many/other** in every ICU plural (# воин, # воина, # воинов); a bare `{n}` outside a plural goes after a colon.
- Japanese names in the Polivanov system (Кайто, сэнсэй Хоси).
- **Generated names** keep the default order (first part, space, second): first parts are masculine adjectives, second parts masculine nouns in lowercase, so every pair agrees (Громовой пик, Двойной клинок).

## What integration added

| Issue | Fix |
|---|---|
| The privacy page said «Где бы ты ни находился», a masculine form for the player. | «Независимо от страны проживания, ты можешь попросить нас:». `tests/locales/russian.test.ts` scans the game and pages for a gendered verb or short adjective after ты. |
| A Russian plural without few or many would print 5 воина without any check failing. | `npm run i18n:check` fails on a Russian ICU plural missing one, few or many (`missingPluralForms`). |
| Fonts. | None needed: like the other non-Latin scripts, Cyrillic headings use the system font (`html[data-script]:not([data-script="Latn"])`), and body text falls back per glyph from the bundled Latin font to the system font, as for Hindi, Thai and Arabic. Russian is not in `SYSTEM_FONT_LANGS`, which is for Latin-script languages (`latin-fonts.test.ts`). |

## Storage

`npm run i18n:build` (`measured.ru`): 299,508 bytes UTF-8 (85,156 gzip, 68,025 Brotli) for 2,725 strings, the largest of the four.

## Validation

- `npm run i18n:check -- ru`: no errors; warnings are brand names and Japanese statutory page lengths. There is no `REVIEW.json` for Russian yet.
- `tests/locales/russian.test.ts`: catalog complete, NFC and ready; device choice; Russian number grouping; one/few/many plurals with the right noun form (and the check catches a missing one); no gendered form on ты; Kage and Shadow League distinct; agreeing generated names; literal player chat and unchanged canonical data; fonts; pages, account form, push text, native resources and StoreKit.
- Built client in Chromium (sandbox, Keep 10 village, `ru` locale) at 320×568: all 12 panels and their tabs, the village and the raid scout screen; no page errors, no horizontal page overflow, no element outside the viewport, no clipped button or heading, no placeholder or key left; the bottom bar fits. Emulation is not physical-device evidence.

## Remaining before release

1. Deploy the server (Russian push catalog and account form) before or with the game.
2. Native Russian review of the game text, tutorial, purchase, safety and legal pages, and a decision on ты versus вы in the legal pages. Legal review for the markets shipped to; Russia's data-localisation law (152-FZ) and current sanctions and store availability need an owner decision before any release in Russia itself; Russian is also read in Kazakhstan, Belarus, Kyrgyzstan and elsewhere.
3. Upload `docs/store/ru/` to App Store Connect and Google Play with Russian screenshots (`npm run store:screenshots -- --language=ru`); age rating through the stores.
4. Physical iOS and Android checks: language selection, `ru.lproj`/`values-ru` registration, Cyrillic in canvas labels, long words in tight buttons on 320 px phones, Cyrillic keyboard input in chat, store purchase screens.
5. Russian moderation coverage: the chat filter's word list is English only.
6. Computer players' generated names (Kaito Mori) stay in Latin letters because they are stored text.
