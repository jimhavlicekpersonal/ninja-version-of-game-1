---
document_type: german_implementation
schema_version: 1
language: de
variant: Standard German (Germany) with du, also served to Austria, Switzerland and Luxembourg
status: implemented_in_repo_release_checks_remain
measurements: SPANISH_SIZE.json (measured.de)
---

# German translation

German (`de`) is the fifth complete language. It is written in Standard German (Germany)
with *du*, also in the legal pages, and served to every German device (`de-DE`, `de-AT`,
`de-CH`, `de-LU`, `de-LI`) and to Swiss German (`gsw`) and Luxembourgish (`lb`) devices
(`alsoFor`). It covers the same surfaces as Spanish, Hindi and Portuguese: every namespace
(`boot` 17, `ui` 125, `data` 669, `messages` 1,862, `pages` 314 = 2,987 entries), the six
public pages and PWA manifest under `public/de/`, the account-deletion form
(`/account/delete?lang=de`), server push text, iOS (`de.lproj`) and Android (`values-de`)
resources, StoreKit fixtures for `de_DE`, and listing and product copy in
`docs/store/de/`. Terms are in `locales/de/TERMS.md`; reviewed warnings in
`locales/de/REVIEW.json`.

Implemented in commit `468b139` (2026-11-09). The translation is AI-written and validated by the repository checks below. **No native
German speaker has reviewed it**, nor the legal pages.

## What German needed

The translator instructions were checked against German before translating. These were
the compatibility problems, each fixed in this change:

| Issue | Fix |
|---|---|
| Two-part generated names (places, rival outposts, computer Alliances: Thunder Peak) were joined with a space, first part first, or noun-first. German writes such names as one compound word (Donnergipfel); "Donner Gipfel" is wrong, and an adjective first part ("Stiller Gipfel", "Stille Klinge") would have to agree with each noun's gender. | `generatedNames: "compound"` in `languages.json`, read by `generatedName` in `src/presentation/ui/i18n.ts`: the first part, then the second with its first letter lowercased. First parts are stems with linking letters (Zwillings, Laternen, Höhlen), so every one fits every noun: Donner + Gipfel = Donnergipfel, Zwillings + Klinge = Zwillingsklinge. `GLOSSARY.md` now has a "Generated names" section for all three modes. |
| `GLOSSARY.md` named Hindi, Urdu, Arabic, Hebrew and the Romance and Slavic languages as the ones where words agree with a placeholder's gender, but not German (three genders, four cases), Dutch or Greek. It said nothing about articles, possessives or case endings, so `der {building}`, `dein {troop}` or `{name}s Dorf` would have looked allowed. | `GLOSSARY.md` and `locales/CLAUDE.md` add German, Dutch and Greek and spell out that articles, possessives and case endings count as agreement, with German examples (`{building} verbessern`, `Fertig: {building}`, `Dorf von {name}`). `tests/locales/german.test.ts` fails on an article, possessive or genitive *s* next to a name or label placeholder. |
| Role nouns for the player (leader, ruler, winner, friend) are gendered in German (*Anführer/Anführerin*); the glossary said "Players are leaders or rulers". | The glossary asks for a neutral noun or direct address; German uses *Oberhaupt* (neuter), *die Person*, *die Moderation*, *die Bandenleitung*. Bot greetings avoid *neuer Verbündeter* and *der Beste*. |
| The German note in `languages.json` was one line ("Informal du. Long compounds: keep button labels short.") and said nothing about capitalisation, *du* in legal text, agreement, quotation marks, decimals or which countries it serves. | A full note: *du* lowercase, also in legal pages; noun capitals; ß and umlauts; infinitive buttons; hyphenated loan compounds (Trainings-Dojo); no article or genitive on placeholders; neutral nouns for the player; `one` is only 1; „…“ quotes; decimal comma; `20 %` with a no-break space; compound generated names. `alsoFor: ["gsw", "lb"]`. |
| Two HUD numbers were written with `toFixed`, so German (and Spanish, Portuguese) showed English decimals: the daily chest odds ("Chance: 2.5%") and the Shadow Trial defense multiplier ("defenses ×1.25"). | `fmtPercent` and `fmtDecimal` in `ui/i18n.ts` (`Intl.NumberFormat`); `dailyUi.ts` and `hud.ts` use them: "2,5 %", "×1,25". |
| Season Scroll tasks showed their target with English grouping ("29,000 Proviant einsammeln") next to a German progress bar ("0/29.000"): `sim/pass.ts` fills `{n}` with `toLocaleString('en-US')`. Wrong in Spanish and Portuguese too. Found in the browser check. | `economyUi.ts` builds the displayed task text from the localized template and `formatNumber`; the simulation's canonical text is unchanged. |
| The StoreKit generator had no German and silently cut text with `slice`, which can split a German compound. | `tools/store/storekit.mjs` writes `de_DE` (Germany is the App Store's one German localization, also shown in Austria and Switzerland) and fails instead of cutting German text. |

German needed nothing else from the code: the bundled Latin font subsets cover ß, the
umlauts and „ “; `Intl` gives German plurals (`one` = 1, 0 in `other`), numbers
(1.234.567; compact only from a million: 1,2 Mio.), dates and lists; long compounds in the
two-line bottom-bar labels already break with `hyphens: auto` and `overflow-wrap`.

## Storage

Measured by `npm run i18n:build` (`SPANISH_SIZE.json`, `measured.de`): the runtime pack is
222,254 bytes UTF-8 (74,030 gzip, 63,171 Brotli) for 2,673 strings, the size of Spanish
(222,762; 73,078 gzip) and Portuguese (220,417; 72,544 gzip). The six pages and manifest
add 52,035 bytes. No font is needed.

## Validation

- `npm run i18n:check -- de`: no errors; every English-identical entry reviewed in `REVIEW.json` (Japanese names, script names, brands, parameter-only strings and words German shares with English such as Jade, Saboteur, Tunnel, Tiger, Lotus, Frost, Pass, Chat, Events, Premium, Online, OK and four month names). Two length warnings are the Japanese statutory page titles.
- `tests/locales/german.test.ts`: catalog complete and ready; `de-DE`, `de-AT`, `de-CH`, `gsw-CH` and `lb-LU` devices pick German; German numbers, decimals and percentages; 0 in the plural; compound generated names (and English unchanged); no article, possessive or genitive *s* next to a name or label placeholder; literal player parameters, unchanged canonical data and seeded bases; pages, account form and push text.
- Built client in Chromium (a scratch copy of `npm run i18n:smoke` set to `de-DE`, 390×844): all 12 panels and their tabs, no page errors, no word that exists only in the English catalogs, no button, heading or chip wider than its box (scroll-width check); the bottom bar fits and Build opens at 320, 360, 390, 568 and 844 px; only the German pack is fetched and cached; an offline reload stays in German; switching to English keeps every building's identity; a failed language download keeps the working preference. After the Season Scroll fix, a forced task list reads "29.000 Proviant einsammeln" and "123.456 Münzen einsammeln". Screenshots showed the resource bar ("400.000 / 22,9 Mio."), the compound Alliance name (Zwillingslotus) and German percentages. Emulation is not physical-device evidence.

## Remaining before release

1. Deploy the server (German push catalog and account form) before or with the game.
2. Native German review of the game text, the tutorial, purchase, safety and legal pages; a reader from Austria or Switzerland for terms that differ there.
3. Legal: a German *Impressum* (provider identification under § 5 of the German Digitale-Dienste-Gesetz; Austria has a similar rule) with the publisher's real details for the store listings and website, and a German-law review of the terms (consumer withdrawal wording, liability clause) and privacy policy. The pages keep their draft notices.
4. Physical iOS and Android checks of language selection, the `de.lproj`/`values-de` registration, permission sheets and store purchase screens.
5. Upload `docs/store/de/` to App Store Connect (German) and Google Play (de-DE, and de-AT/de-CH if listed separately), with German screenshots (`npm run store:screenshots -- --language=de`); age ratings (USK through IARC) are store steps.
6. German moderation coverage: the chat filter's word list is English only.
