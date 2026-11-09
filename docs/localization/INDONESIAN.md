---
document_type: indonesian_implementation
schema_version: 1
language: id
variant: Friendly standard Indonesian with kamu, also served to Javanese and Sundanese devices
status: implemented_in_repo_release_checks_remain
measurements: SPANISH_SIZE.json (measured.id)
---

# Indonesian translation

Indonesian (`id`) was released on 2026-11-09, the first wave-1 language after Hindi outside the Romance/Germanic group. It is written in friendly standard Indonesian with *kamu*, also in the legal pages, and served to `id-ID` devices, the legacy `in` tag and Javanese (`jv`) and Sundanese (`su`) devices (`alsoFor`). It covers every namespace (3,019 worksheet entries, 2,705 runtime strings), the six public pages and PWA manifest under `public/id/`, the account-deletion form (`/account/delete?lang=id`), server push text, iOS (`id.lproj`) and Android (`values-in`, the resource qualifier Android uses for Indonesian; `locales_config.xml` lists `id`) resources, StoreKit fixtures for `id`, and listing and product copy in `docs/store/id/`. Terms: `locales/id/TERMS.md`; reviewed warnings: `locales/id/REVIEW.json`.

The translation is AI-written and validated by the repository checks below. **No native Indonesian speaker has reviewed it**, nor the legal pages or store copy.

## Indonesian specifics

- No grammatical gender and no plural agreement: `Intl.PluralRules('id')` has only `other` (the English `one` branch is kept but never chosen), and nothing is reduplicated after a number ("3 prajurit").
- Suffixes (*-nya*, *-mu*) are never attached to a placeholder; `indonesian.test.ts` checks it.
- Generated names are noun-first (`generatedNames: "noun-first"`): Puncak Guntur, Ngarai Merah, Bunga Tengah Malam.
- *Benteng* is the Keep only; Shadow Trials and bounty fortresses are *kubu* (checked by the test).
- Short time units follow Indonesian apps: h (hari), j (jam), m (menit), d (detik).
- `Intl` writes 1.234.567 and 2.400.

## Storage

`npm run i18n:build` (`measured.id`): 217,327 bytes UTF-8 (70,171 gzip, 60,012 Brotli), about the size of Italian.

## Validation

- `npm run i18n:check -- id`: no errors; English-identical entries reviewed in `REVIEW.json` (Japanese names, Unicode script names, brands, parameter-only strings, and words Indonesian uses as they are: Chat, Duel, Level, Online, Premium, Replay, Veteran, Master, OK, April, September, November). Three length warnings are the Japanese statutory titles.
- `tests/locales/indonesian.test.ts`: catalog complete and ready, device choice (including `in`, `jv`, `su`), numbers, plurals, noun-first names, no suffix on a placeholder, Benteng/kubu, unchanged canonical data, pages, account form and push text.
- Full suite, client build, server typecheck and server build pass.
- Built client in Chromium (`id-ID`, 320 and 412 px): starts in Indonesian with `<html lang="id">`, no page errors, the tutorial card and bottom bar fit at 320 px. This was a short check, not the full 12-panel pass done for French and Italian; emulation is not physical-device evidence.

## Remaining before release

1. Deploy the server (Indonesian push catalog and account form) before or with the game.
2. Native Indonesian review, including the tutorial, purchase, safety and legal pages, and an Indonesian-law review of the terms and privacy policy (UU PDP).
3. A full panel-by-panel browser pass, physical iOS and Android checks; uploading `docs/store/id/` to App Store Connect and Google Play with Indonesian screenshots.
4. Indonesian moderation coverage: the chat filter's word list is English only.
