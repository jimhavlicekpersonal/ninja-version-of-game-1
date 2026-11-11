---
document_type: traditional_chinese_implementation
schema_version: 1
language: zh-Hant
variant: Taiwan Mandarin in Traditional characters (zh-TW), also served to Hong Kong and Macau; 你 for the player, 您 in the legal pages
status: implemented_in_repo_release_checks_remain
measurements: SPANISH_SIZE.json (measured.zh-Hant)
---

# Traditional Chinese translation

Traditional Chinese (`zh-Hant`, script `Hant`) was released together with Vietnamese on 2026-11-10 in commit `RELEASE_COMMIT`, with the instruction and code fixes in `7a690eb`. It is served to `zh-TW`, `zh-HK`, `zh-MO` and `zh-Hant-*` devices (mainland `zh-CN` devices keep Simplified Chinese) and covers every namespace (3,020 entries), the six public pages and PWA manifest under `public/zh-Hant/`, the account-deletion form (`/account/delete?lang=zh-Hant`), server push text, iOS (`zh-Hant.lproj`) and Android (`values-b+zh+Hant`) resources, StoreKit fixtures (`zh_Hant`), and listing and product copy in `docs/store/zh-Hant/`. Terms: `locales/zh-Hant/TERMS.md`; reviewed warnings: `locales/zh-Hant/REVIEW.json`.

It is a separate translation written for Taiwan, not a conversion of the Simplified Chinese catalog. The translation is AI-written and validated by the repository checks below. **No native Traditional Chinese speaker has reviewed it**, nor the legal pages, and Hong Kong vocabulary (which differs from Taiwan's in places) has not been reviewed at all.

## What Traditional Chinese needed

The glossary already said "not a character-by-character conversion of zh-Hans", but nothing enforced it. These were the compatibility problems, fixed in `7a690eb` or in the release commit:

| Issue | Fix |
|---|---|
| **Conversion slips through.** A zh-Hans → zh-Hant conversion produces correct-looking Traditional characters with mainland vocabulary (視頻, 服務器, 網絡, 默認, 登錄, 設置, 信息, 賬號), which reads as foreign in Taiwan. The checker only warned on a short list of Simplified forms. | `mainlandTerms` makes `i18n:check` fail on mainland words written in Traditional characters; Simplified forms and Japanese shinjitai (戦, 気, 図, 楽…) now fail instead of warning, with a longer list (`NOT_TRADITIONAL`). Han runs quoted from the English (the Japanese statutory page titles 資金決済法) are exempt, as for Korean. |
| **Gendered second person.** Taiwanese writing sometimes uses 妳 for a female reader; the player's gender is unknown. | 你 for the player everywhere (您 in the legal pages); 妳 fails the check. Fixed game characters (Akane, Yoru) may be 她, so 她 is allowed. |
| **Vocabulary and punctuation not written down.** | A Traditional Chinese subsection in `GLOSSARY.md`: Taiwan terms, 「」『』 quotes, full-width punctuation, the half-width space between Han and numbers or Latin words, measure words, Kage League 影級聯賽 distinct from Shadow League 暗影聯賽. |

Traditional Chinese needed nothing else from the code: device matching already sent `zh-TW`/`zh-HK`/`zh-MO` to `zh-Hant`, the `Hant` font stacks (PingFang TC, Microsoft JhengHei, Noto Sans TC) and CJK line breaking were in place, and compound generated names join with no space (雷霆峰, 玄鐵門, 雙生刃).

## Storage

`npm run i18n:build` (`measured.zh-Hant`): 203,336 bytes UTF-8 (75,110 gzip, 60,761 Brotli) for 2,706 strings, about the same as Simplified Chinese.

## Validation

- `npm run i18n:check -- zh-Hant`: no errors; English-identical and Latin-heavy entries reviewed in `REVIEW.json`.
- `tests/locales/traditional-chinese.test.ts`: catalog complete and ready; Taiwan, Hong Kong and Macau devices choose it and mainland devices keep Simplified; plural `other` with measure words; no mainland term and no 妳 anywhere (and the checks catch them and a Simplified form); Kage and Shadow League distinct; joined generated names; literal player chat and unchanged canonical data; the Traditional font stack; pages, account form, push text, native resources and StoreKit without Simplified forms.
- Built client in Chromium (a scratch copy of `tools/i18n/smoke.mjs` set to `zh-TW`, 390×844): all 12 panels and their tabs, no page errors, no English left except the language names in Settings and computer players' names; the bottom bar fits and Build opens at 320, 360, 390, 568 and 844 px; only this language's pack is fetched and cached; an offline reload stays in the language; switching to English keeps every building's identity; a failed language download keeps the working preference. Emulation is not physical-device evidence.

## Remaining before release

1. Deploy the server (Traditional Chinese push catalog and account form) before or with the game.
2. Native Taiwanese review of the game text, tutorial, purchase, safety and legal pages, and a Hong Kong review of vocabulary; a Taiwan-law review of the terms and privacy policy (Personal Data Protection Act, Consumer Protection Act; the game-software rating regulation).
3. Upload `docs/store/zh-Hant/` to App Store Connect and Google Play with Traditional Chinese screenshots (`npm run store:screenshots -- --language=zh-Hant`); age rating through the stores (Taiwan's game rating label is shown on Google Play).
4. Physical iOS and Android checks: language selection, `zh-Hant.lproj`/`values-b+zh+Hant` registration, Zhuyin and Cangjie keyboard input in chat, store purchase screens.
5. Traditional Chinese moderation coverage: the chat filter's word list is English only.
6. Computer players' generated names (Kaito Mori) stay in Latin letters because they are stored text.
