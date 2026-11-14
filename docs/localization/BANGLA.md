---
document_type: bangla_implementation
schema_version: 1
language: bn
variant: Standard colloquial Bangla (cholito), for Bangladesh and West Bengal, respectful আপনি with polite imperatives (করুন, দিন), তুমি only between Alliance bots, Bengali digits
status: implemented_in_repo_release_checks_remain
measurements: SPANISH_SIZE.json (measured.bn)
---

# Bangla translation

Bangla (`bn`, script `Beng`, left to right) was released in commit `d6ab7b8`. It is served to `bn`, `bn-BD` and `bn-IN` devices and covers every namespace (`boot` 17, `ui` 152, `data` 669, `messages` 1,867, `pages` 314 = 3,019 entries), the six public pages and PWA manifest under `public/bn/`, the account-deletion form (`/account/delete?lang=bn`), and listing and product copy in `docs/store/bn/` (`LISTING.md`, `LOCALE.json`). Server push text, iOS/Android resources and StoreKit fixtures are part of the integration in `d6ab7b8`. Terms: `locales/bn/TERMS.md`; reviewed warnings: `locales/bn/REVIEW.json`.

The translation is AI-written and validated by the repository checks below. **No native Bangla speaker has reviewed it**, nor the legal pages.

## What Bangla needed

| Issue | How it is handled |
|---|---|
| **Respect level.** Bangla has three "you" forms (আপনি, তুমি, তুই). | আপনি for the player and in Sensei Hoshi's lines (GLOSSARY, Indic languages); তুমি only in the bots' Alliance chat (`social.chatLines.*`), which is friends talking among themselves. |
| **Case endings attach to words.** -এর, -এ, -কে, -তে written onto `{name}` or `{building}` would change with the name. | Nothing is attached to a placeholder: a colon or a following noun carries the ending (`আপগ্রেড করুন: {building}`). Counts take the classifiers টি/জন, which do not change with the number (`{n}টি তারা`, `# জন যোদ্ধা`). |
| **NFC nukta letters.** ড় ঢ় য় (U+09DC, U+09DD, U+09DF) are composition exclusions: NFC stores them as base + ় (U+09BC). | All text is NFC (the `i18n:check` rule; `locales/CLAUDE.md` describes it for Bengali). Store copy here contains no zero-width joiner or non-joiner. |
| **Digits.** `Intl` formats `bn` with Bengali digits and Indian grouping (১২,৩৪,৫৬৭; compact ১২ লা). | Numbers written inside the text use Bengali digits too (৮ সেকেন্ড, ৩০%), except version numbers (iOS 15) and legal section numbers; the listing follows the same rule. |
| **Sentence end.** | The dari (।); `text.period` = "।". |

Bangla needed no code change: verbs and pronouns carry no gender (সে, তারা), and name validation accepts Bengali letters.

## Fonts, plural and names

- No font is bundled. The Latin subsets fall back per character to the device's Bengali font (Noto Sans Bengali on Android, Kohinoor Bangla/Bangla Sangam MN on iOS, Nirmala UI on Windows); the shared fallback list names no Bengali font, so this relies on system fallback.
- Plural categories (`Intl.PluralRules('bn')`): `one` (0 and 1) and `other`; both branches are written so any number reads correctly (usually identical).
- Generated names use the default order (first part, space, second part), since Bangla puts the modifier first: বজ্র + শৃঙ্গ = বজ্র শৃঙ্গ, রক্তিম + পদ্ম = রক্তিম পদ্ম. First parts are invariant modifiers without -এর.
- Japanese names are transliterated (কাইতো, তাকেদা, গুরু হোশি); Kage League (কাগে লিগ) stays distinct from Shadow League (ছায়া লিগ).

## Validation

- `npm run i18n:check -- bn`: no errors; remaining warnings (English-identical and mixed-script entries) reviewed in `REVIEW.json`.
- No Bangla-specific test file or browser smoke check exists yet; `tests/locales/locales.test.ts` checks that every worksheet is in sync and passes its checks.

## Remaining before release

1. Native Bangla review of the game text, tutorial, purchase, safety and legal pages, and a review of the terms and privacy policy for Bangladesh and India.
2. Typography on devices: the Devanagari rule in `styles.css` (no letter-spacing, `line-height: 1.25` on round-button labels) does not apply to `Beng`, although the Bangla headstroke (মাত্রা) and vowel signs have the same needs; check the bottom bar and buttons at 320 px.
3. Upload `docs/store/bn/` to App Store Connect and Google Play with Bangla screenshots (`npm run store:screenshots -- --language=bn` with a Bengali font installed); age rating through the stores.
4. Physical iOS and Android checks: language selection, Bengali glyphs on cheap Android phones, keyboard input in chat, store purchase screens.
5. Bangla moderation coverage: the chat filter's word list is English only.
6. Computer players' generated names (Kaito Mori) stay in Latin letters because they are stored text.
