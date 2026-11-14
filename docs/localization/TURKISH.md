---
document_type: turkish_implementation
schema_version: 1
language: tr
variant: Standard Turkish (tr-TR), sen in the game and siz in the legal pages; no suffix on a placeholder; system fonts
status: implemented_in_repo_release_checks_remain
measurements: SPANISH_SIZE.json (measured.tr)
---

# Turkish translation

Turkish (`tr`, script `Latn`) was activated on 2026-11-14 in commit `ee21ee6` (layout and font fixes `9c351cf`, checks `d995636`, store copy `1ee11cb`) together with Arabic, Indonesian and Russian. It is served to every `tr-*` device and covers every namespace (3,301 entries after the a1188d2 merge, including the server message codes and the complaint form; 3,041 at activation), the six public pages and PWA manifest under `public/tr/`, the account-deletion form (`/account/delete?lang=tr`), server push text, iOS (`tr.lproj`) and Android (`values-tr`) resources, StoreKit fixtures (`tr`), and listing and product copy in `docs/store/tr/`. Terms: `locales/tr/TERMS.md`.

The translation is AI-written and validated by the repository checks below. **No native Turkish speaker has reviewed it**, nor the legal pages.

## Translator's choices

- **sen in the game, siz in the pages** (privacy, terms, community rules, support, account deletion, the Japanese notices), as Turkish software and legal text usually do. The store listing follows the game (sen); the account form's failure line uses siz like its page.
- **No suffix on a placeholder.** Turkish case and possessive endings follow vowel harmony and the last consonant (`{name}'in/'ın/'un`), which the game cannot know. Phrases use a colon (`Yükselt: {building}`), a noun after the placeholder that carries the ending (`{n} savaşçı`), a postposition with no ending (`{name} ile`, `{time} sonra`) or an ordinal dot (`{level}. seviye`). The percent sign comes first (`%{pct}`).
- Plural one/other with the noun singular after a number (`# savaşçı`).
- **Generated names** keep the default order: adjectives that fit any noun (Sessiz, Kızıl, Gürleyen) and bare nouns (Zirve, Geçit), so no possessive suffix is needed (Gürleyen Zirve, İkiz Kılıç).

## What integration added

| Issue | Fix |
|---|---|
| The bundled Latin fonts cover Latin-1 and dotless ı, but not ğ, ş and İ, so those letters would be drawn in another typeface mid-word. | `tr` joins `SYSTEM_FONT_LANGS` (canvas text) and the system-font CSS rule with Romanian and Vietnamese; `latin-fonts.test.ts` required it. |
| A placeholder suffix could slip in without a check failing. | `npm run i18n:check` fails on a suffix written onto a placeholder or plural number (`turkishSuffixAfterPlaceholder`); all entries pass. |

The page sets `<html lang="tr">`, so CSS uppercase maps i to İ correctly.

## Storage

`npm run i18n:build` (`measured.tr`): 221,464 bytes UTF-8 (73,279 gzip, 62,288 Brotli) for 2,725 strings.

## Validation

- `npm run i18n:check -- tr`: no errors; warnings are entries identical to English (brands, Japanese names, Stake option) and Japanese statutory page lengths. There is no `REVIEW.json` for Turkish yet.
- `tests/locales/turkish.test.ts`: catalog complete, NFC and ready; device choice; Turkish number grouping; singular noun after a number and no suffix on a placeholder (and the check catches one); Kage and Shadow League distinct; generated names; literal player chat and unchanged canonical data; the system font; pages, account form, push text, native resources and StoreKit.
- Built client in Chromium (sandbox, Keep 10 village, `tr` locale) at 320×568: all 12 panels and their tabs, the village and the raid scout screen; no page errors, no horizontal page overflow, no element outside the viewport, no clipped button or heading, no placeholder or key left; the bottom bar fits. Emulation is not physical-device evidence.

## Remaining before release

1. Deploy the server (Turkish push catalog and account form) before or with the game.
2. Native Turkish review of the game text, tutorial, purchase, safety and legal pages. Legal review under KVKK (Law 6698 on personal data), its cross-border transfer rules and VERBİS registration, and Turkey's consumer and distance-sales rules for the terms.
3. Upload `docs/store/tr/` to App Store Connect and Google Play with Turkish screenshots (`npm run store:screenshots -- --language=tr`); age rating through the stores.
4. Physical iOS and Android checks: language selection, `tr.lproj`/`values-tr` registration, ğ ş İ ı in the phones' system fonts and canvas labels, Turkish keyboard input in chat (dotted and dotless i), store purchase screens.
5. Turkish moderation coverage: the chat filter's word list is English only.
6. Computer players' generated names (Kaito Mori) stay in Latin letters because they are stored text.
