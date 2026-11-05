# Kagemura privacy policy: where it lives and how to publish it

The privacy policy is **`public/privacy.html`**. It ships with every build (web, iOS, Android), so it is at `<web address of the game>/privacy.html` once `.github/workflows/deploy.yml` has published the web build, and Settings → **Privacy and help** → Privacy policy opens it in the game (worldwide audit GLOBAL-015). Edit that page, not a copy here, so the store URL and the in-game link can never disagree. Its companions are `public/support.html` and `public/community.html` (community rules, audit R06).

The text was written from what the code collects on 2026-11-05 (see `PRIVACY.md` for the table it follows). Points that changed against the earlier draft, and why:

- **Crash reports are opt-in.** `src/backend/platform/prefs.ts` now defaults `crashReports` to off; before, a build with `VITE_SENTRY_DSN` sent reports until the player switched them off. Devices that never touched the switch stopped sending when this changed; a stored choice is kept. The policy does not promise that an error message can never contain player data: the game adds none and scrubs URL parameters and email-like text (`analytics/sentryEnvelope.ts` `scrubText`), but a message can quote text the code was handling.
- **No email on the deletion page.** `server/accountPage.ts` no longer asks for "how we can reach you": staff carry a request out by Player ID and never write back, so the address was collected for nothing (audit GLOBAL-019). The server's `POST /v1/account/deletion-requests` still stores a `contact` field if a client sends one (`server/core/account.ts`); the shipped page no longer sends it. Backend follow-up: stop storing it, and set a retention period for handled deletion requests.
- **Support email is declared.** Players who write to support give us their address; the policy says so.
- **Friends, Gangs, duels, the server-held village, server error reports and the website host's logs** are listed, and the earlier "the game works offline" wording is gone (a village kept on the server needs a connection for raids and purchases).

## Before publishing (owner)

1. Fill in `public/legal-config.js` (publisher name, support/privacy contact address, deletion page URL, terms URL if any). The page shows "not published yet" for anything missing instead of inventing it.
2. Legal review for each market you ship to (GDPR/UK GDPR, CCPA/CPRA, LGPD, and others): legal basis, international transfers (where your host and Sentry store data), retention for support mail and handled deletion requests, the under-13 statement (the game does not yet ask younger children anything different, audit R07), and whether you need a representative in the EU/UK.
3. Sentry: turn on "Prevent Storing of IP Addresses" and server-side data scrubbing in the project, or the "not linked" crash-data declaration in `PRIVACY.md` does not hold.
4. Set `policyUpdated` in `legal-config.js` whenever the text changes, and tell players in the game about important changes.
5. Open the live URL in the submitted build (Settings → Privacy and help) and in a phone browser on mobile data, then enter it in App Store Connect and Play Console.
