---
document_type: greek_implementation
schema_version: 1
language: el
variant: Modern Greek (el-GR), friendly informal εσύ, nothing agreeing in gender with the player or a placeholder
status: implemented_in_repo_release_checks_remain
measurements: SPANISH_SIZE.json (measured.el)
---

# Greek translation

Greek (`el`, script `Grek`) was released in commit `d6ab7b8`. It is served to `el` and `el-*` devices and covers every namespace (3,019 entries, 2,705 strings), the public pages and PWA manifest under `public/el/`, and listing and integration copy in `docs/store/el/` (`LISTING.md`, `LOCALE.json`). Terms: `locales/el/TERMS.md`; reviewed warnings: `locales/el/REVIEW.json`.

The translation is AI-written and validated only by the repository checks below. **No native Greek speaker has reviewed it**, nor the legal pages.

## What Greek needed

| Issue | Handling |
|---|---|
| **Gender and case agreement.** Adjectives, participles and articles agree with the player, `{name}`, `{building}` and `{troop}`, whose gender the game does not know (`GLOSSARY.md`, placeholders section). | No «είσαι έτοιμος» for the player: impersonal or noun phrasing («Έτοιμο»). No article or ending attached to a placeholder: a colon (`Έτοιμο: {building}`) or an articled noun in apposition (`το κτίριο {building}`). |
| **Generated names in the wrong order.** Greek puts the genitive after the noun. | `generatedNames: noun-first` in `languages.json`: second part (noun, no article), space, first part as a genitive with its own article (Κορυφή + της Σιωπής = Κορυφή της Σιωπής). The genitive agrees only with its own word, so every pair fits. |
| **Letters outside the bundled fonts.** The bundled interface fonts are Latin subsets. | Greek text falls back to the device's system fonts (Segoe UI, Roboto, San Francisco) through the shared fallback stack; every Greek letter is outside Latin-1, so a word never mixes two typefaces. No code change. |

The checker applies the common rules (placeholders, ICU braces, NFC, no invisible characters, script share for `Grek`); there is no Greek-specific rule. Brand names (Kagemura, App Store, Game Center) stay in Latin letters; "premium" is kept as Greek interfaces use it.

## Plurals and numbers

`Intl.PluralRules('el')`: `one` (1 only) and `other` (0, 2 and up). Numbers group with dots and use a decimal comma (1.234.567,5); times are written {d}ημ {h}ώ, {h}ώ {m}λ, {m}λ {s}δ.

## Storage

`npm run i18n:build` (`measured.el`): 323,407 bytes UTF-8 (87,827 gzip, 69,540 Brotli) for 2,705 strings. Greek letters take two bytes each in UTF-8, so the pack is larger than the Latin-script ones.

## Validation

- `npm run i18n:check -- el` (2026-11-14): no errors; warnings are script-share notes on page lines dominated by addresses and brand names, and English-identical entries reviewed in `REVIEW.json`.
- Store copy limits checked with Node: subtitle 28/30, short description 77/80, promotional text 120/170, keywords 93/100 bytes; every product name in `data.json` is 30 characters or fewer, so `LOCALE.json` needs no `displayNames` override.

## Remaining before release

1. Deploy the server (Greek push text and account form) before or with the game.
2. Native Greek review of the game text, tutorial, purchase, safety and legal pages, and a review of the terms and privacy policy for Greece and Cyprus (GDPR, consumer law).
3. Upload `docs/store/el/` to App Store Connect and Google Play with Greek screenshots (`npm run store:screenshots -- --language=el`); age rating through the stores.
4. Physical iOS and Android checks: language selection, native resource registration, Greek glyphs and tonos on cheap Android fonts, Greek keyboard input in chat, store purchase screens.
5. Greek moderation coverage: the chat filter's word list is English only.
