---
document_type: vietnamese_implementation
schema_version: 1
language: vi
variant: Standard Vietnamese (vi-VN), friendly and polite with bạn, no kinship pronouns for the player, new-style tone placement
status: implemented_in_repo_release_checks_remain
measurements: SPANISH_SIZE.json (measured.vi)
---

# Vietnamese translation

Vietnamese (`vi`, script `Latn`) was released together with Traditional Chinese on 2026-11-10 in commit `RELEASE_COMMIT`, with the instruction and code fixes in `7a690eb`. It is served to `vi`, `vi-VN` and `vi_VN` devices and covers every namespace (3,020 entries), the six public pages and PWA manifest under `public/vi/`, the account-deletion form (`/account/delete?lang=vi`), server push text, iOS (`vi.lproj`) and Android (`values-vi`) resources, StoreKit fixtures (`vi`), and listing and product copy in `docs/store/vi/`. Terms: `locales/vi/TERMS.md`; reviewed warnings: `locales/vi/REVIEW.json`.

The translation is AI-written and validated by the repository checks below. **No native Vietnamese speaker has reviewed it**, nor the legal pages.

## What Vietnamese needed

The language note said only "Full diacritics (precomposed, NFC)". These were the compatibility problems, each fixed in `7a690eb`:

| Issue | Fix |
|---|---|
| **Pronouns state gender and age.** Vietnamese has no neutral "he/she": anh ấy, cô ấy, chị ấy, ông ấy, bà ấy all say who the person is relative to the speaker. Players, {name} and bots have no known gender or age. | The `vi` note and a Vietnamese subsection in `GLOSSARY.md`: bạn for the player, the name or họ for others, ta for Sensei Hoshi; `vietnameseGendered` makes `i18n:check` fail on the ấy forms. Fixed characters (Akane, Yoru) may be bà. |
| **Two tone-placement styles.** hoà/hòa, khoẻ/khỏe, thuỷ/thủy are both seen; mixing them looks careless and breaks search. | New-style placement throughout (hòa, khỏe, thủy); `oldStyleTones` makes the check fail on the old style (qu- excepted: quý is right). |
| **Generated names in the wrong order.** Vietnamese puts the modifier after the noun. | `generatedNames: noun-first` for `vi`: Đỉnh + Sấm Sét = Đỉnh Sấm Sét, Lưỡi Kiếm + Song Sinh = Lưỡi Kiếm Song Sinh. |
| **Missing letters in the bundled fonts.** ă, ơ, ư, đ and the stacked tone marks (ệ, ở, ữ) are outside the bundled display font's Latin-1 subset, so they would render in a fallback face mid-word; tight `line-height: 1.05` labels clip stacked marks. | `vi` joins `SYSTEM_FONT_LANGS` (canvas text) and the system-font CSS rule with Romanian; tight round-button labels get `line-height: 1.25` in Vietnamese. `latin-fonts.test.ts` keeps this enforced. |

Vietnamese needed nothing else from the code: `Intl` gives the plural (`other` only), dot-grouped numbers (1.234.567) and Vietnamese dates; name validation accepts Vietnamese letters.

## Storage

`npm run i18n:build` (`measured.vi`): 240,083 bytes UTF-8 (73,887 gzip, 61,557 Brotli) for 2,706 strings.

## Validation

- `npm run i18n:check -- vi`: no errors; English-identical entries (Japanese names, Shinobi, Kage, brands and placeholder-only strings) reviewed in `REVIEW.json`.
- `tests/locales/vietnamese.test.ts`: catalog complete, NFC and ready; device choice; Vietnamese number grouping; plural `other` with the number before the noun; no ấy pronoun and no old-style tone anywhere (and the checks catch them); Kage and Shadow League distinct; noun-first generated names; literal player chat and unchanged canonical data; the system font; pages, account form, push text, native resources and StoreKit.
- Built client in Chromium (a scratch copy of `tools/i18n/smoke.mjs` set to `vi-VN`, 390×844): all 12 panels and their tabs, no page errors, no English left except the language names in Settings and Japanese names (Shinobi, Kunai and computer players' names); the script-share detector lists Vietnamese words cut at their diacritics, which are not English; the bottom bar fits and Build opens at 320, 360, 390, 568 and 844 px; only this language's pack is fetched and cached; an offline reload stays in the language; switching to English keeps every building's identity; a failed language download keeps the working preference. Emulation is not physical-device evidence.

## Remaining before release

1. Deploy the server (Vietnamese push catalog and account form) before or with the game.
2. Native Vietnamese review of the game text, tutorial, purchase, safety and legal pages, and a Vietnam-law review of the terms and privacy policy (Decree 13/2023 on personal data, the consumer protection law) and of Vietnam's licensing rules for online games (Decree 147/2024), which may require a local publisher before release in Vietnam.
3. Upload `docs/store/vi/` to App Store Connect and Google Play with Vietnamese screenshots (`npm run store:screenshots -- --language=vi`); age rating through the stores.
4. Physical iOS and Android checks: language selection, `vi.lproj`/`values-vi` registration, stacked diacritics on cheap Android phones' fonts, Telex/VNI keyboard input in chat, store purchase screens.
5. Vietnamese moderation coverage: the chat filter's word list is English only.
6. Computer players' generated names (Kaito Mori) stay in Latin letters because they are stored text.
