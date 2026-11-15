---
document_type: hebrew_implementation
schema_version: 1
language: he
variant: Modern Standard Hebrew (he-IL), no niqqud, gender-neutral address (plural imperatives, action nouns, unpointed -ך/שלך possessives)
status: implemented_in_repo_release_checks_remain
measurements: SPANISH_SIZE.json (measured.he)
---

# Hebrew translation

Hebrew (`he`, script `Hebr`, right to left) was released in commit `d6ab7b8`. It is served to `he`, `he-*` and the old code `iw` (an alias in `ui/i18n.ts`) and covers every namespace (3,019 entries, 2,705 strings), the public pages and PWA manifest under `public/he/`, and listing and integration copy in `docs/store/he/` (`LISTING.md`, `LOCALE.json`). Terms: `locales/he/TERMS.md`; reviewed warnings: `locales/he/REVIEW.json`.

The translation is AI-written and validated only by the repository checks below. **No native Hebrew speaker has reviewed it**, nor the legal pages.

## What Hebrew needed

| Issue | Handling |
|---|---|
| **Verbs, adjectives and "you" are gendered.** The player's gender is unknown. | Plural imperatives in instructions (בנו, שדרגו, אספו), action nouns on buttons (בנייה, שדרוג), unpointed ־ך / שלך / לך, which do not show gender without niqqud. No second-person singular present or future (`GLOSSARY.md`, right-to-left section; the `he` note in `languages.json`). |
| **Prefixed particles.** ב, ה, ו, כ, ל, מ, ש attach to the next word and cannot attach to a placeholder. | A colon or a noun before the placeholder (`הושלם: {building}`, `הכפר של {name}`); no verb or adjective agrees with `{building}`, `{troop}` or `{name}`. |
| **Direction.** | `dir: rtl` in `languages.json`; the game sets `<html dir>` and `styles.css` mirrors the side rail and bottom buttons. Direction marks (U+200E, U+200F) are refused by the checker's invisible-character rule; text is written in logical order only. |
| **Generated names.** | `generatedNames: noun-first`: a construct-state noun, space, a definite noun (פסגת + השקט = פסגת השקט). No adjectives, so nothing agrees in gender. |
| **Letters outside the bundled fonts.** | Hebrew is drawn by the system fallback (Noto Sans Hebrew is named in the shared `--font-fallback`; Apple and Windows use their own Hebrew fonts). No code change. |

## Plurals and numbers

`Intl.PluralRules('he')`: `one`, `two` and `other`. One: "לוחם אחד"; two: "שני לוחמים" or "2 לוחמים"; other: "# לוחמים". Numbers use Western digits with comma grouping (1,234,567.5). Times: {d} י' {h} ש', {h} ש' {m} ד', {m} ד' {s} שנ'.

## Storage

`npm run i18n:build` (`measured.he`): 252,566 bytes UTF-8 (75,305 gzip, 61,829 Brotli) for 2,705 strings.

## Validation

- `npm run i18n:check -- he` (2026-11-14): no errors; warnings are script-share notes on lines dominated by Latin brand and field names (reviewed in `REVIEW.json`, `latinScriptReviewed`) and English-identical entries.
- Store copy limits checked with Node: subtitle 21/30, short description 57/80, promotional text 78/170, keywords 97/100 bytes; every product name in `data.json` is 30 characters or fewer, so `LOCALE.json` needs no `displayNames` override.

## Remaining before release

1. Deploy the server (Hebrew push text and account form) before or with the game.
2. Native Hebrew review of the game text, tutorial, purchase, safety and legal pages, and an Israeli-law review of the terms and privacy policy (Privacy Protection Law, consumer protection law).
3. Upload `docs/store/he/` to App Store Connect and Google Play with Hebrew screenshots (`npm run store:screenshots -- --language=he`); age rating through the stores.
4. Physical iOS and Android checks: language selection, native resources (`he` and Android's legacy `iw` folder), right-to-left layout of every panel, canvas labels and mixed Hebrew/number strings, Hebrew keyboard input in chat, store purchase screens.
5. Hebrew moderation coverage: the chat filter's word list is English only.
6. Computer players' generated names stay in Latin letters because they are stored text.
