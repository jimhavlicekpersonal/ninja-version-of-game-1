/**
 * Server-side contact and link enforcement (backend batch 2026-11-13; compliance C25, UK Online Safety
 * Act). Since 2026-11-14 the stronger checks (look-alike and full-width letters, invisible characters,
 * spelled "dot"/"at", short links, more apps, phone numbers in words) are part of the shared filter in
 * `src/gameplay/sim/social/contactFilter.ts`, so the device refuses and replaces the same things. This
 * module keeps the server's names for them:
 *
 * - names (players, Alliances, Gangs) holding any of it are refused (`serverHasContact`, the same as the
 *   shared `hasContact`);
 * - a chat message holding any of it is replaced by `CONTACT_REMOVED` (`filterText` already does it;
 *   `enforceChat` stays for callers that check text that did not go through `filterText`).
 */
import { hasContact } from '../../src/gameplay/sim/social/grove';

export { CONTACT_REMOVED, enforceChat, foldForContact } from '../../src/gameplay/sim/social/contactFilter';

/** Names: does the text, read the way a filter-dodger writes it, carry a way to reach someone off the game? */
export function serverHasContact(text: string): boolean {
  return hasContact(text);
}
