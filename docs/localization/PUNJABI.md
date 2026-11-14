---
document_type: punjabi_implementation
schema_version: 1
language: pa
variant: Everyday standard Punjabi in Gurmukhi script (India), respectful ਤੁਸੀਂ with polite imperatives (ਬਣਾਓ, ਰੱਦ ਕਰੋ), gender-neutral phrasing, Western digits
status: implemented_in_repo_release_checks_remain
measurements: SPANISH_SIZE.json (measured.pa)
---

# Punjabi translation

Punjabi (`pa`, script `Guru`, left to right) was released in commit `RELEASE_COMMIT`. It is served to `pa` and `pa-IN` devices and covers every namespace (`boot` 17, `ui` 152, `data` 669, `messages` 1,867, `pages` 314 = 3,019 entries), the six public pages and PWA manifest under `public/pa/`, the account-deletion form (`/account/delete?lang=pa`), and listing and product copy in `docs/store/pa/` (`LISTING.md`, `LOCALE.json`). Server push text, iOS/Android resources and StoreKit fixtures are part of the integration in `RELEASE_COMMIT`. Terms: `locales/pa/TERMS.md`; reviewed warnings: `locales/pa/REVIEW.json`. Shahmukhi (Pakistan, `pa-Arab`) is not covered.

The translation is AI-written and validated by the repository checks below. **No native Punjabi speaker has reviewed it**, nor the legal pages.

## What Punjabi needed

| Issue | How it is handled |
|---|---|
| **Gender agreement.** Punjabi verbs and adjectives agree with their subject's gender; the game knows neither the player's nor a placeholder's (`{name}`, `{building}`, `{troop}`). | As for Hindi (`GLOSSARY.md`): ਨੇ constructions (`{name} ਨੇ ਟੋਲੀ ਛੱਡ ਦਿੱਤੀ`), colons (`ਤਿਆਰ: {building}`) and noun phrases; `ਤੁਸੀਂ … ਸਕਦੇ ਹੋ` only where no neutral form is natural. ਦਾ/ਦੀ/ਦੇ agree with the following noun, so `{name} ਦਾ ਪਿੰਡ` is safe. |
| **NFC nukta letters.** ਖ਼ ਗ਼ ਜ਼ ਫ਼ ਲ਼ ਸ਼ (U+0A59–U+0A5B, U+0A5E, U+0A33, U+0A36) are composition exclusions: NFC stores them as base + ਼ (U+0A3C). | All text is NFC (the `i18n:check` rule; `locales/CLAUDE.md` describes it for Gurmukhi). |
| **Digits.** `Intl` formats `pa` with Western digits and Indian grouping (12,34,567; compact 12 ਲੱਖ). | Numbers inside the text use Western digits. |
| **Sentence end.** | The danda (।); ? and ! unchanged. |

Punjabi needed no code change; name validation accepts Gurmukhi letters.

## Fonts, plural and names

- No font is bundled. The Latin subsets fall back per character to the device's Gurmukhi font (Noto Sans Gurmukhi on Android, Gurmukhi Sangam MN/Gurmukhi MN on iOS, Nirmala UI on Windows); the shared fallback list names no Gurmukhi font, so this relies on system fallback.
- Plural categories (`Intl.PluralRules('pa')`): `one` (0 and 1) and `other`.
- Generated names use the default order (first part, space, second part), since Punjabi puts the modifier first: ਗਰਜ + ਚੋਟੀ = ਗਰਜ ਚੋਟੀ. First parts are nouns or invariant adjectives without ਦਾ/ਦੀ.
- Japanese names are transliterated (ਕਾਇਤੋ, ਤਾਕੇਦਾ, ਸੈਂਸੇਈ ਹੋਸ਼ੀ); Kage League (ਕਾਗੇ ਲੀਗ) stays distinct from Shadow League (ਛਾਇਆ ਲੀਗ).

## Validation

- `npm run i18n:check -- pa`: no errors; remaining warnings (English-identical, mixed-script and length entries) reviewed in `REVIEW.json`.
- No Punjabi-specific test file or browser smoke check exists yet; `tests/locales/locales.test.ts` checks that every worksheet is in sync and passes its checks.

## Remaining before release

1. Native Punjabi review of the game text, tutorial, purchase, safety and legal pages, and an India-law review of the terms and privacy policy.
2. Typography on devices: the Devanagari rule in `styles.css` (no letter-spacing, `line-height: 1.25` on round-button labels) does not apply to `Guru`, although the Gurmukhi headline (ਸਿਰੋਰੇਖਾ) and vowel signs have the same needs; check the bottom bar and buttons at 320 px.
3. Confirm App Store Connect and Play Console offer Punjabi as a listing language, then upload `docs/store/pa/` with Punjabi screenshots (`npm run store:screenshots -- --language=pa` with a Gurmukhi font installed).
4. Physical iOS and Android checks: language selection, Gurmukhi glyphs on cheap Android phones, keyboard input in chat, store purchase screens.
5. Punjabi moderation coverage: the chat filter's word list is English only.
6. Computer players' generated names (Kaito Mori) stay in Latin letters because they are stored text.
