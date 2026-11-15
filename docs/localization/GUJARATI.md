---
document_type: gujarati_implementation
schema_version: 1
language: gu
variant: Standard Gujarati (gu-IN), everyday register (not Sanskritised), respectful તમે for the player, short imperatives or nouns on buttons
status: implemented_in_repo_release_checks_remain
measurements: SPANISH_SIZE.json (measured.gu)
---

# Gujarati translation

Gujarati (`gu`, script `Gujr`, left to right) was released in commit `d6ab7b8`. It covers every namespace (3,019 entries in `npm run i18n:check -- gu`) and the six public pages and PWA manifest under `public/gu/`; the release commit wires up the account-deletion form (`/account/delete?lang=gu`), server push text, iOS and Android resources and StoreKit fixtures from `docs/store/gu/LOCALE.json`, next to the listing copy in `docs/store/gu/LISTING.md`. Terms: `locales/gu/TERMS.md`; reviewed warnings: `locales/gu/REVIEW.json`.

The translation is AI-written and validated by the repository checks below. **No native Gujarati speaker has reviewed it**, nor the legal pages.

## What Gujarati needed

| Issue | How it is handled |
|---|---|
| Past-tense verbs agree with gender (જીત્યો/જીતી); the game knows neither the player's nor `{name}`'s gender. | તમે with the respectful plural (તમે જીત્યા), એ constructions ({name}એ જીત મેળવી) or noun phrases (વિજય: {name}). |
| Postpositions (નું, ને, માં, થી) join the word before them. | They attach to the placeholder ({name}નું ગામ); નું/ની/નો agree with the owned noun, never with the placeholder. |
| **0 is `one`** in Gujarati. | Every `one` branch reads correctly for 0 (`GLOSSARY.md`); the count comes before the noun ({n} યોદ્ધા). |
| Script-share warnings on ICU syntax and vowel signs. | `scriptShare` ignores ICU keywords and counts vowel signs as letters; remaining warnings (Latin brand names, legal placeholders) are reviewed in `REVIEW.json`. |

No Gujarati-specific checker rule was needed. No font is bundled and the stylesheet names no Gujarati family: text falls back per character to the device's Gujarati font (Noto Sans Gujarati on Android, Gujarati Sangam on iOS, Nirmala UI on Windows).

Key terms: કુળ કિલ્લો (Clan Keep), જેડ (Jade), સીઝન ઓળિયું (Season Scroll), ગઠબંધન (Alliance), ટોળકી (Gang), છાયા કસોટીઓ (Shadow Trials), ધુમાડા બોમ્બ, તોડફોડિયો, ઘૂસણખોરી બિંદુઓ, કુળ વેતન (Clan Stipend), ગુરુ હોશી. Kagemura, store and platform names stay in Latin letters; Japanese personal names are written in Gujarati script (કાઇતો, હાના).

Generated names use the default order (first part, space, second part): adjectives precede nouns and the first parts are uninflected (ગર્જના શિખર), with no નું/ની added.

Plurals (`Intl.PluralRules('gu')`): `one` (0 and 1) and `other`. Numbers use Western digits with Indian grouping: 12,34,567, compact 12 લાખ.

## Storage

`measured.gu`: 345,947 bytes UTF-8 (81,911 gzip, 65,046 Brotli) for 2,708 strings.

## Validation

- `npm run i18n:check -- gu`: no errors; warnings reviewed in `REVIEW.json`.
- Store copy lengths checked with Node: subtitle 29 of 30, short description 63 of 80, promotional text 102 of 170, keywords 97 of 100 bytes, StoreKit names and descriptions within 30 and 55.
- No browser smoke run or device check recorded for Gujarati yet.

## Remaining before release

1. Deploy the server (Gujarati push catalog and account form) before or with the game.
2. Native Gujarati review of the game text, tutorial, purchase, safety and legal pages.
3. Upload `docs/store/gu/` to App Store Connect and Google Play with Gujarati screenshots (`npm run store:screenshots -- --language=gu` on a machine with a Gujarati font).
4. Browser smoke check and physical iOS and Android checks: language selection, Gujarati glyphs and conjuncts on cheap Android phones (the CSS has no Gujarati-specific letter-spacing or line-height rule), bottom bar at 320 px, keyboard input in chat, store purchase screens.
5. Gujarati moderation coverage: the chat filter's word list is English only.
