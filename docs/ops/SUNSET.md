# Ending online play (sunset plan, Beast Mode 2026-11-21 OPS-13)

The terms say "We can change or end the game or online play". This is how, so players lose as little as possible
and every market's rules on unused paid currency are met. **The legal checks per market are owner steps:** confirm
them with counsel before announcing.

## Order of steps

| When (before the end, E) | Step | How |
|---|---|---|
| E − 60 days at the latest | Decide the end date and the per-market refund handling (below); prepare store texts | Owner and counsel |
| E − 30 days at least | Tell players in the game and by push | `SERVER_NOTICE` (Settings → Online play) and a News notice; push to players who switched on notifications (their types and quiet hours still apply). The countdown shown must be the real date. |
| E − 30 days | **Stop sales first** | `PRODUCTS_OFF` with every product id on the server (OPS-09): the Store shows them paused; remove the products from App Store Connect and Play Console; stop the Season Scroll sale for seasons that would end after E |
| E − 30 → E | Handle unused paid Jade per market | Japan (Payment Services Act): `GET /admin/v1/reports/jp-unused-balance?date=<E>` gives the unused prepaid balance to refund and the public notice it needs; EU/UK and other markets: follow counsel's advice (refunds of recent purchases through the stores' own refund routes) |
| E | Turn online play off | Stop matchmaking and new registrations (`FEATURES_OFF`), then answer `/v1/hello` with the end notice; keep the deletion form and `/v1/account` deletion running for 90 days |
| E | Offline mode for device villages | Ship a last build that starts offline only (no `VITE_SERVER_URL`): device-held villages keep playing against generated rivals, which stay labelled as generated. **Server-held villages** must be offered back to the device first: a release before E that moves each held village back into the device save (owner decision; it does not exist yet) |
| E + 90 days | Delete player data | Run account deletion for every player-owned table (the same path as `deleteAccount`), keep only what law requires (purchase records unlinked, as the privacy policy says); delete backups on their normal schedule (`docs/store/PRIVACY.md` retention) and record the date |

## Never

- No sale, discount or new paid offer after the announcement.
- No countdown that is not the real end date.
- No wiping of a device village: the offline game keeps it.
