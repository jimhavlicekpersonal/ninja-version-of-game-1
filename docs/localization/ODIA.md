---
document_type: odia_implementation
schema_version: 1
language: or
variant: Standard written Odia (Odisha, India), respectful ଆପଣ with polite imperatives (କରନ୍ତୁ, ଦିଅନ୍ତୁ), ତୁମେ only between Alliance bots, Latin digits
status: implemented_in_repo_release_checks_remain
measurements: SPANISH_SIZE.json (measured.or)
---

# Odia translation

Odia (`or`, script `Orya`, left to right) was released in commit `d6ab7b8`. It is served to `or` and `or-IN` devices and covers every namespace (`boot` 17, `ui` 152, `data` 669, `messages` 1,867, `pages` 314 = 3,019 entries), the six public pages and PWA manifest under `public/or/`, the account-deletion form (`/account/delete?lang=or`), and listing and product copy in `docs/store/or/` (`LISTING.md`, `LOCALE.json`). Server push text, iOS/Android resources and StoreKit fixtures are part of the integration in `d6ab7b8`. Terms: `locales/or/TERMS.md`; reviewed warnings: `locales/or/REVIEW.json`.

The translation is AI-written and validated by the repository checks below. **No native Odia speaker has reviewed it**, nor the legal pages.

## What Odia needed

| Issue | How it is handled |
|---|---|
| **Respect level.** Odia has ଆପଣ, ତୁମେ and ତୁ. | ଆପଣ for the player and in Sensei Hoshi's lines (GLOSSARY, Indic languages); ତୁମେ only in the bots' Alliance chat (`social.chatLines.*`). |
| **Case endings attach to words.** -ର, -ରେ, -କୁ, -ଙ୍କ written onto `{name}` or `{building}` would change with the name. | Nothing is attached to a placeholder: a colon or a following noun (`ଅପଗ୍ରେଡ୍ କରନ୍ତୁ: {building}`, `{name} ଗାଁ`). Counts take the classifiers ଟି/ଜଣ (`{n}ଟି ତାରା`, `# ଜଣ ଯୋଦ୍ଧା`). |
| **NFC nukta letters.** ଡ଼ ଢ଼ (U+0B5C, U+0B5D) are composition exclusions: NFC stores them as base + ଼ (U+0B3C). | All text is NFC (the `i18n:check` rule). Store copy here contains no zero-width characters. |
| **Digits.** `Intl` formats `or` with Latin digits and Indian grouping (12,34,567). | Numbers inside the text use Latin digits too (8 ସେକେଣ୍ଡ, 30%), unlike Bangla. |
| **Sentence end.** | The danda (।); `text.period` = "।". |

Odia needed no code change: verbs and pronouns carry no gender (ସେ, ସେମାନେ), and name validation accepts Odia letters.

## Fonts, plural and names

- No font is bundled. The Latin subsets fall back per character to the device's Odia font (Noto Sans Oriya on Android, Oriya Sangam MN on iOS, Nirmala UI or Kalinga on Windows); the shared fallback list names no Odia font, so this relies on system fallback.
- Plural categories (`Intl.PluralRules('or')`): `one` (only 1) and `other` (0 and 2 up); usually both branches are the same.
- Generated names use the default order (first part, space, second part), since Odia puts the modifier first: ବଜ୍ର + ଶୃଙ୍ଗ = ବଜ୍ର ଶୃଙ୍ଗ. First parts are invariant modifiers without -ର.
- Japanese names are transliterated (କାଇତୋ, ତାକେଦା, ଗୁରୁ ହୋଶି); Kage League (କାଗେ ଲିଗ୍) stays distinct from Shadow League (ଛାୟା ଲିଗ୍).

## Validation

- `npm run i18n:check -- or`: no errors; remaining warnings (English-identical and mixed-script entries) reviewed in `REVIEW.json`.
- No Odia-specific test file or browser smoke check exists yet; `tests/locales/locales.test.ts` checks that every worksheet is in sync and passes its checks.

## Remaining before release

1. Native Odia review of the game text, tutorial, purchase, safety and legal pages, and an India-law review of the terms and privacy policy.
2. `Intl` compact numbers for `or` print an unusual unit (1234567 → "1.2ନି"); check on devices that compact amounts read naturally, or show full numbers.
3. Typography on devices: the Devanagari rule in `styles.css` (no letter-spacing, `line-height: 1.25` on round-button labels) does not apply to `Orya`, whose vowel signs sit above and below; check the bottom bar and buttons at 320 px.
4. Confirm App Store Connect and Play Console offer Odia as a listing language, then upload `docs/store/or/` with Odia screenshots (`npm run store:screenshots -- --language=or` with an Odia font installed).
5. Physical iOS and Android checks: language selection, Odia glyphs on cheap Android phones (older phones may lack an Odia font), keyboard input in chat, store purchase screens.
6. Odia moderation coverage: the chat filter's word list is English only.
7. Computer players' generated names (Kaito Mori) stay in Latin letters because they are stored text.
