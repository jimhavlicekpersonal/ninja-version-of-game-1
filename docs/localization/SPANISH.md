---
document_type: spanish_implementation_and_storage_decision
schema_version: 1
language: es
status: implemented_in_repo_release_checks_remain
base_ref: 9d0eaa7bf245c752b66dfe3d9575738ac6fe4df9
measurements: SPANISH_SIZE.json
surface_status: SPANISH_IMPLEMENTATION.json
---

# Spanish translation and language packaging

Spanish is implemented throughout the first-party player experience. Bundle every
completed language with the native app's initial installation. A separate language
download on first launch is unnecessary at these sizes and adds a dependency on
connectivity. For the web/PWA, fetch and cache only the selected language.

Only English and Spanish are ready. The other 48 target languages remain empty
worksheets, are unavailable in Settings, and have not been translated or measured.

## What was translated

The Spanish authoring catalogs contain **2,962 entries**, all complete and checked
against their current English sources:

| Namespace | Entries | Scope |
|---|---:|---|
| `boot` | 17 | First frame, startup, retry, unsupported browser and PWA description |
| `data` | 669 | Buildings, warriors, research, rewards, events, rivals and generated names |
| `messages` | 1,863 | Interface, dialogs, errors, social/system text, notifications, native bridges and historical output |
| `pages` | 314 | Public/legal/support pages and account-deletion form, including accessible labels |
| `ui` | 99 | Existing navigation, number/duration, tutorial and plural keys |

The compact runtime pack contains **2,648 strings**; public pages are rendered
separately. These are message counts, not word counts. Store listing/release notes,
14 products' Spanish metadata, native locale resources and the PWA manifest are
also supplied. The original 659 data + 99 UI keys were only a subset of the work.

The implementation includes village/army/research/building screens, onboarding,
scouting, battle/canvas controls and results, objectives, tasks, events, trials,
season rewards, purchases, account/recovery/consent flows, friends, alliances,
groups, chat presets, system notices and reminder/push copy. Every S01–S48 surface
has status, evidence and limitations in [SPANISH_IMPLEMENTATION.json](SPANISH_IMPLEMENTATION.json).
The complete discovery inventory and ordered translation steps remain in
[README.md](README.md) and [INVENTORY.json](INVENTORY.json).

Canonical game data, resource/building IDs, save fields, replay inputs and seeds
stay unchanged. Display adapters translate owned canonical history/server output.
Player names, authored chat, custom titles and staff-authored explanations stay
literal, including non-Roman text. Only validated presets, system messages and
explicit bot messages are translated. Brands, proper names and other intentional
unchanged values are recorded in `locales/es/REVIEW.json`; terminology is in
`locales/es/TERMS.md`. Audio contains no recorded dialogue requiring dubbing.

## Measured storage

Exact byte counts and file lists are in [SPANISH_SIZE.json](SPANISH_SIZE.json).
KB and MB below use decimal units. Worksheet metadata and repeated English source
text are excluded from shipping language packs.

| Spanish asset scope | Raw UTF-8 bytes | Compressed bytes |
|---|---:|---:|
| Runtime text pack | 220,557 (221 KB) | 72,481 gzip; 61,221 Brotli |
| Runtime + six public pages + PWA manifest + locale resource sources | 268,679 (269 KB) | 92,317 ZIP; 90,983 sum of gzip files; 76,710 sum of Brotli files |
| Server-only deletion page | 6,769 | Excluded from the installed client total |
| Additional Spanish fonts | 0 | Existing Latin font subsets include Spanish characters |

The 92,317-byte ZIP was physically generated and its CRCs and extracted contents
independently checked. [evidence/zip-es.json](evidence/zip-es.json) records the
compressor, hash and method. Compression varies by implementation and level;
this is a reproducible text-asset measurement, not a signed IPA/AAB measurement.

The client total conservatively includes source resources for both native
platforms. Native resource compilation, signatures, filesystem allocation and
duplicate browser caches are outside that total. Shared localization code,
English fallback and the inline first-frame language tables are part of the main
application: `builtJavaScript` and `indexHtmlUtf8` in the size report measure the
actual production artifacts separately. The JavaScript comparison with the pinned
baseline includes removal of 49 empty worksheet chunks; its negative delta must
not be described as the isolated cost of Spanish. Server catalogs and store-console
listing/product copy do not occupy the installed game's language-pack storage.

## Can all 50 languages fit?

Yes for text at this scale. The following is an explicit projection, not a
measurement of untranslated languages. It multiplies the complete Spanish client
asset set by 50, including English even though its fallback already exists. The
larger cases allow for longer text and different UTF-8 byte lengths.

| Projection | Raw text/assets | ZIP estimate |
|---|---:|---:|
| 50 × Spanish | 13.43 MB | 4.62 MB |
| 50 × Spanish × 1.5 | 20.15 MB | 6.92 MB |
| 50 × Spanish × 2 | 26.87 MB | 9.23 MB |

This assumes the existing policy of using device fonts for other scripts. It
includes no future recorded speech, translated raster artwork or added font
packages. Measure each completed language and the signed native artifacts as they
become available; the other scripts' typography and RTL still require review.

Native builds already copy completed compact packs and localized pages into
`dist`, which Capacitor includes in the installation. Language selection therefore
works without an extra first-launch download. The web deployment contains the same
files, but the loader and service worker fetch/cache only the chosen language and
its public pages. The boot subset is inline; switching preloads and validates a
pack before saving the preference. An unavailable pack leaves the working
language intact. English remains the fallback for unsupported device languages.

## Validation and remaining release work

After integration with upstream `12d5996`, the full suite passed **1,149 tests**
across 133 passing files; 13 tests were
skipped without their external prerequisites. Client build, server typecheck,
server build, catalog checks and focused localization checks passed. Details are
in [evidence/release-integration.json](evidence/release-integration.json).
[evidence/validation.json](evidence/validation.json) preserves the original
translation-only validation record.

The built client passed Chromium checks of 12 panels and their tabs, first-frame
language, generated opponent names, five mobile viewport sizes, Build taps,
selected-language caching, an offline reload with the separate localStorage pack
cache cleared, safe language-switch failure, and preservation of canonical village
identity. No page errors occurred. See [evidence/browser-es.json](evidence/browser-es.json)
and `npm run i18n:smoke`. Mobile emulation does not establish physical-device behavior.

Before releasing this implementation:

1. Deploy the updated server with migration `0029_localization.sql`, which adds
   validated preset metadata and per-device push locale; verify PostgreSQL/Redis
   adapters on release infrastructure. No external migration was applied here.
2. Validate installed iOS/Android language selection, first/offline launch, glyphs,
   permission sheets, sign-in, store prices/purchases and background notifications
   on physical devices. OS/provider-owned sheets follow their own locale settings.
3. Upload/review the prepared Spanish listing and product metadata in the actual
   store consoles, with current Spanish screenshots. `docs/store/es/` is prepared
   copy, not evidence of publication. The screenshot tool accepts `--language=es`.
4. Complete native Spanish linguistic/accessibility review and the existing
   publisher/legal facts and adoption steps. Spanish support/moderation operations
   still need owner validation. Legal drafts retain their original pending state.

## Maintaining the translation

Edit stable English messages and their Spanish worksheets together; preserve
placeholder kinds and rich-page tokens. Run `npm run i18n:sync`,
`npm run i18n:check -- es`, and `npm run build`. Build/typecheck/test hooks generate
the compact catalogs automatically. Use `npm run i18n:smoke` with Playwright and
Chromium installed for browser evidence. Server changes also require
`npm run typecheck:server` and `npm run server:build`.

`npm run i18n:build` regenerates language files, readiness and size projections;
the client build records final production JavaScript sizes afterward. Keep future
languages unready until every namespace is complete and valid. Do not translate
canonical IDs or authored player text to make a coverage count pass.
