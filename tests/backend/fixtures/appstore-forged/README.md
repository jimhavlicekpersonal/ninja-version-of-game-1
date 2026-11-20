# Forged App Store chain (security audit 2026-11-20, P3)

A throwaway test chain made with openssl, never trusted by any store: an RSA leaf with no receipt-signing
extension, whose bytes carry Apple's leaf marker OID only as the value of an unrelated extension
(`leaf.cnf`). Before the fix the verifier searched the raw bytes for the OID and accepted an RS256 signature
under an `ES256` header. `tests/backend/server/security-audit-2026-11-20-money.test.ts` holds that it is refused.
