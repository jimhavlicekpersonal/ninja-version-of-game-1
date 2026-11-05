# Store listing texts (step 49, draft)

Check every claim against the build you submit. Keep names as in the game ("Kagemura", "Clan Keep", "Jade"). Never mention another game.

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

**Play together**
- Join an Alliance: chat, ask for warriors and send them to your clanmates.
- Fight in the weekly Alliance War.
- Climb the Honor leagues and the Power Ranking.

**The Shadow Trials**
- An endless ladder of fortresses. Each tier pays out once, and gets harder.

**Fair play**
- A free daily chest, with its odds shown before you open it. Nothing random is ever sold.
- Generated opponents are always labelled as such.
- Spending limits for players under 18, and reminders you choose (off until you turn them on).

Kagemura is free to play. Jade can also be bought with real money; everything in the game can be earned by playing.

## Keywords (App Store, 100 characters, comma-separated)

ninja,clan,village,strategy,base builder,raid,defense,tower,shinobi,war,alliance,castle,samurai

## Categories and contact

- **App Store:** Games → Strategy (secondary: Simulation).
- **Google Play:** Game → Strategy. Tags: Base building, Real-time strategy, Ninja.
- **Support URL:** a page that tells players how to reach you, e.g. `https://<your site>/support` or the repository's Pages site with a contact address.
- **Privacy policy URL:** publish `docs/store/PRIVACY_POLICY.md` (after review) at a public address, e.g. GitHub Pages.
- **Account deletion URL (Play):** `https://<server>/account/delete` (the server's web form).
- **Marketing URL (optional):** the game's web address.

## Screenshots

`npm run build && npm run store:screenshots` writes the village, Army, Store and Alliance screens at iPhone 6.9" and 6.5", iPad 13" and Android phone sizes. It starts a fresh sandbox village; for richer shots, load a played save first or take them on a device. Crop or retake the Store shot: it shows the sandbox note, which is not in the store build. App Store: 3 to 10 per size. Play: 2 to 8 phone screenshots plus a 1024×500 feature graphic (make it from the brand art, `npm run brand -- --svg`).
