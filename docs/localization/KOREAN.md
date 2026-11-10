---
document_type: korean_implementation
schema_version: 1
language: ko
variant: Standard Korean for South Korea (ko-KR), polite 해요체 in the game, formal 합니다체 in the legal pages, no second-person pronoun
status: implemented_in_repo_release_checks_remain
measurements: SPANISH_SIZE.json (measured.ko)
---

# Korean translation

Korean (`ko`, script `Kore`, written in Hangul only) was released together with Thai on 2026-11-10 in commit `c150f76`, with the instruction and code fixes in `1baa123`. It is served to `ko`, `ko-KR` and `ko_KR` devices and covers every namespace (`boot` 17, `ui` 151, `data` 669, `messages` 1,869, `pages` 314 = 3,020 entries), the six public pages and PWA manifest under `public/ko/`, the account-deletion form (`/account/delete?lang=ko`), server push text, iOS (`ko.lproj`) and Android (`values-ko`) resources, StoreKit fixtures (`ko`), and listing and product copy in `docs/store/ko/`. Terms: `locales/ko/TERMS.md`; reviewed warnings: `locales/ko/REVIEW.json`.

The translation is AI-written and validated by the repository checks below. **No native Korean speaker has reviewed it**, nor the legal pages.

## What Korean needed

The instructions and code were checked against Korean before translating. These were the compatibility problems, each fixed in `1baa123`:

| Issue | Fix |
|---|---|
| **Particles change with the word before them.** The glossary only said Japanese particles follow a placeholder unchanged. Korean 을/를, 이/가, 은/는, 과/와 and 으로/로 depend on whether the previous syllable ends in a consonant (마을을, 바다를), which the game cannot know for `{name}`, `{building}` or a number read aloud. A translator following the Japanese rule would write `{name}을` and be wrong for half of all names. | `GLOSSARY.md` explains the rule; `tools/i18n/lib.mjs` `koreanParticleAfterPlaceholder` makes `i18n:check` fail on a variable particle right after a placeholder or `#` (a rich-text token that closes known words, as on the pages, is fine; an empty `{t0}{t1}` value slot is not). Translations use invariant particles (의, 에, 도, 만, 까지), a colon, or a noun after the placeholder (`코인 {n}개`, `{name} 님이`), and 을(를) only where a sentence needs one. |
| **No friendly "you".** The glossary asked for the informal *you*; Korean games use none (당신 is cold, 너 talks down). | A Korean subsection: polite 해요체 in the game, 합니다체 in the legal pages, no 당신 or 너; never 그 or 그녀 for a player. `korean.test.ts` fails on 당신 and 그녀. |
| **Han characters passed as Korean.** The `Kore` script share counts Han, so Hanja or Japanese kana would pass the check. | `notKoreanRuns` makes the check fail on Han or kana runs, except runs quoted from the English (the two Japanese statutory page titles). |
| **Line breaking.** Browsers break Korean between any two syllables by default, splitting words across lines on narrow buttons. | `html[data-script="Kore"] body { word-break: keep-all; overflow-wrap: anywhere; }` in `styles.css`: lines break at spaces, as Korean is read. |
| **Fonts.** The shared fallback lists Japanese fonts first, and Noto Sans CJK JP draws Hangul with Japanese metrics; canvas text named no Korean font. | `html[data-script="Kore"]` puts Apple SD Gothic Neo, Malgun Gothic and Noto Sans CJK KR first; `render/fonts.ts` has the same `Kore` stack. No font is downloaded (owner policy). |

Korean needed nothing else from the code: `Intl` gives the plural (`other` only), numbers (1,234,567), compact numbers (1.2만), dates and lists (A, B 및 C); name validation already counts Hangul as wide and allows Hangul with Latin; `isSubmitEnter` already ignores the Enter that confirms an IME syllable.

## Korean specifics

- Numbers attach to counters: `{n}명` (warriors), `{n}개`, `{n}회`, `{h}시간 {m}분`; resources read `코인 {n}개`, `군량 {n}`.
- Japanese names are written by sound in Hangul, as Korean media do (Kaito 카이토, Takeda 다케다); Sensei Hoshi is 호시 사범; Kage League 카게 리그 stays distinct from Shadow League 그림자 리그.
- Generated names keep the English order with a space (천둥 봉우리, 쌍둥이 칼날); first parts are nouns or 관형형 modifiers so every pair reads naturally.
- The Japanese statutory pages are translated in full (일본 특정상거래법에 따른 표기, 일본 자금결제법에 따른 표시), as the Dutch and Swedish pages are; the support page still links them by their Japanese titles.

## Storage

`npm run i18n:build` (`measured.ko`): 228,304 bytes UTF-8 (75,330 gzip, 61,343 Brotli) for 2,706 strings. The six pages and manifest add about 60 KB.

## Validation

- `npm run i18n:check -- ko`: no errors; English-identical and Latin-heavy entries (brands, placeholder templates, `Lv.`, server field values) reviewed in `REVIEW.json`.
- `tests/locales/korean.test.ts`: catalog complete and ready; device choice; numbers, compact 만 and lists; plural `other` with counters; no variable particle after a placeholder (and the check catches one); Hangul only; no 당신/그녀; Kage and Shadow League distinct; generated names; literal player chat and unchanged canonical data; the Korean font and `keep-all` rules; pages, account form, push text, native resources and StoreKit.
- Built client in Chromium (a scratch copy of `tools/i18n/smoke.mjs` set to `ko-KR`, 390×844, with WenQuanYi Zen Hei standing in for the phone's Korean font): all 12 panels and their tabs, no page errors, no English left except the language names in Settings and computer players' names; the bottom bar fits and Build opens at 320, 360, 390, 568 and 844 px; the Army action buttons do not overflow; only the Korean pack is fetched and cached; an offline reload stays in Korean; switching to English keeps every building's identity; a failed language download keeps the working preference. Emulation is not physical-device evidence.

## Remaining before release

1. Deploy the server (Korean push catalog and account form) before or with the game.
2. Native Korean review of the game text, tutorial, purchase, safety and legal pages, and a Korean-law review of the terms and privacy policy (PIPA, the Game Industry Promotion Act, the Act on Consumer Protection in Electronic Commerce, and the probability-disclosure rules for random items).
3. Korean age rating (GRAC or a self-rating through the stores) and the App Store / Google Play Korean listings: upload `docs/store/ko/` with Korean screenshots (`npm run store:screenshots -- --language=ko` on a machine with a Korean font).
4. Physical iOS and Android checks: language selection, `ko.lproj`/`values-ko` registration, Hangul glyphs on cheap Android phones, Korean IME input in chat, store purchase screens.
5. Korean moderation coverage: the chat filter's word list is English only.
6. Computer players' generated names (Kaito Mori) stay in Latin letters because they are stored text.
