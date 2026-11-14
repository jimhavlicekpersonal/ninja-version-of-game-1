---
document_type: swahili_implementation
schema_version: 1
language: sw
variant: Standard Swahili (Kiswahili sanifu) for East Africa, friendly, the player addressed as wewe; no noun-class agreement attached to a placeholder
status: implemented_in_repo_release_checks_remain
measurements: SPANISH_SIZE.json (measured.sw)
---

# Swahili translation

Swahili (`sw`, script `Latn`) covers every namespace (2,708 strings in `boot`, `data`, `messages`, `pages` and `ui`), the public pages and PWA manifest under `public/sw/`, and listing and product copy in `docs/store/sw/` (added in `RELEASE_COMMIT`). Terms: `locales/sw/TERMS.md`; reviewed warnings: `locales/sw/REVIEW.json` (100 English-identical entries reviewed). `locales/languages.json` marks it `appStore: false`: App Store Connect offers no Swahili listing language, so it ships as a Google Play listing and an in-game language.

The translation is AI-written and validated by the repository checks below. **No native Swahili speaker has reviewed it**, nor the legal pages.

## What Swahili needed

| Issue | Rule |
|---|---|
| **Noun classes.** Agreement prefixes and the -a linker (cha, la, ya, wa) follow the class of the noun; a building, warrior or item placeholder can be any class. | Never attach an agreement prefix or linker that depends on `{building}`, `{troop}` or another placeholder; use a colon (`Imekamilika: {building}`) or a verb without agreement (`Boresha {building}`). People are class 1/2, so `{name}` may be a subject (`{name} amevamia`). Recorded in `TERMS.md` and `GLOSSARY.md` ("standard written forms"). |
| **No grammatical gender.** | Nothing to neutralise for the player or `{name}`. |
| **Generated names in the wrong order.** Swahili puts the noun first and the linker agrees with it. | `generatedNames: noun-first`; second parts carry their own linker (Kilele cha + Radi = Kilele cha Radi). |
| **Jade.** | Kept as the name "Jade"; noun before the number (Jade 7500, wapiganaji 5). |

The checker (`npm run i18n:check -- sw`) has no Swahili-only rule; the general placeholder, ICU, NFC and identical-English checks apply. Swahili uses only ASCII letters, so the bundled display font covers it and it is not in `SYSTEM_FONT_LANGS`.

`Intl` gives the plural categories `one` and `other`, comma-grouped numbers (1,234,567) and Swahili dates (14 Novemba 2026). Name validation (`\p{L}`) accepts every Swahili name.

## Storage

`npm run i18n:build` (`measured.sw`): 220,514 bytes UTF-8 (72,012 gzip, 61,339 Brotli) for 2,708 strings.

## Remaining before release

1. Native Swahili review of the game text, tutorial, purchase, safety and legal pages, and a legal review for the East African markets (Kenya's Data Protection Act 2019, Tanzania's Personal Data Protection Act 2022, consumer law).
2. iOS (`sw.lproj`), Android (`values-sw`), StoreKit fixture and server push/account-form coverage if not yet present; a dedicated `tests/locales/swahili.test.ts` does not exist yet.
3. Upload `docs/store/sw/` to Google Play with Swahili screenshots (`npm run store:screenshots -- --language=sw`); age rating through the stores.
4. Physical Android and iOS checks on cheap phones: language selection, layout of longer Swahili labels at 320 px, chat input, store purchase screens.
5. Swahili moderation coverage: the chat filter's word list is English only.
6. Computer players' generated names (Kaito Mori) stay in Latin letters because they are stored text.
