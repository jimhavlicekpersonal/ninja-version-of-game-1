---
document_type: thai_implementation
schema_version: 1
language: th
variant: Standard Thai for Thailand (th-TH), polite and friendly with คุณ, no gendered particles or pronouns, formal written Thai in the legal pages
status: implemented_in_repo_release_checks_remain
measurements: SPANISH_SIZE.json (measured.th)
---

# Thai translation

Thai (`th`, script `Thai`) was released together with Korean on 2026-11-10 in commit `c150f76`, with the instruction and code fixes in `1baa123`. It is the first language written without spaces between words that is not a Han script. It is served to `th`, `th-TH` and `th_TH` devices and covers every namespace (3,020 entries), the six public pages and PWA manifest under `public/th/`, the account-deletion form (`/account/delete?lang=th`), server push text, iOS (`th.lproj`) and Android (`values-th`) resources, StoreKit fixtures (`th`), and listing and product copy in `docs/store/th/`. Terms: `locales/th/TERMS.md`; reviewed warnings: `locales/th/REVIEW.json`.

The translation is AI-written and validated by the repository checks below. **No native Thai speaker has reviewed it**, nor the legal pages.

## What Thai needed

The language note said only "No spaces between words; the UI breaks lines with the browser's Thai line breaking". These were the compatibility problems, each fixed in `1baa123` or in the release commit:

| Issue | Fix |
|---|---|
| **Gendered politeness.** Thai polite particles and first-person pronouns mark the speaker's gender (ครับ/ผม male, ค่ะ/คะ/ดิฉัน female). Nothing told a translator that the game, Sensei Hoshi and the bot chat have no gender; the natural polite default would be one of them. | A Thai subsection in `GLOSSARY.md` and the `th` note: no gendered particle or pronoun, soften with นะ/เลย or nothing, เรา for Hoshi and bots, ฉัน for the player's own first-person labels; never เขา/เธอ for a player. `thaiGenderedWords` makes `i18n:check` fail on ครับ, ค่ะ, คะ (as a word, not in คะแนน), ผม and ดิฉัน. |
| **Generated names in the wrong order.** Thai puts the modifier after the noun and writes a name as one run of letters (ยอดเขาสายฟ้า). The existing modes either put the modifier first (default, compound) or join with a space (noun-first), which splits a Thai name into two phrases. | A new `generatedNames` mode, `noun-first-joined` (`ui/i18n.ts`), set for `th`: ยอดเขา + สายฟ้า = ยอดเขาสายฟ้า, ใบมีด + แฝด = ใบมีดแฝด. |
| **Spacing and punctuation.** Thai has no word spaces but puts one around numbers, Latin words and names, and between sentences, and uses no full stop. None of this was written down; the Chinese/Japanese spacing rules would have been wrong. | The Thai subsection covers spaces, classifiers after the number (นักรบ {n} คน), ไม้ยมก with spaces (อื่น ๆ), no full stop (`text.period` stays `.`, since it cannot be empty), Royal Institute loanword spelling (อัปเกรด). |
| **Lists ran numbers into และ.** `Intl.ListFormat('th')` attaches the last item to และ/หรือ, right for a Thai word but not for a number (เหรียญและ2,400 เสบียง in "not enough resources"). | `listFormat` in `locales/runtime.ts`, used by the client and the server, adds the space before a number or Latin word; `thai.test.ts` checks it. |
| **Typography.** Letter-spacing pulls Thai vowel and tone marks off their consonants, the tight `line-height: 1.05` labels clip stacked marks, `word-break: break-all` on the event log can cut inside a word, and the shared fallback listed Thai fonts after the Japanese ones; canvas text named no Thai font. | `html[data-script="Thai"]`: Thonburi, Sukhumvit Set, Leelawadee UI and Noto Sans Thai first, no letter-spacing, line height 1.3 on the round and plain buttons, normal word breaking on the log; `render/fonts.ts` has the same `Thai` stack. |

Thai needed nothing else from the code: Chromium, Safari and Firefox find Thai line breaks with their dictionaries; `Intl` gives the plural (`other` only), Western digits (1,234,567) and Buddhist-era dates (10 พ.ย. 2569), which is the Thai convention; name validation already accepts Thai script.

## Thai specifics

- Japanese names in Thai script (Kaito ไคโตะ, Takeda ทาเคดะ); Sensei Hoshi is อาจารย์โฮชิ; Kage League ลีกคาเงะ stays distinct from Shadow League ลีกเงา.
- The Japanese statutory pages are translated in full (ประกาศตามกฎหมายธุรกรรมการค้าเฉพาะของญี่ปุ่น, ประกาศตามกฎหมายบริการชำระเงินของญี่ปุ่น); the support page links them by their Japanese titles.
- `Intl` compact numbers for Thai use K (12K), as Thai apps commonly do.
- The script-share warning fires on short Thai strings beside a Latin brand (Kagemura is eight Latin letters, longer than most Thai words); those entries are reviewed in `REVIEW.json`.

## Storage

`npm run i18n:build` (`measured.th`): 343,055 bytes UTF-8 (79,264 gzip, 63,120 Brotli) for 2,706 strings: Thai letters take three bytes each in UTF-8, so the raw pack is the largest so far, and about the same as Japanese once compressed.

## Validation

- `npm run i18n:check -- th`: no errors; English-identical and Latin-heavy entries reviewed in `REVIEW.json`.
- `tests/locales/thai.test.ts`: catalog complete and ready; device choice; Western digits and the Buddhist-era year; the และ spacing fix; plural `other` with classifiers; no gendered particle or pronoun (and the check catches one, not คะแนน); Kage and Shadow League distinct; noun-first joined generated names; literal player chat and unchanged canonical data; the Thai font, letter-spacing and word-break rules; pages, account form, push text, native resources and StoreKit.
- Built client in Chromium (a scratch copy of `tools/i18n/smoke.mjs` set to `th-TH`, 390×844, with the TLWG Loma font standing in for the phone's Thai font): all 12 panels and their tabs, no page errors, no English left except the language names in Settings and computer players' names; Thai text wraps between words on the panels; the bottom bar fits and Build opens at 320, 360, 390, 568 and 844 px; the Army action buttons do not overflow; only the Thai pack is fetched and cached; an offline reload stays in Thai; switching to English keeps every building's identity; a failed language download keeps the working preference. Emulation is not physical-device evidence.

## Remaining before release

1. Deploy the server (Thai push catalog, account form and the list-spacing fix) before or with the game.
2. Native Thai review of the game text, tutorial, purchase, safety and legal pages, and a Thai-law review of the terms and privacy policy (PDPA, the Consumer Protection Act and the Electronic Transactions Act).
3. Upload `docs/store/th/` to App Store Connect and Google Play with Thai screenshots (`npm run store:screenshots -- --language=th` on a machine with a Thai font); age rating through the stores.
4. Physical iOS and Android checks: language selection, `th.lproj`/`values-th` registration, stacked marks on cheap Android phones' fonts, Thai keyboard input in chat, store purchase screens.
5. Thai moderation coverage: the chat filter's word list is English only.
6. Computer players' generated names (Kaito Mori) stay in Latin letters because they are stored text.
