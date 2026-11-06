# Kagemura privacy policy and legal pages: where they live and how to publish them

The privacy policy is **`public/privacy.html`**. It ships with every build (web, iOS, Android), so it is at `<web address of the game>/privacy.html` once `.github/workflows/deploy.yml` has published the web build, and Settings → **Privacy and help** → Privacy policy opens it in the game (worldwide audit GLOBAL-015). Edit that page, not a copy here, so the store URL and the in-game link can never disagree.

| Page | What | Status |
|---|---|---|
| `public/privacy.html` | Privacy policy (GDPR/UK GDPR Art. 13/14, LGPD, CCPA) | text written from the code; needs `legal-config.js` filled and legal review |
| `public/support.html` | Support, purchases, age groups, appeals, deletion | same |
| `public/community.html` | Community rules (audit R06), acknowledged in game (`ui/communityRules.ts`) | maintained with the age/moderation features |
| `public/terms.html` | Terms of service | **draft**: shows a "Draft for legal review" banner until `termsEffective` is set |
| `public/tokushoho.html` | 特定商取引法に基づく表記 (Japan) | draft, see `docs/legal/JAPAN.md` |
| `public/shikin-kessai.html` | 資金決済法に基づく表示 (Japan, prepaid Jade) | draft, see `docs/legal/JAPAN.md` |

All pages read the publisher facts from `public/legal-config.js` through `public/legal.js`; a missing value shows a visible "not published yet" note instead of an invented one. `tests/presentation/store-compliance.test.ts` checks the privacy, support and community pages for placeholders and that the config ships empty.

## What the policy says, and what it rests on (2026-11-05)

- **Controller identity and representatives:** `operator`, `operatorAddress`, `supportEmail`, `euRepresentative`, `ukRepresentative` (GDPR/UK GDPR Art. 27 representatives are needed when the publisher has no establishment there and offers the game to people there; owner/legal decision).
- **Legal basis per purpose** (GDPR Art. 6, LGPD Art. 7): contract for the account, game, social features, linked sign-ins; legitimate interests for anti-cheat, security/IP, moderation, server errors, support; consent for push, crash reports and play statistics; legal obligation for purchase records, deletion requests and age protections. Legal review must confirm these per market (for children, consent/contract capacity differs: GDPR Art. 8 ages 13–16 by country; LGPD Art. 14 for children under 12).
- **International transfers:** hosting and Sentry regions are fields (`hosting`, `crashReportRegion`); SCCs/UK IDTA are named as the mechanism. Sentry offers an EU data region: choosing it removes the transfer for EU crash data.
- **Rights:** access, portability, rectification, erasure, restriction, objection, withdrawal of consent, complaint (EU authority, ICO, ANPD), CCPA/CPRA rights, LGPD Art. 18 rights.
- **Retention:** coded periods (replays/duels/command log 30 days, friend requests 14 days, handled reports 90 days, purchase intents 90 days, purchases kept unlinked) and four owner periods shown as fields until decided (`retentionInactiveAccounts`, `retentionSupportMail`, `retentionDeletionRequests`, `retentionServerLogs`; proposals in `PRIVACY.md` → Retention). Do not fill `retentionInactiveAccounts` until the backend deletes inactive accounts.
- **Children and age bands:** the game is rated 13+ in the stores and is not marketed to children, but it does not pretend younger children never play: the neutral age screen (build ≥ fix release) turns off free-text chat under 13, starts 13–17 players on private discovery settings, and keeps the under-18 spending limit and no pop-up offers. The previous line "not directed at children under 13" was removed: it conflicted with a game that has an under-13 band. Whether this position is enough in the US (COPPA "mixed audience"), UK (Children's Code) and Brazil (ECA Digital) is a legal decision (`docs/legal/MARKETS.md`).
- **Deletion:** in game; on the web with Player ID or name plus the **deletion code** from Settings → Online play → Account (build ≥ fix release; without the code staff verify ownership first, `docs/SHIPPING.md` 3a); Sign in with Apple tokens revoked on deletion (build ≥ fix release; Apple requires it for apps offering Sign in with Apple).
- **Moderation notices:** reporters are told the outcome; affected players are told what, why, how long and how to appeal; reporters are never named to the reported player (build ≥ fix release: confirm the notices implementation keeps that).
- **Play statistics are opt-in, adults only** (report section 5 step 5, `src/backend/analytics/share.ts`): asked once online after the age is known, never under 18 or with an unknown age; a random statistics id, never the player token; the allowlist in `src/backend/net/stats.ts` is what the policy's list describes (keep both in step); turning it off deletes the id's rows (`DELETE /v1/stats`); 400 days (`server/core/stats.ts`). Consent is the basis; whether the backlog sent at the yes (the events this device recorded before) is covered by that consent, and whether ePrivacy Art. 5(3) needs anything more, is for legal review. Offer-timing experiments run only for players who share (an arm is picked by the statistics id).
- **Crash reports are opt-in** (`src/backend/platform/prefs.ts`); the policy does not promise an error message can never contain player data (`sentryEnvelope.ts` `scrubText` removes URL parameters and email-shaped text only).
- **No email is collected by the deletion page** and the server drops a `contact` field an old page might still send (`server/core/account.ts` writes `''`).

## Before publishing (owner)

1. Fill in `public/legal-config.js`: publisher name and address, contact, deletion URL, EU/UK representatives (or decide you need none, and remove those lines from the policy), hosting and Sentry regions, governing law, the four retention periods.
2. Legal review for each market you ship to (`docs/legal/MARKETS.md`): legal bases, transfers, retention, the children's position, the terms of service, and the Japanese notices.
3. Sentry: turn on "Prevent Storing of IP Addresses" and server-side data scrubbing, or the policy sentence and the "not linked" crash-data declaration in `PRIVACY.md` do not hold.
4. Adopt the terms: set `termsEffective` (the draft banners on `terms.html`, `tokushoho.html` and `shikin-kessai.html` disappear), and bump `COMMUNITY_RULES_VERSION` in the game if acceptance should cover the terms too.
5. Set `policyUpdated` whenever the text changes, and tell players in the game about important changes.
6. Publish only with a build ≥ the fix release (age screen, deletion code, Apple revocation, notices); for an older build remove those statements first.
7. Open the live URLs in the submitted build (Settings → Privacy and help) and in a phone browser on mobile data, then enter them in App Store Connect and Play Console.
