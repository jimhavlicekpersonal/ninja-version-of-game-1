---
document_type: japanese_implementation
schema_version: 1
language: ja
variant: Standard Japanese for Japan (ja-JP), polite です・ます in sentences, no second-person pronoun in the game
status: implemented_in_repo_release_checks_remain
measurements: SPANISH_SIZE.json (measured.ja)
---

# Japanese translation

Japanese (`ja`, script `Jpan`: kanji, hiragana and katakana) is the eleventh complete language and the
second in a Han script, after Simplified Chinese ([CHINESE.md](CHINESE.md)). It is written in standard
Japanese with polite です・ます in sentences (also in the legal pages) and short nouns or verbs on buttons,
and served to `ja`, `ja-JP` and `ja_JP` devices. It covers the same surfaces as German and Chinese:
every namespace (`boot` 17, `ui` 151, `data` 669, `messages` 1,869, `pages` 314 = 3,020 entries), the six
public pages and PWA manifest under `public/ja/`, the account-deletion form
(`/account/delete?lang=ja`), server push text, iOS (`ja.lproj`) and Android (`values-ja`) resources,
StoreKit fixtures (`ja`), and listing and product copy in `docs/store/ja/`. Terms are in
`locales/ja/TERMS.md`; reviewed warnings in `locales/ja/REVIEW.json`.

Implemented in commit `949b0da` (2026-11-10), with the instruction fixes in `4c6b0d0`. The translation is AI-written and validated by the repository checks below. **No native Japanese
speaker has reviewed it**, nor the legal pages. For Japan the legal pages matter more than elsewhere:
the two statutory pages (特定商取引法に基づく表記, 資金決済法に基づく表示) are required Japanese pages.

## What Japanese needed

The translator instructions and the code were checked against Japanese before translating. These were
the compatibility problems, each fixed in this change:

| Issue | Fix |
|---|---|
| **No register guidance.** The glossary asks for "the informal you where the language has one". Japanese has no friendly *you* to use (あなた is distant, 君 and お前 talk down), and the language note said only "use natural Japanese for ninja terms". A translator following the instructions would have written あなた everywhere, or plain-form text that reads rude in system messages. | `GLOSSARY.md` gains a Japanese subsection: polite です・ます in sentences, short nouns or verb stems on buttons, no second-person pronoun in the game (leave the player out); legal pages may say お客様. `languages.json` has a full `ja` note. `tests/locales/japanese.test.ts` fails on あなた or お前 outside the legal pages. |
| **Pronouns.** The rule against gendered pronouns for players named only Chinese 他/她. | Extended to 彼/彼女; the test fails on either. |
| **Spacing, counters and quotes written for Chinese.** The Chinese section asks for a half-width space between Han and digits (`还需 {n} 金币`), which is wrong in Japanese (小判500枚, {n}人); it gave Chinese quotes “ ” and measure words, not Japanese 「」 and counters. | The Japanese subsection: no space next to digits or number placeholders, one half-width space only next to a Latin word or brand (Game Center にサインイン), 「」 and 『』, ……, counters (人, 棟, 基, 回, 個, 件). The test fails on ASCII punctuation inside Japanese text and on “ ”. |
| **Kage League vs Shadow League.** Both are 影 in Japanese (*kage* means shadow), so the glossary's "Kage League must stay different from Shadow League" had no Japanese answer. | Shadow League is 闇リーグ, Kage League 影リーグ; the other Shadow names keep 影 (影の試練, 影墨). The test checks both league names. |
| **Names written for Chinese.** "Write Japanese names in kanji, not by sound" and Hoshi as 保志 were Chinese rules; for Japanese, Hoshi was given as ホシ先生 in one place and the kanji rule in another. | The glossary now says what Japanese does: generated names in kanji (Kaito 海斗, Takeda 武田), Sensei Hoshi ホシ先生, English epithets translated. |
| **Chinese character forms passed the check.** Unicode gives Chinese and Japanese one Han script, so a Simplified (战, 们, 图) or Traditional (戰, 們, 圖) form in Japanese passed `i18n:check`; the check only guarded `zh-Hans`. | `tools/i18n/lib.mjs` `wrongHanForms`: `i18n:check` fails on common Simplified-only and Traditional-only forms in `ja`, leaving out the characters Japanese shares with them (会, 来, 点, 国, 学, 時, 問題, 電話, 万, 宝). |
| **Script check noise.** ー (U+30FC, the katakana long-vowel mark) is Unicode Script=Common, so サーバー, リレー and other katakana words warned "mostly uses a different script". | `ー` counts as Japanese in the `Jpan` script share. |
| **Canvas text named no Japanese font.** `render/fonts.ts` had Chinese stacks for `Hans`/`Hant` and only `"M PLUS 1", "Segoe UI", system-ui` otherwise, so kana and kanji on the battlefield and map fell to whatever system font the browser picked (on Windows possibly a Chinese one). The HUD's shared fallback also listed Segoe UI, Roboto and Arial before the Japanese fonts, and the Latin subset of M PLUS 1 covered General Punctuation, so …… and dashes came from the Latin face. | `html[data-script="Jpan"]` in `styles.css` puts Hiragino Sans, Yu Gothic UI, Noto Sans JP/CJK JP and Meiryo first, never a Chinese font, with `M PLUS 1 Han` (no General Punctuation); `render/fonts.ts` has the same `Jpan` stack. No font is downloaded (owner policy). |
| **Statutory pages.** The English `tokushoho` and `shikin-kessai` pages are already bilingual (Japanese with English beside it). | The Japanese pages keep the project's Japanese statutory text unchanged and drop the English halves. The Pouch of Jade is 翡翠の小袋 in the game and the StoreKit fixtures, as the statutory page already called it. |

Japanese needed nothing else from the code: `Intl` gives the plural (`other` only), numbers
(1,234,567; compact 1.2万), dates and lists (A、B、C); name validation already counts kana and Han as two
display units and allows Han, kana and Latin together; `isSubmitEnter` already ignores the Enter that
confirms an IME candidate (added for Chinese); Japanese wraps between characters, so the two-line
bottom-bar labels fit.

## Storage

Measured by `npm run i18n:build` (`SPANISH_SIZE.json`, `measured.ja`): the runtime pack is 242,806 bytes
UTF-8 (77,306 gzip, 62,383 Brotli) for 2,706 strings, larger raw than Chinese (205,040) because kana
spell out what Chinese writes in one character, and the same size as Chinese once compressed. The six
pages and manifest add about 59,000 bytes. No font is bundled.

## Validation

- `npm run i18n:check -- ja`: no errors; every English-identical and Latin-heavy entry reviewed in `REVIEW.json` (brands, the game's name, placeholders-only strings, `Lv.`, `HP`, `XP`, `UTC`, server field values, the statutory page titles that are already Japanese in the source, and one CSS class string the extractor captured).
- `tests/locales/japanese.test.ts`: catalog complete and ready; no Simplified or Traditional Chinese forms; the long-vowel mark and Latin brands in the script check; `ja-JP`, `ja`, `ja_JP` pick Japanese; numbers, compact 万, lists, `text.period`; plural `other` with counters and no space; compound generated names (雷鳴峰, 双子刃); Kage League and Shadow League distinct; full-width punctuation, no “ ”, ASCII ICU syntax, no あなた/お前 in the game and no 彼/彼女; literal player chat, unchanged canonical data and seeded bases; the Japanese font rules; pages, account form, push text, native resources and StoreKit.
- Built client in Chromium (a scratch copy of `npm run i18n:smoke` set to `ja-JP`, 390×844, with IPAGothic standing in for the phone's Japanese font): all 12 panels and their tabs, no page errors, no English left except the computer players' names (stored in Latin letters and shown as written in every language), the language names in Settings, `fps`, `UTC` and the game's name; the bottom bar fits and Build opens at 320, 360, 390, 568 and 844 px; only the Japanese pack is fetched and cached; an offline reload stays in Japanese; switching to English keeps every building's identity; a failed language download keeps the working preference. Emulation is not physical-device evidence.

## Remaining before release

1. Deploy the server (Japanese push catalog and account form) before or with the game.
2. Native Japanese review of the game text, the tutorial, purchase, safety and legal pages, including whether 小判, 兵糧 and the other period terms read well to Japanese players.
3. Legal: the publisher's details on 特定商取引法に基づく表記 (seller, responsible person, address, phone or a disclosure-on-request statement) and 資金決済法に基づく表示 (issuer), a Japanese-law review of both and of the terms and privacy policy (APPI), and the prepaid-instrument filing if unused purchased Jade ever exceeds the statutory threshold. The pages keep their draft notices.
4. Physical iOS and Android checks: language selection, the `ja.lproj`/`values-ja` registration, glyphs on cheap Android phones, Japanese IME input in chat, permission sheets and store purchase screens.
5. Upload `docs/store/ja/` to App Store Connect (Japanese) and Google Play (ja-JP), with Japanese screenshots (`npm run store:screenshots -- --language=ja` on a machine with a Japanese font); the age rating (CERO is not required for app stores; IARC covers Google Play) is a store step.
6. Japanese moderation coverage: the chat filter's word list is English only.
7. Computer players' generated names (Kaito Mori) stay in Latin letters in every language because they are stored text; showing them in kanji in Japanese would need a display adapter.
