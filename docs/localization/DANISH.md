---
document_type: danish_implementation
schema_version: 1
language: da
variant: Standard Danish (Denmark) with du, also served to Greenland and the Faroe Islands
status: implemented_in_repo_release_checks_remain
measurements: SPANISH_SIZE.json (measured.da)
---

# Danish translation

Danish (`da`) was released together with Norwegian Bokmål on 2026-11-10 in commit `DANISH_NORWEGIAN_COMMIT`. It is written in standard Danish with *du*, also in the legal pages, and served to `da-DK`, `da-GL`, `da-FO` and plain `da` devices. It covers every namespace (3,020 entries), the six public pages and PWA manifest under `public/da/`, the account-deletion form (`/account/delete?lang=da`), server push text, iOS (`da.lproj`) and Android (`values-da`) resources, StoreKit fixtures for `da`, and listing and product copy in `docs/store/da/`. Terms: `locales/da/TERMS.md`; reviewed warnings: `locales/da/REVIEW.json`.

The translation is AI-written and validated by the repository checks below. **No native Danish speaker has reviewed it**, nor the legal pages.

## Instruction fixes it needed (commits `6b08fcd`, `bc110dc`)

Danish had no note in `languages.json`. Before translating:

- **Definite article and genitive are endings.** *byen*, *tårnet* and *Annas by* attach to the word, and *en/et* gender changes adjectives and possessives (*stor/stort*, *din/dit*). The note, `GLOSSARY.md` and `TERMS.md` now say to attach nothing to a placeholder and let nothing agree with it: `By: {name}`, `Færdigbygget: {building}`, never `{name}s by`. `danish.test.ts` refuses a placeholder followed by *s*, *en*, *et*, *n*, *t* or *na*.
- **Danish is not Norwegian.** The two written languages look alike, and a translator working on both can mix them. `npm run i18n:check` now fails on the commonest Norwegian spellings in Danish (*igjen*, *enhet*, *kjøpe*, *etter*, *hva*, *ennå*) and on Swedish ä ö (`tools/i18n/lib.mjs`). The first version also listed *nå*; the check itself caught that Danish uses *nå* as a verb ("to reach"), so it was removed (`bc110dc`).
- **Generated names.** `generatedNames: "compound"`, with indefinite second parts: *Tordentop*, *Jernport*, *Midnatsblomst*.
- **Typography.** Quotation marks »…«; `Intl` writes 1.234.567 and 20 % with a no-break space.

## Fonts

æ ø å are inside the Latin-1 subsets of the bundled fonts, so Danish keeps the bundled fonts; `tests/locales/latin-fonts.test.ts` confirms it.

## Danish specifics

- Plural `one` is only 1 (*0 krigere*).
- *Togt* is the raid, *plyndrer* the raider, *angreb* an attack; *drage* means both kite and dragon, and kite units use it (*Drageplyndrer*, *Tordendrage*).
- Nothing agrees with the player: *Velkommen tilbage*, *Du gik med i {arg1}!*.

## Storage

`npm run i18n:build` (`measured.da`): 211,480 bytes UTF-8 (71,014 gzip, 60,674 Brotli). The six pages and manifest add 47,955 bytes.

## Validation

- `npm run i18n:check -- da`: no errors; English-identical entries reviewed in `REVIEW.json`. The length warnings are the Japanese statutory titles.
- `tests/locales/danish.test.ts`: catalog complete and ready, device choice, numbers, one/other, Danish spelling (and the check refusing Norwegian), compound names, nothing attached to a placeholder, unchanged canonical data, pages, account form and push text.
- Built client in Chromium (`da-DK`, scratch copy of `tools/i18n/smoke.mjs`): all 12 panels and tabs with no untranslated markers or page errors; the Army action buttons do not overflow; the bottom bar fits and Build opens at 320, 360, 390, 568 and 844 px; the scout card shows no English rival names; only the Danish pack is fetched and cached; offline reload stays in Danish; switching to English keeps every building's identity. The synthetic failed-switch step could not be reproduced (the pack was still served from the service-worker cache), as in the Dutch and Romanian runs; the Norwegian run covered it. Emulation is not physical-device evidence.

## Remaining before release

1. Deploy the server (Danish push catalog and account form) before or with the game.
2. Native Danish review, including the tutorial, purchase, safety and legal pages, and a Danish-law review of the terms and privacy policy (Datatilsynet named as the local authority).
3. Physical iOS and Android checks; uploading `docs/store/da/` to App Store Connect and Google Play with Danish screenshots.
4. Danish moderation coverage: the chat filter's word list is English only.
