---
document_type: portuguese_implementation
schema_version: 1
language: pt
variant: Brazilian Portuguese, also served to Portugal and Lusophone Africa
status: implemented_in_repo_release_checks_remain
measurements: SPANISH_SIZE.json (measured.pt)
---

# Portuguese (Brazil) translation

Portuguese (`pt`) is the fourth complete language. It is written in Brazilian Portuguese
and served to every Portuguese device (`pt-BR`, `pt-PT` and the rest), as the owner
asked: where European and Brazilian Portuguese differ, the Brazilian form wins (tela,
celular, baixar, fumaça, pipa, curinga; *você* with third-person verbs; spelling of the
1990 agreement). It covers the same surfaces as Spanish and Hindi: every namespace
(`boot` 17, `ui` 125, `data` 669, `messages` 1,862, `pages` 314 = 2,987 entries), the six
public pages and PWA manifest under `public/pt/`, the account-deletion form
(`/account/delete?lang=pt`), server push text, iOS (`pt.lproj`, so both Brazilian and
European devices match) and Android (`values-pt`, listed as `pt-BR` in the per-app
language picker) resources, StoreKit fixtures for `pt_BR` and `pt_PT`, and listing and
product copy in `docs/store/pt/`. Terms are in `locales/pt/TERMS.md`; reviewed warnings
in `locales/pt/REVIEW.json`.

The translation is AI-written and validated by the repository checks below. **No native
Portuguese speaker has reviewed it**, nor the legal pages.

## What Portuguese needed

| Issue | Fix |
|---|---|
| Two-part generated names (places, Alliances, as in Thunder Peak) were assembled noun-first only when the code was `es`. Portuguese needs the same order. | `generatedNames: "noun-first"` in `languages.json` (set for `es` and `pt`) and read by `generatedName` in `src/presentation/ui/i18n.ts`; first parts are invariant modifiers (do Trovão, Carmesim, Cadente, Nascente) so they fit masculine and feminine nouns. |
| CLDR puts 0 in `one` for Portuguese, but Brazilians say "0 guerreiros". | Messages where zero can occur have an `=0` branch (`Nenhum pagamento restante`, `nenhuma defesa`); the Portuguese note in `languages.json` asks for it. |
| Adjectives and participles agree in gender, with the player and with inserted names. | Verbs, nouns and impersonal forms (`Construção concluída: {arg1}`, `{arg1} enviou um pedido de amizade`); player buttons avoid *obrigado/obrigada* and *pronto/pronta*; bot chat uses *Valeu* and *Boas-vindas*. |
| The StoreKit generator only wrote English, Spanish and Hindi; the Season Scroll name would have been cut at 30 characters. | `tools/store/storekit.mjs` writes `pt_BR` and `pt_PT` (Pergaminho Premium). |

Decimals written inside sentences use a comma (3,5 casas); the game formats other numbers
in the Brazilian style (1.234.567; compact 1,2 mil, 1,5 mi).

## Storage

Measured by `npm run i18n:build` (`SPANISH_SIZE.json`, `measured.pt`): the runtime pack is
220,417 bytes UTF-8 (72,544 gzip, 61,622 Brotli) for 2,673 strings, about the size of
Spanish (222,762; 73,078 gzip). The six pages and manifest add 49,120 bytes. No font is
needed: the bundled Latin subsets cover Portuguese.

## Validation

- `npm run i18n:check -- pt`: no errors; every English-identical entry reviewed in `REVIEW.json` (Japanese names, script names, brands, parameter-only strings and words Portuguese shares with English such as Chat, Base, Premium, Online, Replay).
- `tests/locales/portuguese.test.ts`: catalog complete and ready, `pt-BR` and `pt-PT` devices pick Portuguese, Brazilian number formats, the zero branch, noun-first generated names, literal player parameters, unchanged canonical data and seeded bases, pages, account form and push text.
- Built client in Chromium at 360×780 (`pt-BR`, scratch check modelled on `npm run i18n:smoke`): all 12 panels and their tabs, no page errors, no word that exists only in the English catalogs; the bottom bar fits at 320, 360, 390, 568 and 844 px ("Construir" wraps as "Cons-truir" at 320 px, as in Spanish); only the Portuguese pack and pages are fetched and cached, and an offline reload stays in Portuguese. Emulation is not physical-device evidence.

## Remaining before release

1. Deploy the server (Portuguese push catalog and account form) before or with the game.
2. Native Portuguese review (Brazil, and a check by a reader from Portugal), including the tutorial, purchase, safety and legal pages.
3. Physical iOS and Android checks of language selection, the `pt.lproj`/`pt-BR` registration on European Portuguese devices, permission sheets and store purchase screens.
4. Upload `docs/store/pt/` to App Store Connect (Portuguese (Brazil) and Portuguese (Portugal)) and Google Play (pt-BR, pt-PT), with Portuguese screenshots (`npm run store:screenshots -- --language=pt`).
5. Portuguese moderation coverage: the chat filter's word list is English only.
