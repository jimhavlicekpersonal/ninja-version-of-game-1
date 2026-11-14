---
document_type: urdu_implementation
schema_version: 1
language: ur
variant: Standard Urdu in Arabic script (ur-PK), polite آپ for the player, gender-neutral phrasing
status: implemented_in_repo_release_checks_remain
measurements: SPANISH_SIZE.json (measured.ur)
---

# Urdu translation

Urdu (`ur`, script `Arab`, right to left) was released in commit `d6ab7b8`. It is served to `ur` and `ur-*` devices and covers every namespace (3,019 entries, 2,705 strings), the public pages and PWA manifest under `public/ur/`, and listing and integration copy in `docs/store/ur/` (`LISTING.md`, `LOCALE.json`). Terms: `locales/ur/TERMS.md`; reviewed warnings: `locales/ur/REVIEW.json`.

The translation is AI-written and validated only by the repository checks below. **No native Urdu speaker has reviewed it**, nor the legal pages.

## What Urdu needed

| Issue | Handling |
|---|---|
| **Verbs agree in gender.** آپ جیت گئے/گئیں states the player's gender; the same holds for `{name}`, `{building}` and `{troop}`. | Imperatives (کریں), transitive "نے" constructions (the verb agrees with the object), "آپ سے … چھوٹ گیا", or nouns (فتح!، تیاری مکمل). `{name} کا گاؤں` is safe (کا agrees with the following noun); `{building}` and `{troop}` take a colon or a noun phrase (`مکمل: {building}`). |
| **Punctuation.** | Urdu full stop ۔ (U+06D4), ؟ and ،; ICU syntax stays ASCII. |
| **Direction.** | `dir: rtl` in `languages.json`; the game sets `<html dir>` and `styles.css` mirrors the side rail and bottom buttons. Direction marks (U+200E, U+200F, U+061C) are refused by the checker; ZWJ/ZWNJ remain allowed as spelling characters. |
| **Generated names.** | `generatedNames` unset (the default order): Urdu puts the modifier first (خاموش + چوٹی = خاموش چوٹی). First parts are adjectives that do not change with gender (طوفانی، آہنی، خاموش، جڑواں), with no کا/کی. |
| **Fonts.** | The system fallback draws Urdu: the shared `--font-fallback` names Noto Sans Arabic, Geeza Pro and Segoe UI Arabic, which are Naskh-style. Nastaliq appears only where the device's own font provides it. No code change. |

## Plurals and numbers

`Intl.PluralRules('ur')`: `one` (1 only) and `other` (0 included); the number comes before the noun (`{n} جنگجو`). `Intl` formats `ur` numbers with Western digits and comma grouping (1,234,567.5). Times: `{d} دن {h} گھنٹے`، `{h} گھنٹے {m} منٹ`، `{m} منٹ {s} سیکنڈ`.

## Storage

`npm run i18n:build` (`measured.ur`): 282,261 bytes UTF-8 (78,680 gzip, 63,798 Brotli) for 2,705 strings.

## Validation

- `npm run i18n:check -- ur` (2026-11-14): no errors; warnings are script-share notes on lines dominated by Latin brand and field names and English-identical entries, reviewed in `REVIEW.json`.
- Store copy limits checked with Node: subtitle 26/30, short description 64/80, promotional text 112/170, keywords 92/100 bytes; every product name in `data.json` is 30 characters or fewer, so `LOCALE.json` needs no `displayNames` override.

## Remaining before release

1. Deploy the server (Urdu push text and account form) before or with the game.
2. Native Urdu review of the game text, tutorial, purchase, safety and legal pages, and a review of the terms and privacy policy for Pakistan and India (Pakistan's consumer and data rules, India's DPDP Act 2023).
3. Upload `docs/store/ur/` to App Store Connect and Google Play with Urdu screenshots (`npm run store:screenshots -- --language=ur`); age rating through the stores.
4. Physical iOS and Android checks: language selection, native resources, right-to-left layout of every panel, how Naskh and Nastaliq system fonts fit tight labels on cheap Android phones, Urdu keyboard input in chat, store purchase screens.
5. Urdu moderation coverage: the chat filter's word list is English only.
6. Computer players' generated names stay in Latin letters because they are stored text.
