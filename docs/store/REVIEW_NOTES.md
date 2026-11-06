# Notes for App Review (step 51, draft to paste into App Store Connect → App Review Information)

Written for a build ≥ the fix release (age screen, deletion code, Sign in with Apple revocation, moderation notices). For an older build, remove the sentences marked *(fix release)*. The Play Console has no free-text review notes for most apps; use the same facts in Play's App access ("All functionality is available without special access") and Data safety answers.

> Kagemura is a base-building strategy game with online raids, Alliances, friends and small Gangs. **No login or demo account is needed:** the game creates an online account automatically on first start. Sign-ins are optional and only move the account to another device: on iPhone, **Sign in with Apple** and **Game Center** (Settings, gear at bottom left → Online play → Account → Sign-ins). There is no email/password account and no third-party login on iPhone other than those two.
>
> **Age screen** *(fix release)*: before online play the game asks the year of birth (the month only when the year alone does not decide), with nothing preselected, or uses the age range from the App Store's Declared Age Range when available; it keeps only the age group. Under 13: chat only with fixed phrases, a generated player name, and nobody can find them by name. 13 to 17: findable only by friends of friends, and online status hidden, until they change it. Under 18: monthly spending limit, an extra "check with a grown-up" step before buying, and no offers that open on their own. Enter a birth year 18 or more years ago to see every feature. Once a player says they are under 18, only our support team can change it back.
>
> **Online play (PvP):** finish or skip the short tutorial, then tap **Attack** (bottom right). The server finds a real player's village at your level or, when nobody fits, a computer rival clan's outpost labelled "(computer rival)" ("Generated rival" when no clan is named). Battles are checked by the server.
>
> **Chat, report and block:** the game shows the community rules once and asks the player to agree before their first chat message to real players or opening Friends. Alliance chat: tap **Alliance** (flag), join or create an Alliance. Gang chat: **Friends** → **Gang** tab, create a Gang. To report a message or block a player, tap **⋯** next to the message (also in the Alliance member list and on friend cards). A message reported by three players is hidden until staff decide; staff review reports and can remove messages, mute and suspend. *(fix release)* Reporters are told the outcome, and affected players are told what was decided, why, and how to appeal.
>
> **In-app purchases:** tap the Jade **+** at the top to open the Store. Prices come from the App Store. Purchases are delivered after our server checks the App Store transaction. **Restore purchases** is at the bottom of the Store (it restores the current season's Season Scroll from our purchase records). Jade packs, offers and the Season Scroll are consumables: the Season Scroll is bought once per season and lasts until the season ends.
>
> **Random rewards:** only the free daily chest is random; its odds are shown before it opens, and it is never sold. Nothing random is sold.
>
> **Account deletion:** Settings → Online play → Account → **Delete online account** (deletes the online account and the village on our server; *(fix release)* revokes the Sign in with Apple token if one was linked). Without the app: the web form at [deletion URL], using the Player ID and a one-time **deletion code** requested in the same Account screen (valid 30 days) *(fix release)*.
>
> **Privacy policy, terms, support and community rules:** Settings → **Privacy and help**.
>
> **Crash reports:** off until the player turns them on in Settings. **Notifications:** off until the player turns them on in Settings; quiet hours and a daily limit apply. No ads, no tracking (no App Tracking Transparency prompt is needed).

Before sending:
- Fill in `public/legal-config.js` and check that Settings → Privacy and help opens the privacy policy, support, community and terms pages in the submitted build, with no "not published yet" notes (and the terms adopted, so no draft banner).
- Replace `[deletion URL]` with `deletionUrl` from `legal-config.js` (the production server's `/account/delete`), and check it answers (`node tools/ops/check-domain.mjs https://<production server>`), on IPv6 too (App Review uses IPv6-only networks).
- Check the age screen appears before online play on a fresh install, and that an under-13 birth year really replaces the chat box with fixed phrases and hides the name field, before you claim it here.
- The production server must accept sandbox purchases (`APPLE_ENVIRONMENTS` includes `Sandbox`, the default) because App Review buys in the sandbox.
- Make sure at least one Alliance with seeded members and recent chat exists, so the reviewer can see chat, report and block without inviting anyone; and at least one other real or seeded player at low Keeps, or the reviewer only meets generated bases (still labelled, still fine).
- Test accounts: none needed. If a reviewer asks for one, give a Sandbox Apple ID only for purchases (App Store Connect → Users and Access → Sandbox), never a production account.
- Age rating answers and privacy label: `PRIVACY.md` (frequent cartoon/fantasy violence → 13+; messaging and UGC yes).
- Attach a short screen recording of a raid, the age screen, reporting a chat message, the Store and account deletion if a previous review asked questions.
