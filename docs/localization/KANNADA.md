---
document_type: kannada_implementation
schema_version: 1
language: kn
variant: Standard Kannada (kn-IN), simple register close to spoken use, respectful ನೀವು for the player, polite imperatives
status: implemented_in_repo_release_checks_remain
measurements: SPANISH_SIZE.json (measured.kn)
---

# Kannada translation

Kannada (`kn`, script `Knda`, left to right) was released in commit `d6ab7b8`. It covers every namespace (3,019 entries in `npm run i18n:check -- kn`) and the six public pages and PWA manifest under `public/kn/`; the release commit wires up the account-deletion form (`/account/delete?lang=kn`), server push text, iOS and Android resources and StoreKit fixtures from `docs/store/kn/LOCALE.json`, next to the listing copy in `docs/store/kn/LISTING.md`. Terms: `locales/kn/TERMS.md`; reviewed warnings: `locales/kn/REVIEW.json`.

The translation is AI-written and validated by the repository checks below. **No native Kannada speaker has reviewed it**, nor the legal pages.

## What Kannada needed

| Issue | How it is handled |
|---|---|
| Past-tense verbs show gender (ಬಂದನು/ಬಂದಳು); players and `{name}` have no known gender. | Respectful plural (ಸೇರಿದರು, ಗೆದ್ದರು) or noun phrases. |
| Case suffixes join the word (Dravidian); a suffix after a placeholder would depend on the name. | No suffix directly on a placeholder: a following noun carries it (`{name} ಅವರ ಗ್ರಾಮ`, `{building} ಕಟ್ಟಡವನ್ನು`) or a colon (`ಸಿದ್ಧ: {building}`), as `GLOSSARY.md` requires. |
| **0 is `one`** in Kannada. | Every `one` branch reads correctly for 0; the count comes before the noun ({n} ಯೋಧರು). |
| Loanwords such as ಅಪ್‌ಗ್ರೇಡ್ and ಆನ್‌ಲೈನ್ need ZWNJ (U+200C) to avoid a wrong conjunct. | ZWNJ only where the spelling needs it; `i18n:check` allows ZWJ/ZWNJ and rejects other invisible characters. |
| Kage written ಕಾಗೆ means "crow". | ಕಗೆ (both vowels short, as in かげ); ಕಗೆ ಲೀಗ್ stays distinct from ನೆರಳು ಲೀಗ್. |

No Kannada-specific checker rule was needed. No font is bundled and the stylesheet names no Kannada family: text falls back per character to the device's Kannada font (Noto Sans Kannada on Android, Kannada Sangam on iOS, Nirmala UI on Windows).

Key terms: ಕುಲದ ಕೋಟೆ (Clan Keep), ಜೇಡ್ (Jade), ಸೀಸನ್ ಸುರುಳಿ (Season Scroll), ಮೈತ್ರಿಕೂಟ (Alliance), ಗ್ಯಾಂಗ್ (Gang), ನೆರಳು ಪರೀಕ್ಷೆಗಳು (Shadow Trials), ಹೊಗೆ ಬಾಂಬ್, ವಿಧ್ವಂಸಕ, ನುಸುಳುವ ತಾಣಗಳು, ಕುಲದ ಭತ್ಯೆ (Clan Stipend). Kagemura, store and platform names stay in Latin letters; Japanese personal names are transliterated (ಕೈಟೋ, ಹಾನಾ).

Generated names use the default order (first part, space, second part): genitive or adjective first parts that do not inflect for gender, noun second parts (ಗುಡುಗಿನ ಶಿಖರ, ಕಬ್ಬಿಣದ ದ್ವಾರ).

Plurals (`Intl.PluralRules('kn')`): `one` (0 and 1) and `other`. Numbers use Western digits; CLDR gives Kannada Western grouping (1,234,567) and compact 1.2ಮಿ, unlike Marathi and Gujarati.

## Storage

`measured.kn`: 379,253 bytes UTF-8 (82,939 gzip, 65,579 Brotli) for 2,708 strings.

## Validation

- `npm run i18n:check -- kn`: no errors; warnings reviewed in `REVIEW.json`.
- Store copy lengths checked with Node: subtitle 29 of 30, short description 68 of 80, promotional text 104 of 170, keywords 97 of 100 bytes, StoreKit names and descriptions within 30 and 55.
- No browser smoke run or device check recorded for Kannada yet.

## Remaining before release

1. Deploy the server (Kannada push catalog and account form) before or with the game.
2. Native Kannada review of the game text, tutorial, purchase, safety and legal pages.
3. Upload `docs/store/kn/` to App Store Connect and Google Play with Kannada screenshots (`npm run store:screenshots -- --language=kn` on a machine with a Kannada font).
4. Browser smoke check and physical iOS and Android checks: language selection, Kannada glyphs and ZWNJ rendering on cheap Android phones (no Kannada-specific line-height rule; Kannada words run long), bottom bar at 320 px, keyboard input in chat, store purchase screens.
5. Kannada moderation coverage: the chat filter's word list is English only.
