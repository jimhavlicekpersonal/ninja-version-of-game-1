/*
 * Publisher facts for the privacy, support and community pages shipped with the game
 * (privacy.html, support.html, community.html). These are owner decisions, not something
 * the code can know: fill them in before a store release (docs/store/LISTING.md,
 * "Publishing the pages"). While a value is empty, the pages say plainly that it has not
 * been set yet instead of inventing one.
 */
window.KAGEMURA_LEGAL = {
  /** Legal name of the person or company that publishes Kagemura (the data controller). */
  operator: '',
  /** Address that answers support and privacy questions, e.g. support@example.com. */
  supportEmail: '',
  /** The server's web deletion form, e.g. https://api.example.com/account/delete. */
  deletionUrl: '',
  /** Full terms of service, if the publisher has them. */
  termsUrl: '',
  /** Date the privacy policy text was last changed. */
  policyUpdated: '2026-11-05',
};
