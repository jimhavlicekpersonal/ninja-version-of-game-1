---
document_type: norwegian_implementation
schema_version: 1
language: nb
variant: Norwegian Bokmål with du, also served to Nynorsk (nn) and plain Norwegian (no) devices
status: implemented_in_repo_release_checks_remain
measurements: SPANISH_SIZE.json (measured.nb)
---

# Norwegian Bokmål translation

Norwegian Bokmål (`nb`) was released together with Danish on 2026-11-10 in commit `5733b4b`. It is written in moderate, mainstream Bokmål with *du*, also in the legal pages, and served to `nb-NO`, `nb-SJ`, `no`, `no-NO` and `nn-NO` devices (the `alsoFor` aliases in `languages.json`). It covers every namespace (3,020 entries), the six public pages and PWA manifest under `public/nb/`, the account-deletion form (`/account/delete?lang=nb`), server push text, iOS (`nb.lproj`) and Android (`values-nb`, plus a duplicate `values-no` for older devices that report `no`) resources, StoreKit fixtures for `nb` (App Store Connect calls the language Norwegian), and listing and product copy in `docs/store/nb/`. Terms: `locales/nb/TERMS.md`; reviewed warnings: `locales/nb/REVIEW.json`.

The translation is AI-written and validated by the repository checks below. **No native Norwegian speaker has reviewed it**, nor the legal pages.

## Instruction fixes it needed (commits `6b08fcd`, `bc110dc`)

The Norwegian line in `languages.json` only said "Bokmål.". Before translating:

- **Nynorsk devices get Bokmål.** `alsoFor: ["no", "nn"]` sends Nynorsk and plain Norwegian devices to this text, which the note did not say. It now asks for moderate, mainstream Bokmål (masculine *-en* forms where feminine is optional, no Riksmål or Nynorsk forms), so the text reads naturally to all of them. A real Nynorsk translation would be a separate language entry.
- **Definite article and genitive are endings.** *byen*, *tårnet* and *Annas by*, and *en/ei/et* gender in adjectives and possessives (*din/ditt*): nothing attaches to or agrees with a placeholder (`By: {name}`, `Ferdig bygd: {building}`). `norwegian.test.ts` refuses a placeholder followed by an ending.
- **Norwegian is not Danish.** `npm run i18n:check` now fails on the commonest Danish spellings in Norwegian (*nu*, *igen*, *enhed*, *købe*, *efter*, *hvad*, *endnu*) and on Swedish ä ö.
- **Generated names.** `generatedNames: "compound"`, with indefinite second parts: *Tordentopp*, *Jernport*, *Midnattsblomst*.
- **Typography.** Quotation marks «…»; `Intl` groups thousands with a no-break space (1 234 567) and writes 20 %.

## Fonts

æ ø å are inside the Latin-1 subsets of the bundled fonts, so Norwegian keeps the bundled fonts; `tests/locales/latin-fonts.test.ts` confirms it.

## Norwegian specifics

- Plural `one` is only 1 (*0 krigere*).
- *Online* is *på nett* and online play *nettspill*; *tokt* is the raid, *plyndrer* the raider, *angrep* an attack; kite units use *drage*.
- The privacy policy says EØS where the English says EU, since Norway applies the GDPR through the EEA, and names Datatilsynet.

## Storage

`npm run i18n:build` (`measured.nb`): 211,786 bytes UTF-8 (70,959 gzip, 60,625 Brotli). The six pages and manifest add 47,846 bytes.

## Validation

- `npm run i18n:check -- nb`: no errors; English-identical entries reviewed in `REVIEW.json`. The length warnings are the Japanese statutory titles.
- `tests/locales/norwegian.test.ts`: catalog complete and ready, nb/nn/no device choice, no-break-space numbers, one/other, Bokmål spelling (and the check refusing Danish), compound names, nothing attached to a placeholder, unchanged canonical data, pages, account form and push text.
- Built client in Chromium on an `nn-NO` device (scratch copy of `tools/i18n/smoke.mjs`): Bokmål was chosen; all 12 panels and tabs with no untranslated markers or page errors; the Army action buttons do not overflow; the bottom bar fits and Build opens at 320, 360, 390, 568 and 844 px; the scout card shows no English rival names; only the Norwegian pack is fetched and cached; offline reload stays in Norwegian; switching to English keeps every building's identity; a failed language fetch keeps the working preference. Emulation is not physical-device evidence.

## Remaining before release

1. Deploy the server (Norwegian push catalog and account form) before or with the game.
2. Native Norwegian review (ideally including a Nynorsk reader), covering the tutorial, purchase, safety and legal pages, and a Norwegian-law review of the terms and privacy policy.
3. Physical iOS and Android checks, including that `values-nb`/`values-no` and `nb.lproj` are picked on Norwegian devices; uploading `docs/store/nb/` to App Store Connect (Norwegian) and Google Play with Norwegian screenshots.
4. Norwegian moderation coverage: the chat filter's word list is English only.
