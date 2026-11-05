# Notes for App Review (step 51, draft to paste into App Store Connect → App Review Information)

> Kagemura is a base-building strategy game with online raids and Alliances. There is no login: the game creates an online account on first start (Sign in with Apple / Game Center are optional, for moving to another device), so no demo account is needed.
>
> **Online play (PvP):** finish or skip the short tutorial, then tap **Attack** (bottom right). The server finds a real player's village at your level, or, when nobody fits, a generated village that is labelled "generated". Battles are checked by the server.
>
> **Alliance and chat:** tap the **Alliance** button (flag), join or create an Alliance. To report a message or block a player, tap **⋯** next to the message. Reported content is reviewed by our staff.
>
> **In-app purchases:** tap the Jade **+** at the top to open the Store. Purchases are delivered after our server checks the App Store transaction. **Restore purchases** is at the bottom of the Store. Players under 18 (the game asks the age group before the first purchase) have a monthly spending limit.
>
> **Random rewards:** only the free daily chest is random; its odds are shown before it opens, and it is never sold. Nothing random is sold.
>
> **Account deletion:** Settings → Online play → Account → **Delete online account**. There is also a web form at https://<server>/account/delete.
>
> **Privacy policy, support and community rules:** Settings (gear, bottom left) → **Privacy and help**.
>
> **Crash reports:** off until the player turns them on in Settings.
>
> **Notifications:** off until the player turns them on in Settings; quiet hours and a daily limit apply.

Before sending:
- Fill in `public/legal-config.js` and check that Settings → Privacy and help opens the privacy policy, support and community pages in the submitted build, with no "not published yet" notes.
- Replace `<server>` with the production address, and check it answers (`node tools/ops/check-domain.mjs https://<server>`), on IPv6 too (App Review uses IPv6-only networks).
- The production server must accept sandbox purchases (`APPLE_ENVIRONMENTS` includes `Sandbox`, the default) because App Review buys in the sandbox.
- Make sure at least one other real or seeded player exists at low Keeps, or the reviewer only meets generated bases (still labelled, still fine).
- Attach a short screen recording of a raid, the Store and account deletion if a previous review asked questions.
