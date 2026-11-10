---
document_type: romanian_implementation
schema_version: 1
language: ro
variant: Standard Romanian (Romania) with tu, also served to Moldova
status: implemented_in_repo_release_checks_remain
measurements: SPANISH_SIZE.json (measured.ro)
---

# Romanian translation

Romanian (`ro`) was released together with Catalan on 2026-11-10 (commit recorded below). It is written in standard Romanian with *tu*, also in the legal pages, and served to `ro-RO` and `ro-MD` devices (and the old `mo` code). It covers every namespace (3,020 entries), the six public pages and PWA manifest under `public/ro/`, the account-deletion form (`/account/delete?lang=ro`), server push text, iOS (`ro.lproj`) and Android (`values-ro`) resources, StoreKit fixtures for `ro`, and listing and product copy in `docs/store/ro/`. Terms: `locales/ro/TERMS.md`; reviewed warnings: `locales/ro/REVIEW.json`.

The translation is AI-written and validated by the repository checks below. **No native Romanian speaker has reviewed it**, nor the legal pages.

## Instruction fixes it needed (commit `cc0ce64`)

The Romanian line in `languages.json` only said "comma-below ș ț", and nothing enforced it. Before translating:

- **Plurals.** CLDR gives Romanian `one` (1), `few` (0, 2–19, 101–119…) and `other` (20 and up), and `other` needs *de* (*20 de războinici*). The note, `GLOSSARY.md` and `TERMS.md` now say to write all three branches, and that a plain `{n}` before a noun is wrong from 20 up, so the count goes after a colon (*Colectează Monede: {n}*). `romanian.test.ts` checks that every plural with a `one` branch also has `few`.
- **Articles and cases are endings.** *satul*, *satului* and *lui {name}* depend on a word the game does not know. Nothing attaches to a placeholder; a colon or an articled noun in apposition is used instead (*Satul: {name}*). The release test refuses `lui {…}` and `{…}-ului`.
- **Generated names.** `generatedNames: "noun-first"` with articled second parts (*Vârful*, *Valea*) and genitive or *de* first parts (*Tunetului*, *Ceții*, *de Fier*): *Vârful Tunetului*, *Defileul de Purpură*.
- **Cedilla.** `npm run i18n:check` now fails on ş ţ Ş Ţ for Romanian (`tools/i18n/lib.mjs`).

## Fonts

The bundled fonts (M PLUS 1, Dela Gothic One) are Latin-1 subsets, so ă ș ț were drawn one by one from a system font inside otherwise bundled-font words (the browser check showed the *ă* of the *Armată* title in a different face). Romanian now uses the device fonts throughout, HUD and canvas, with the bolder title weights other scripts use (`SYSTEM_FONT_LANGS` in `render/fonts.ts`, `html:is([lang="ro"])` in `styles.css`). `tests/locales/latin-fonts.test.ts` fails when any ready Latin-script language uses letters outside the subsets and is not listed. No font is downloaded (owner decision).

## Romanian specifics

- Resource amounts built by generic templates (`{arg1} {arg2}`, `{arg1} Jad`) stay in label style without *de* (*500 Monede*, as prices are written *20 lei*); sentences use plurals or a colon. The StoreKit descriptions use `Intl.PluralRules` (*45 de Jad*, *30 de plăți zilnice*).
- Nothing agrees with the player: *Bine ai venit* is neutral; *Membru nou în Alianță: {arg1}*, *Ai blocat: {arg1}*.
- `Intl` writes 1.234.567 and 2.400, percentages with a no-break space (20 %).

## Storage

`npm run i18n:build` (`measured.ro`): 226,830 bytes UTF-8 (74,792 gzip, 63,533 Brotli), about the size of Italian. The six pages and manifest add 50,812 bytes.

## Validation

- `npm run i18n:check -- ro`: no errors; English-identical entries reviewed in `REVIEW.json` (Japanese names, brands, parameter-only templates, script names and words Romanian uses as they are). Three length warnings are the Japanese statutory titles.
- `tests/locales/romanian.test.ts`: catalog complete and ready, device choice, numbers, one/few/other with *de*, comma-below letters (and the check refusing the cedilla), noun-first names, nothing attached to a placeholder, unchanged canonical data, pages, account form and push text.
- Built client in Chromium (`ro-RO`, scratch copy of `tools/i18n/smoke.mjs`): all 12 panels and tabs, no page errors; the bottom bar fits and Build opens at 320, 360, 390, 568 and 844 px; only the Romanian pack is fetched and cached; offline reload stays in Romanian; switching to English keeps every building's identity. The synthetic failed-switch step could not be reproduced (the pack was still served from cache, so the switch succeeded); the Catalan run covered it. The *Next* train-ahead buttons in the Army panel clip their count at 390 px, as in Spanish, which already ships: a shared layout limit, not new. Emulation is not physical-device evidence.

## Remaining before release

1. Deploy the server (Romanian push catalog and account form) before or with the game.
2. Native Romanian review, including the tutorial, purchase, safety and legal pages, and a Romanian-law review of the terms and privacy policy (ANSPDCP named as the local authority).
3. Physical iOS and Android checks of the system-font rendering; uploading `docs/store/ro/` to App Store Connect and Google Play with Romanian screenshots.
4. Romanian moderation coverage: the chat filter's word list is English only.
