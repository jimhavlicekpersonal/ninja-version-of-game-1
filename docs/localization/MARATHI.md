---
document_type: marathi_implementation
schema_version: 1
language: mr
variant: Standard Marathi (mr-IN), everyday register (not Sanskritised), respectful तुम्ही for the player, polite imperatives, modern full stop
status: implemented_in_repo_release_checks_remain
measurements: SPANISH_SIZE.json (measured.mr)
---

# Marathi translation

Marathi (`mr`, script `Deva`, left to right) was released in commit `d6ab7b8`. It covers every namespace (3,019 entries in `npm run i18n:check -- mr`) and the six public pages and PWA manifest under `public/mr/`; the release commit wires up the account-deletion form (`/account/delete?lang=mr`), server push text, iOS and Android resources and StoreKit fixtures from `docs/store/mr/LOCALE.json`, next to the listing copy in `docs/store/mr/LISTING.md`. Terms: `locales/mr/TERMS.md`; reviewed warnings: `locales/mr/REVIEW.json`.

The translation is AI-written and validated by the repository checks below. **No native Marathi speaker has reviewed it**, nor the legal pages.

## What Marathi needed

| Issue | How it is handled |
|---|---|
| Past-tense verbs agree with gender (जिंकला/जिंकली); the game knows neither the player's nor `{name}`'s gender, nor Sensei Hoshi's. | तुम्ही with the polite past (तुम्ही जिंकलात), transitive ने/यांनी constructions, continuous present, future or noun phrases (विजय: {name}). Hoshi and bot chat avoid first-person simple tenses (मी करतो/करते). |
| Devanagari nukta letters are NFC composition exclusions. | Base + ़ (U+093C); `i18n:check` rejects U+0958–U+095F (`locales/CLAUDE.md`). |
| Devanagari headline and vowel signs. | Shares Hindi's `html[data-script="Deva"]` rules: no letter-spacing, 1.25 line height on round-button labels. |
| Script-share warnings on ICU syntax and vowel signs. | `scriptShare` ignores ICU keywords and counts vowel signs as letters; the remaining warnings (Latin brand names, legal placeholders) are reviewed in `REVIEW.json`. |

No Marathi-specific checker rule was needed. No font is bundled: text falls back to the device's Devanagari font (Noto Sans Devanagari, Kohinoor Devanagari, Nirmala UI), as for Hindi.

Key terms: कुळाचा किल्ला (Clan Keep), जेड (Jade), सीझन स्क्रोल (Season Scroll), युती (Alliance), टोळी (Gang), छाया परीक्षा (Shadow Trials), धूर बॉम्ब, घातपाती, घुसखोरी बिंदू, कुळ भत्ता (Clan Stipend). Kagemura, store and platform names stay in Latin letters; Japanese personal names are transliterated (काइतो, हाना).

Generated names use the default order (first part, space, second part): adjectives precede nouns and the first parts do not inflect for gender (वज्र शिखर, लोह द्वार, शांत कमळ).

Plurals (`Intl.PluralRules('mr')`): `one` (1 only) and `other` (0 and 2+). Numbers use Western digits (`numberingSystem: 'latn'`) with Indian grouping: 12,34,567, compact 12 लाख.

## Storage

`measured.mr`: 354,846 bytes UTF-8 (82,446 gzip, 65,536 Brotli) for 2,708 strings.

## Validation

- `npm run i18n:check -- mr`: no errors; warnings reviewed in `REVIEW.json`.
- Store copy lengths checked with Node: subtitle 24 of 30, short description 71 of 80, promotional text 102 of 170, keywords 100 of 100 bytes, StoreKit names and descriptions within 30 and 55.
- No browser smoke run or device check recorded for Marathi yet.

## Remaining before release

1. Deploy the server (Marathi push catalog and account form) before or with the game.
2. Native Marathi review of the game text, tutorial, purchase, safety and legal pages.
3. Upload `docs/store/mr/` to App Store Connect and Google Play with Marathi screenshots (`npm run store:screenshots -- --language=mr` on a machine with a Devanagari font).
4. Browser smoke check and physical iOS and Android checks: language selection, Devanagari glyphs on cheap Android phones, bottom bar at 320 px, keyboard input in chat, store purchase screens.
5. Marathi moderation coverage: the chat filter's word list is English only.
