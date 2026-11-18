// The store id rules shared by the release check and capacitor.config.ts (PUB-05, P7-02).
export const LEGACY_APP_ID = 'com.toadstoolkingdoms.app';
const ID = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

/** Why a signed build may not use this id, or null. */
export function appIdProblem(id, allowLegacy = false) {
  if (!id) return allowLegacy ? null : `APP_ID is not set. A signed build would upload under the legacy id ${LEGACY_APP_ID}, which Google Play never lets you change. Set the repository variable APP_ID to the new id (docs/SHIPPING.md section 6), or ALLOW_LEGACY_APP_ID=1 to keep the legacy id on purpose.`;
  if (!ID.test(id)) return `APP_ID ${JSON.stringify(id)} is not a valid reverse-domain id (lower case, dots, letters, digits, underscores).`;
  if (id === LEGACY_APP_ID && !allowLegacy) return `APP_ID is the legacy id ${LEGACY_APP_ID}. Set ALLOW_LEGACY_APP_ID=1 to upload under it on purpose.`;
  return null;
}
