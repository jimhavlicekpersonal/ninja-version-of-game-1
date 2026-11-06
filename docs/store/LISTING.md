# Store listing texts (step 49, draft)

Check every claim against the build you submit. Keep names as in the game ("Kagemura", "Clan Keep", "Jade"). Never mention another game. The claims below were checked against the code on 2026-11-05 (worldwide audit GLOBAL-020); "Claims checked" at the end says what each rests on and what must not be claimed.

## Names

- **App name (30 characters):** Kagemura: Ninja Clans
- **Subtitle (App Store, 30):** Build a hidden ninja village
- **Short description (Play, 80):** Build a hidden mountain village, train ninja warriors, and raid rival clans.
- **Promotional text (App Store, 170):** Lead your clan through the Shadow Trials, an endless ladder of fortresses. Smoke, sabotage and a plan beat brute force.

## Description (both stores, under 4,000 characters)

Lead a ninja clan. Build a hidden village in the mountains, train fifty kinds of warriors, scout your rivals and raid them with smoke and sabotage.

**Build your hidden village**
- Raise your Clan Keep from level 1 to 15 and unlock new buildings, walls and defenses as it grows.
- Every building shows its job: coin mints, rice paddies, storehouses, the Training Dojo, towers and traps.
- Place your defenses so raiders have to come through them.

**Train fifty warriors**
- From Shinobi and kunai throwers to kite raiders, saboteurs and siege bombardiers, each with its own role.
- Research makes each warrior stronger in the Training Dojo.

**Raid with a plan**
- Warriors enter only through a base's Infiltration Points: scout the paths and the towers that cover them.
- Throw Smoke Bombs as your warriors walk into tower range, and send Saboteurs to jam a defense.
- A planned attack beats a big one.

**Play together** (online)
- Join an Alliance: chat, ask for warriors and send them to your clanmates.
- Fight in the weekly Alliance War.
- Add friends, challenge them to Friendly Duels, and team up in Gangs of up to four for Gang Wars.
- Climb the Honor leagues and the Power Ranking.

**The Shadow Trials**
- An endless ladder of fortresses. Each tier pays out once, and gets harder.

**Fair play**
- A free daily chest, with its odds shown before you open it. Nothing random is ever sold.
- Generated opponents are always labelled as such.
- Spending limits for players under 18, and reminders you choose (off until you turn them on).

Kagemura is free to download and play: every building, warrior, Keep level and game mode can be reached without paying, and there are no ads. Jade, the premium currency, is earned in small amounts by playing (achievements, leagues, the daily chest and the Season Scroll's free track) and can also be bought. Some things are sold only for real money: the Season Scroll's premium track (its extra rewards, faster building during the season and the Lantern Festival Keep look) and limited-time bundles of Jade and resources.

## Keywords (App Store, 100 characters, comma-separated)

ninja,clan,village,strategy,base builder,raid,defense,tower,shinobi,war,alliance,castle,samurai

## Categories and contact

- **App Store:** Games → Strategy (secondary: Simulation).
- **Google Play:** Game → Strategy. Tags: Base building, Real-time strategy, Ninja.
- **Support URL:** `<web address of the game>/support.html` (shipped in `public/support.html`).
- **Privacy policy URL:** `<web address of the game>/privacy.html` (shipped in `public/privacy.html`; the same page Settings → Privacy and help opens in the game).
- **Community rules (Apple 1.2, Play UGC):** `<web address of the game>/community.html`.
- **Terms of service / EULA:** `<web address of the game>/terms.html` (a draft until `termsEffective` is set in `legal-config.js`; until then use Apple's standard EULA and leave Play's terms field empty).
- **Japan:** `<web address of the game>/tokushoho.html` and `/shikin-kessai.html` (drafts; `docs/legal/JAPAN.md`). Link both from the Japanese listing description or support page before selling Jade in Japan.
- **Account deletion URL (Play):** `https://<server>/account/delete` (the server's web form; it asks for a Player ID or name and an optional note, no email).
- **Marketing URL (optional):** the game's web address.

`<web address of the game>` is where `.github/workflows/deploy.yml` publishes the web build (GitHub Pages: `https://<owner>.github.io/<repository>/`, or a custom domain). The pages are plain HTML in the build, so they work with the game offline and need no server.

## Publishing the pages (owner steps)

1. Fill in `public/legal-config.js`: the publisher's legal name (`operator`), a support address that is read (`supportEmail`), the server's deletion page (`deletionUrl`), and `termsUrl` if you have full terms. Until a value is set, the pages show "not published yet" in its place rather than an invented one.
2. Have the privacy policy and community rules reviewed for the countries you ship to (the text was written from the code, not by a lawyer), and set `policyUpdated` when the text changes.
3. Optional build settings, if the pages live somewhere else: `VITE_PRIVACY_URL`, `VITE_SUPPORT_URL`, `VITE_COMMUNITY_URL` (full `https://` addresses), and `VITE_SUPPORT_EMAIL` (adds an Email button in Settings). In the iOS/Android apps, a page shipped with the game opens inside the game; a configured `https://` address opens in the browser.
4. Deploy, then open each URL from a phone on mobile data, and from Settings → Privacy and help in the build you submit, before entering the URLs in App Store Connect and Play Console.

## Claims checked (2026-11-05)

| Claim | Rests on | Do not claim |
|---|---|---|
| Free to download and play; everything reachable without paying | Buildings, warriors, Keep levels, Trials and wars need no purchase; Jade comes from `achievements.json`, `ranks.json`, `daily.json`, the free track of `pass.json` | "Everything can be earned by playing": the premium Season Scroll (`pass.json`, product `lantern_pass`, real money only) gives extra rewards and 20% faster building, and the Lantern Festival Keep look (`cosmetics.json` `passOnly`) comes only with it |
| Limited-time bundles | `offers.json`: Jade and resources only, real money, real deadlines | — |
| No ads | No ad SDK in the code | — |
| Nothing random is sold | Only the free daily chest is random (`daily.json`), odds shown first | — |
| Fifty warriors, Keep 1 to 15, Shadow Trials | `troops.json`/`roster.json`, `hall.json`, `trials.json` | — |
| Alliance War weekly, Friends, Duels, Gangs of up to 4 | Server features (`/v1/hello`); offline the Alliance is a labelled bot Alliance | Online features in a build without a server |
| Under-18 spending limit | `store.json` `minorMonthlyCapUsd` | Age-appropriate social protections beyond that (audit R07), until the fix release with the age screen ships; even then do not claim age verification (the age band is self-declared) |
| Lantern Festival Keep look | `cosmetics.json` (`name: "Lantern Festival"`) | "Lantern Elder look": the in-game Store text (`ui/economyUi.ts`, Season Scroll card and premium-track row) still says this and must be changed to "Lantern Festival" before screenshots are taken |
| — | — | **Offline play** as a selling point: with a server, the village moves there on connection and raids, Alliances, friends and purchases need a connection (audit R01) |
| — | — | **Languages**: English and Spanish have complete runtime catalogs in the current implementation. Spanish copy is in `docs/store/es/`, with validation and limits in `docs/localization/SPANISH_IMPLEMENTATION.json`. Do not list the other 48 target languages; their worksheets are incomplete |

## Screenshots

`npm run build && npm run store:screenshots` writes the village, Army, Store and Alliance screens at iPhone 6.9" and 6.5", iPad 13" and Android phone sizes. It starts a fresh sandbox village; for richer shots, load a played save first or take them on a device. Crop or retake the Store shot: it shows the sandbox note, which is not in the store build. App Store: 3 to 10 per size. Play: 2 to 8 phone screenshots plus a 1024×500 feature graphic (make it from the brand art, `npm run brand -- --svg`).


Spanish release copy and product metadata: [es/LISTING.md](es/LISTING.md), [es/PRODUCTS.json](es/PRODUCTS.json). The localized public links use `/es/`; the server account form accepts `?lang=es`. Uploading store text/products and validating real storefront screens remain release steps.
