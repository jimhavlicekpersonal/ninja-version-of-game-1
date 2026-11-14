---
document_type: chinese_implementation
schema_version: 1
language: zh-Hans
variant: Mandarin in Simplified characters (mainland conventions) with 你, also served to Singapore and Malaysia
status: implemented_in_repo_release_checks_remain
measurements: SPANISH_SIZE.json (measured.zh-Hans)
---

# Simplified Chinese translation

Simplified Chinese (`zh-Hans`, Mandarin, Han script) is the eighth complete language (after French and Italian, merged from main the same day) and the
first in a Han script. It is written with mainland conventions and 你 (also in the legal
pages), and served to `zh-CN`, `zh-SG`, `zh-MY`, `zh-Hans-*` and plain `zh` devices. It
covers the same surfaces as German ([GERMAN.md](GERMAN.md)): every namespace (`boot` 17,
`ui` 151, `data` 669, `messages` 1,869, `pages` 314 = 3,020 entries, including the Tempering, stake and wall-payment text that arrived from main), the six public pages
and PWA manifest under `public/zh-Hans/`, the account-deletion form
(`/account/delete?lang=zh-Hans`), server push text, iOS (`zh-Hans.lproj`) and Android
(`values-b+zh+Hans`) resources, StoreKit fixtures (`zh_Hans`), and listing and product copy
in `docs/store/zh-Hans/`. Terms are in `locales/zh-Hans/TERMS.md`; reviewed warnings in
`locales/zh-Hans/REVIEW.json`.

Implemented in commit `d82a88f` (2026-11-09). The translation is AI-written and validated by the repository checks below. **No native
Chinese speaker has reviewed it**, nor the legal pages.

## What Mandarin needed

The translator instructions and the code were checked against Simplified Chinese before
translating. These were the compatibility problems, each fixed in this change:

| Issue | Fix |
|---|---|
| **Fonts (Han unification).** Chinese and Japanese share code points but not glyph shapes. The shared fallback stack in `styles.css` listed Hiragino Sans, Yu Gothic UI, Noto Sans JP and Meiryo before any Chinese font, so a Chinese page would be drawn in Japanese glyph forms, switching font inside a word wherever the Japanese font lacks a Simplified character (们, 这). Canvas text (`render/fonts.ts`) named no Chinese font at all. The Latin subset of M PLUS 1 also covered General Punctuation, so Chinese “ ” …… —— would have been drawn narrow from the Latin font. | `html[data-script="Hans"]` (and `"Hant"`, ready for Traditional Chinese) puts PingFang SC, Hiragino Sans GB, Microsoft YaHei and Noto Sans CJK SC first; Android picks Noto Sans CJK SC from `<html lang="zh-Hans">`. A second face of the same file, `M PLUS 1 Han`, leaves out U+2000–206F, so Chinese punctuation comes from the Chinese font. Canvas text uses the same stacks, chosen from `data-script`, which the start-up script sets before any module runs. No font is downloaded (owner policy). |
| **Language choice.** `zh-Hans-HK` matched Traditional (the region won over the script), and while `zh-Hant` is not shipped, Taiwan, Hong Kong and Macau devices got Simplified Chinese ahead of their next language, unlike iOS and Android. | `locales/matcher.mjs`: the script subtag wins; Traditional devices skip to their next preference (a Taiwanese phone set to Chinese, then English, gets English). |
| **Input methods.** Chat, Alliance search and friend search sent on `keydown` Enter, which is also the key that confirms a pinyin candidate, so a half-typed Chinese message was sent. The 160-code-point limit trimmed the field during a composition. | `isSubmitEnter` (`ui/dom.ts`: not while composing, not keyCode 229 as Safari reports it) and `limitCodePoints` (trims after `compositionend`), used by every such field. |
| **Lists and sentence ends.** The HUD joined armies, rewards, unlock lists and trial modifiers with `", "` and appended a literal `"."` in four places, so Chinese showed ASCII commas and periods (and Hindi a `.` instead of `।`). | Lists go through `listText` (`Intl.ListFormat`: 忍者、苦无好手和铁甲守卫); sentence ends use the new key `text.period` (。, ।, `.` elsewhere), translated in every ready language. |
| **Untranslated friend card.** The friend and suggestion cards built `Clan Keep 7 · Sprout league` in English in every language, from the league's id. | They use the Clan Keep key and the league's display name from the data (天守阁 7 级 · 青竹联赛; English now says Bamboo League). |
| **Simplified vs Traditional.** Unicode has one Han script, so the check's script share could not tell Simplified, Traditional and Japanese forms apart; a Traditional or Japanese character in `zh-Hans` would have passed. | `tools/i18n/lib.mjs` `wrongHanForms`: `i18n:check` fails on common Traditional and shinjitai forms in `zh-Hans` (們 這 戰 點 戦 気 剣 図 …) and warns on Simplified-only forms in `zh-Hant`. |
| **Script check noise.** One Han character is about a word, while every letter of a Latin brand counted separately, so 135 correct Chinese entries warned "mostly uses a different script" (无法加载 Kagemura). | In Han, kana and Hangul a Latin word counts once; 37 entries remain, all around technical identifiers, and are reviewed in `REVIEW.json`. |
| **Glossary gaps.** Nothing covered languages without spaces: measure words, where half-width spaces go, full-width punctuation, ASCII-only ICU syntax, plural with only `other`, 他/她 for a player, Japanese names in kanji rather than by sound, or how the Kage League stays distinct from the Shadow League when both are 影. The zh-Hans note was "Mainland conventions. Full-width punctuation." | `GLOSSARY.md` gains a Chinese/Japanese section and those rules; `languages.json` has a full zh-Hans note and notes for zh-Hant; `locales/CLAUDE.md` points translators to them. |
| **Generated names.** Two-part names were joined with a space (雷鸣 峰). | `generatedNames: "compound"` for zh-Hans (and zh-Hant and ja): 雷鸣峰, 玄铁门, 双生刃. |

Chinese needed nothing else from the code: `Intl` gives the plural (`other` only), numbers
(1,234,567; compact 2287.2万), dates and lists; name validation already counts Han as two
display units and allows Han with Latin; `<html lang>` and `dir` were already set per
language; Chinese wraps between any two characters, so the two-line bottom-bar labels fit,
and tutorial buttons were shortened to fit at 320 px (跳过, 准备好了).

## Storage

Measured by `npm run i18n:build` (`SPANISH_SIZE.json`, `measured.zh-Hans`): the runtime pack
is 205,040 bytes UTF-8 (75,780 gzip, 60,949 Brotli) for 2,706 strings, smaller raw than
German (about 222,000) because one Han character (three bytes) replaces a word; compressed it is
the same size. No font is bundled.

## Validation

- `npm run i18n:check -- zh-Hans`: no errors; every English-identical and Latin-heavy entry reviewed in `REVIEW.json` (brands, the game's name, placeholders-only strings, technical identifiers).
- `tests/locales/chinese.test.ts`: catalog complete and ready; no Traditional or Japanese forms and no kana; `zh-CN`, `zh-SG`, `zh-MY`, `zh`, `zh-Hans-HK` and `zh_CN` pick Chinese, Traditional devices never do; numbers, compact 万, lists, `text.period`; plural `other` with measure words; compact generated names; full-width punctuation outside the ICU syntax and no 他/她 next to a placeholder; the Chinese font rules; literal player parameters, unchanged canonical data and seeded bases; pages, account form, push text, native resources and StoreKit.
- Built client in Chromium (a scratch copy of `npm run i18n:smoke` set to `zh-CN`, 390×844, with WenQuanYi Zen Hei standing in for the phone's Chinese font): all 12 panels and their tabs, no page errors, no English left except computer players' Japanese names (kept literal in every language), the language names in Settings (English, Español, Deutsch …), prices (US$, the test store), `fps`, `UTC` and the game's name; the bottom bar fits and Build opens at 320, 360, 390, 568 and 844 px; only the Chinese pack is fetched and cached; an offline reload stays in Chinese; switching to English keeps every building's identity; a failed language download keeps the working preference. The computed body font starts with `M PLUS 1 Han`, `PingFang SC`. Emulation is not physical-device evidence.

## Remaining before release

1. Deploy the server (Chinese push catalog and account form) before or with the game.
2. Native Chinese review of the game text, the tutorial, purchase, safety and legal pages.
3. **China mainland: owner decision 2026-11-13 — pursue it through a licensed Chinese publisher.** No mainland release until that publisher holds the licence; keep China mainland excluded in App Store Connect until then. Games with in-app purchases need an NPPA game publication licence (版号) for the China mainland App Store, plus real-name verification and the minors' play-time rules; data rules (PIPL) differ; Google Play is not available there. Until then, list Simplified Chinese for other storefronts only (Singapore, Malaysia, worldwide Chinese readers) and do not claim mainland availability.
4. Physical iOS and Android checks: language selection, the `zh-Hans.lproj`/`values-b+zh+Hans` registration (and that `zh_Hans` is the locale Xcode's StoreKit file expects), glyphs on cheap Android phones, pinyin input in chat, permission sheets and store purchase screens.
5. Upload `docs/store/zh-Hans/` to App Store Connect (Chinese (Simplified)) and Google Play (zh-CN), with Chinese screenshots (`npm run store:screenshots -- --language=zh-Hans` on a machine with a Chinese font).
6. Chinese moderation coverage: the chat filter's word list is English only.
7. Traditional Chinese (`zh-Hant`) is still untranslated; its devices get their next language until it ships.
