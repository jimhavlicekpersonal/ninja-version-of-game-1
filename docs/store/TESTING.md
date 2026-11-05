# Closed testing (step 52, plan)

Use the **staging** server for testers (`docs/SHIPPING.md` 3f): its builds say so in Settings, its purchases are sandbox or license-test purchases, and its data never mixes with production.

## Apple: TestFlight

1. Build with the staging `VITE_SERVER_URL` (GitHub Environment `staging`) and upload (`.github/workflows/ios-testflight.yml`).
2. Internal testers (up to 100, your team): available at once.
3. External testers (up to 10,000): create a group, add the build, answer the Beta App Review questions (same notes as `REVIEW_NOTES.md`). The first build of a version waits for a short review.
4. Testers buy with sandbox accounts (`docs/SHIPPING.md` 3d).

## Google Play: closed track

New personal developer accounts must run a **closed test with at least 12 testers opted in for 14 days in a row** before they can apply for production. Plan for it early:
1. Play Console → Testing → Closed testing → create a track; add testers by Google Group or email list (keep at least 15, some drop out).
2. Upload the signed `.aab` from the Android workflow's `aab` job (built with `VITE_PLAY_BILLING=1`; set `VITE_SERVER_URL` to the staging server for test builds; owner setup in `docs/SHIPPING.md` 1b); add the testers as license testers too (Settings → License testing).
3. Share the opt-in link; check the "testers opted in" count daily. The 14 days restart if it falls below 12.
4. After 14 days, apply for production access (Play asks how the test went: keep notes from step 5).

## Native checks before production (owner, real phones, store-installed builds)

Unit tests and CI cannot prove these (no device, no store in `npm test`); record the date, build and phone for each.

- **Play Billing (Library 9):** buy a consumable; buy the same one again (it must be consumable again after delivery); cancel the sheet (nothing delivered or charged); pay with a slow test card ("Slow test card, approves after a few minutes"): the game says it is waiting, delivers once Play approves, even if the game was closed meanwhile; decline a slow card (nothing delivered). Kill the app right after paying, before delivery: the next start delivers it once. Uninstall, reinstall, Store → Restore purchases: nothing paid and undelivered is lost and nothing is delivered twice.
- **Android account recovery:** link Google in Settings → Account; uninstall; reinstall from Play; Sign in here with Google: the server-held village and purchase history return. Repeat on a second Android phone. Cancel the account chooser once (nothing changes).
- **Updates:** install the previous Play build, then update to the new one through the track: the village survives and the `versionCode` is higher.
- **Friend links:** share a friend link from each app; open it on a phone without the app (web game opens on Friends with the code) and with it (today it opens the web game too; in-app links are not set up, `docs/SHIPPING.md` 1b).
- **iPhone:** the same purchase, Ask to Buy, refund, reinstall and Sign in with Apple / Game Center checks through TestFlight.
- Cheap-phone and weak-network behaviour (an Android Go / 2-3 GB RAM phone, 3G or a throttled connection): start, a battle, a purchase sheet.

## What to ask testers to do (and report)

- Day 1: start, skip or finish the tutorial, build to Clan Keep 2, train an army, raid (note whether the opponent was a real player or "generated").
- Join an Alliance, chat, request and donate warriors, report a test message (staff: check it in `/admin`).
- Link Sign in with Apple / Google, then sign in on a second device and check the village is there.
- Buy the cheapest Jade pack and the Season Scroll (sandbox / test card); refund one (Apple sandbox purchase history, Play Console order) and check it is taken back within an hour.
- Turn notifications on; get raided by another tester; check the push arrives (not in quiet hours).
- Delete the account on one device; check that device stops being online and the name disappears from the leaderboard.
- Anything that crashed: the build sends crash reports when the switch is on (Sentry, staging environment).
