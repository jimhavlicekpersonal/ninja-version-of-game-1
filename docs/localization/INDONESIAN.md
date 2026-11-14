---
document_type: indonesian_implementation
schema_version: 1
language: id
variant: Friendly standard Indonesian (id-ID) with kamu, also in the legal pages; Javanese and Sundanese devices get it too
status: implemented_in_repo_release_checks_remain
measurements: SPANISH_SIZE.json (measured.id)
---

# Indonesian translation

Indonesian (`id`, script `Latn`) was activated on 2026-11-14 in commit `ee21ee6` (layout and font fixes `9c351cf`, checks `d995636`, store copy `1ee11cb`) together with Arabic, Russian and Turkish. It is served to `id`, `id-ID`, the legacy code `in` that older Android and Java report, and Javanese (`jv`) and Sundanese (`su`) devices (`alsoFor`). It covers every namespace (3,301 entries after the a1188d2 merge, including the server message codes and the complaint form; 3,041 at activation), the six public pages and PWA manifest under `public/id/`, the account-deletion form (`/account/delete?lang=id`), server push text, iOS (`id.lproj`) and Android resources, StoreKit fixtures (`id`), and listing and product copy in `docs/store/id/`. Terms: `locales/id/TERMS.md`.

The translation is AI-written and validated by the repository checks below. **No native Indonesian speaker has reviewed it**, nor the legal pages.

## Translator's choices

- **kamu everywhere, also in the legal pages** (for consistency with the game; Indonesian legal and store text often uses the formal Anda). Sensei Hoshi says aku; bot chat may be casual (nggak, makasih). This is an open question for the native and legal review: the privacy policy, terms and account-deletion pages may read better with Anda.
- Indonesian has no grammatical gender; another player or a `{name}` is referred to by name, pemain itu or lawan.
- Plural has only `other`; nouns are not doubled after a number (`{n} prajurit`).
- **Generated names** are noun-first (`generatedNames: "noun-first"`): Puncak + Guntur = Puncak Guntur.

## What integration added

| Issue | Fix |
|---|---|
| Android resolves Indonesian resources under the legacy ISO 639 code `in` (as it does `iw` for Hebrew); a `values-id` folder would not be picked on most devices. | Android strings are in `values-in`; `locales_config.xml` lists the BCP 47 tag `id`, which Android maps itself. The web client already aliased `in` to `id`. |
| `generatedNames` was not set. | `"noun-first"` in `languages.json`; the language note now records the translator's rules. |

Indonesian needed nothing else from the code: its letters are all in the bundled Latin fonts (`latin-fonts.test.ts` keeps it out of `SYSTEM_FONT_LANGS`), and `Intl` gives the plural, dot-grouped numbers (1.234.567) and Indonesian dates.

## Storage

`npm run i18n:build` (`measured.id`): 217,288 bytes UTF-8 (70,019 gzip, 59,590 Brotli) for 2,725 strings.

## Validation

- `npm run i18n:check -- id`: no errors; warnings are entries identical to English (brands, Japanese names, Shinobi, Kage, premium). There is no `REVIEW.json` for Indonesian yet.
- `tests/locales/indonesian.test.ts`: catalog complete and ready; device choice including `in`, `jv` and `su`; dot-grouped numbers; plural `other`; no formal Anda anywhere (game or pages); Kage and Shadow League distinct; noun-first generated names; literal player chat and unchanged canonical data; no system-font rule needed; pages, account form, push text, native resources (`values-in`) and StoreKit.
- Built client in Chromium (sandbox, Keep 10 village, `id` locale) at 320×568: all 12 panels and their tabs, the village and the raid scout screen; no page errors, no horizontal page overflow, no element outside the viewport, no clipped button or heading, no placeholder or key left; the bottom bar fits. Emulation is not physical-device evidence.

## Remaining before release

1. Deploy the server (Indonesian push catalog and account form) before or with the game.
2. Native Indonesian review of the game text, tutorial, purchase, safety and legal pages, and a decision on kamu versus Anda in the legal pages. Legal review under Indonesia's Personal Data Protection Law (UU PDP 27/2022) and its electronic-system operator registration (PSE, Kominfo/Komdigi), which foreign games sold in Indonesia may need.
3. Upload `docs/store/id/` to App Store Connect and Google Play with Indonesian screenshots (`npm run store:screenshots -- --language=id`); age rating through the stores (and Indonesia's IGRS game rating).
4. Physical iOS and Android checks: language selection, `id.lproj` and `values-in` registration on old and new Android versions, store purchase screens.
5. Indonesian moderation coverage: the chat filter's word list is English only.
6. Computer players' generated names (Kaito Mori) stay in Latin letters because they are stored text.
