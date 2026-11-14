---
document_type: arabic_implementation
schema_version: 1
language: ar
variant: Modern Standard Arabic for every Arabic-speaking market, right to left, gender-neutral verbal-noun style, six plural categories, Western digits
status: implemented_in_repo_release_checks_remain
measurements: SPANISH_SIZE.json (measured.ar)
---

# Arabic translation

Arabic (`ar`, script `Arab`, right to left) was activated on 2026-11-14 in commit `ee21ee6` (layout and font fixes `9c351cf`, checks `d995636`, store copy `1ee11cb`) together with Indonesian, Russian and Turkish (the first right-to-left language to ship). It is served to every `ar-*` device (`ar`, `ar-SA`, `ar-EG`, `ar_AE`…) and covers every namespace (3,301 entries after the a1188d2 merge, including the server message codes and the complaint form; 3,041 at activation), the six public pages and PWA manifest under `public/ar/` (with `<html dir="rtl">` and `"dir": "rtl"`), the account-deletion form (`/account/delete?lang=ar`, also right to left), server push text, iOS (`ar.lproj`) and Android (`values-ar`) resources, StoreKit fixtures (`ar`), and listing and product copy in `docs/store/ar/`. Terms: `locales/ar/TERMS.md`.

The translation is AI-written and validated by the repository checks below. **No native Arabic speaker has reviewed it**, nor the legal pages.

## Translator's choices

- **Gender-neutral address.** The game does not know the player's gender, and Arabic marks it on imperatives and second-person present verbs (اضغط/اضغطي). Buttons and instructions use verbal nouns (بناء، ترقية، جمع), passives, «يمكنك + مصدر» and «يُرجى + مصدر»; unvocalised forms that read the same for both (ـك، أنت، هاجمت) are kept. Sensei Hoshi speaks in the inclusive «لنـ» form; bot chat may address the group in the plural. No adjective agrees with the player or a placeholder (masdar or idafa: انضمام {name} إلى التحالف).
- **Six plural categories** (zero, one, two, few, many, other) in every ICU plural, with the noun form each needs: محارب واحد، محاربان، 3 محاربين، 11 محاربًا، 100 محارب.
- **Western digits**, no direction marks in the text: the page direction and the browser's bidirectional algorithm order numbers, Latin brand names and placeholders.
- **Generated names** are noun-first idafas (`generatedNames: "noun-first"`): قمة + الرعد = قمة الرعد.

## What integration added

| Issue | Fix |
|---|---|
| Public pages and the account form were built with `<html lang="ar">` only, so they would render left to right. | `tools/i18n/pages.mjs` adds `dir="rtl"` for right-to-left languages; the PWA manifest gets `"dir": "rtl"` (`tools/i18n/build.mjs`); `public/legal.css` and the account form use logical properties (`padding-inline-start`, `text-align: start`). |
| Letter-spacing pulls Arabic's joined letters apart. | `html[data-script="Arab"]` drops letter-spacing (as Devanagari does) and gives tight round-button labels `line-height: 1.25`. |
| Dropdown chevrons sat on the right, over the first letters of right-aligned text (Army filters). | Right-to-left `select` rules put the chevron and its padding on the left. |
| The sandbox notice toast in portrait was pushed to the left, under the rail toggle (the rail moves to the left in right-to-left), because the right-to-left rule used `flex-end`, which already means left in a right-to-left flexbox. The head row was likewise pushed to the rail side. | The `align-self: flex-end` and `.hud-head { align-items: flex-end }` overrides are removed: logical `flex-start` is the right side, so the head mirrors the left-to-right layout and the toast keeps clear of the rail. |
| An Arabic catalog could lose few/many plural branches (3 محارب instead of 3 محاربين) or use Arabic-Indic digits without any check failing. | `npm run i18n:check` fails on both (`missingPluralForms`, `easternArabicDigits` in `tools/i18n/lib.mjs`). |

## Storage

`npm run i18n:build` (`measured.ar`): 273,457 bytes UTF-8 (79,836 gzip, 64,873 Brotli) for 2,725 strings.

## Validation

- `npm run i18n:check -- ar`: no errors; warnings are brand names and Japanese statutory page lengths. There is no `REVIEW.json` for Arabic yet.
- `tests/locales/arabic.test.ts`: catalog complete, NFC and ready; device choice and right-to-left; Western digits; all six plural categories with the right noun form (and the check catches a missing one); Kage and Shadow League distinct; noun-first generated names; literal player chat and unchanged canonical data; no letter-spacing; right-to-left pages, manifest and account form, push text, native resources and StoreKit.
- Built client in Chromium (sandbox with a Keep 10 village, `ar` locale) at 360×640 and 320×568: all 12 panels and their tabs, the village and the raid scout screen; no page errors, no horizontal page overflow, no element outside the viewport, no clipped button or heading, no `{placeholder}` or key left, no English words beyond brands and names; the bottom bar's five buttons fit at both widths. Screenshots were kept outside the repository. Emulation is not physical-device evidence, and the Chromium fonts are not the phones' Arabic fonts.

## Remaining before release

1. Deploy the server (Arabic push catalog and account form) before or with the game.
2. Native Arabic review of the game text, tutorial, purchase, safety and legal pages, including whether the verbal-noun style reads naturally on buttons and in Sensei Hoshi's lines. Legal review of the terms and privacy policy for the Arabic-speaking markets shipped to (Saudi PDPL, UAE PDPL, Egypt's data law) and their content and age-rating rules.
3. **Gang War = حرب العصابات also means guerrilla warfare** (and "gang" reads as criminal band); a reviewer should confirm it is acceptable in the target markets or pick another term (for example فرقة/حرب الفرق).
4. Upload `docs/store/ar/` to App Store Connect and Google Play with Arabic screenshots (`npm run store:screenshots -- --language=ar`); check the right-to-left store listing rendering; age rating through the stores.
5. Physical iOS and Android checks: language selection, `ar.lproj`/`values-ar` registration, the system Arabic fonts (Geeza Pro, Noto Sans Arabic) on cheap Android phones, mixed Arabic/number/Latin lines, Arabic keyboard input in chat, store purchase screens. Canvas labels (battle and village) were not checked for shaping on devices.
6. Arabic moderation coverage: the chat filter's word list is English only.
7. Computer players' generated names (Kaito Mori) stay in Latin letters because they are stored text.
