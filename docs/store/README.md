# Store submission kit (roadmap steps 49–53, owner)

Everything here was prepared from the code so the owner can fill the store forms quickly. Each part needs the owner's review: you are the one who signs the declarations.

| Step | What | Prepared here |
|---|---|---|
| 49 | Listings: screenshots, description, support and privacy URLs | `LISTING.md` (texts), `npm run build && npm run store:screenshots` (real screens at App Store and Play sizes, into `docs/store/screenshots/`, not committed), `PRIVACY_POLICY.md` (a draft policy to publish at a public URL) |
| 50 | Privacy label, Data Safety form, IARC rating, user-generated content | `PRIVACY.md` (answers taken from what the code collects) |
| 51 | Apple review notes | `REVIEW_NOTES.md` (text to paste, and what to check before sending) |
| 52 | Closed testing | `TESTING.md` (TestFlight groups, Google closed track with 12+ testers for 14 days, a test script) |
| 53 | Submit; staged rollout | `RELEASE.md` (checklist, phased release and staged rollout percentages, what to watch, how to stop) |

Before any of this: the new app identity (bundle id, `docs/SHIPPING.md` section 6), products created with the store ids (3b), and the server live on its domain (3f, `node tools/ops/check-domain.mjs https://<server>`).
