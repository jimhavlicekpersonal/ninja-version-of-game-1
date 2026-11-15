---
document_type: zulu_implementation
schema_version: 1
language: zu
variant: Standard Zulu (isiZulu, South Africa), friendly singular wena, singular imperatives
status: implemented_in_repo_release_checks_remain
measurements: SPANISH_SIZE.json (measured.zu)
---

# Zulu translation

Zulu (`zu`, script `Latn`) was released in commit `d6ab7b8`. It covers every namespace (3,022 entries; 2,705 strings in the built pack), the public pages and PWA manifest under `public/zu/`, the account-deletion form (`/account/delete?lang=zu`), and the store copy and native/StoreKit text in `docs/store/zu/` (`LISTING.md`, `LOCALE.json`). Terms: `locales/zu/TERMS.md`; reviewed warnings: `locales/zu/REVIEW.json`.

The translation is AI-written and validated by the repository checks below. **No native Zulu speaker has reviewed it**, nor the legal pages.

## What Zulu needed

| Issue | Handling |
|---|---|
| **Noun-class prefixes and concords depend on the noun.** A prefix or a subject concord cannot attach to `{name}`, `{building}` or `{troop}`, whose class the game does not know. | `GLOSSARY.md` rule (African Latin-script section): use a colon (`Kuqediwe: {building}`), an impersonal ku- verb, or a known noun before the placeholder (`isakhiwo {building}`). Number agreement follows a known noun (`amaqhawe angu-#`). |
| **No grammatical gender.** | Player addressed as wena; nothing else needed. |
| **Generated names in the wrong order.** | `generatedNames: noun-first` in `locales/languages.json`; every second part is class 9 (in-/im-) and every first part uses class-9 concords: Intaba + yeNdudumo = Intaba yeNdudumo. |
| **Fonts.** Zulu is written in basic Latin letters. | The bundled fonts cover it; the only letter outside Latin-1 is ō in Japanese names (Gorō). |

`Intl` gives the plural (`one` for 0 and 1, and `other`), comma-grouped numbers (1,234,567) and dates (Novemba 14, 2026). No language-specific `i18n:check` rule exists for Zulu beyond the shared ones.

Key terms: Jade = ijeyidi, Season Scroll = Umqulu Wesizini (premium: Umqulu Wesizini okhethekile), Clan Keep = Inqaba Yesizwe, Clan Stipend = Iholo Lesizwe. All store product names in `data.json` fit Apple's 30 characters, so `LOCALE.json` has no `displayNames` overrides.

## Storage

`npm run i18n:build` (`measured.zu`): 227,633 bytes UTF-8 (73,841 gzip, 62,708 Brotli) for 2,705 strings.

## Validation

- `npm run i18n:check -- zu`: catalog complete; English-identical entries (Shinobi, Kage, brands, Japanese names) reviewed in `REVIEW.json`.
- Store copy limits checked with node: App Store subtitle 29/30, Play short description 70/80, promotional text 105/170, keywords 99/100 bytes; `LOCALE.json` StoreKit strings within 30/55.
- No Zulu-specific test file and no browser smoke run recorded for this language yet.

## Remaining before release

1. Deploy the server (push text and account form) before or with the game.
2. Native Zulu review of the game text, tutorial, purchase, safety and legal pages, and a South-Africa-law review of the terms and privacy policy (POPIA, the Consumer Protection Act).
3. App Store Connect offers no Zulu listing locale (`appStore: false`); upload `docs/store/zu/` to Google Play with Zulu screenshots (`npm run store:screenshots -- --language=zu`).
4. Physical iOS and Android checks: language selection, native resource registration, long agglutinated words in tight buttons, store purchase screens.
5. Zulu moderation coverage: the chat filter's word list is English only.
6. Computer players' generated names (Kaito Mori) stay in Latin letters because they are stored text.
