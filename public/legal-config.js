/*
 * Publisher facts for the pages shipped with the game: privacy.html, support.html, community.html,
 * terms.html, tokushoho.html and shikin-kessai.html. These are owner decisions, not something the code
 * can know: fill them in before a store release (docs/store/LISTING.md, "Publishing the pages", and
 * docs/legal/). While a value is empty, the pages say plainly that it has not been set yet instead of
 * inventing one. Never put a placeholder here: an empty string is the honest "not decided yet".
 */
window.KAGEMURA_LEGAL = {
  /** Legal name of the person or company that publishes Kagemura (the data controller and seller). */
  operator: '',
  /** Postal address of the publisher (privacy policy controller identity; Japan 特定商取引法 表記). */
  operatorAddress: '',
  /** Phone number for the Japanese commerce notice. May instead say how it is disclosed on request (docs/legal/JAPAN.md). */
  operatorPhone: '',
  /** Person responsible for the business (Japan: 運営責任者 / 代表者). */
  responsiblePerson: '',
  /** Address that answers support and privacy questions, e.g. support@example.com. */
  supportEmail: '',
  /** The server's web deletion form, e.g. https://api.example.com/account/delete. */
  deletionUrl: '',
  /**
   * The server's complaint form for illegal or harmful content (EU DSA art. 16, UK Online Safety Act),
   * e.g. https://api.example.com/complaints. support.html links it while set.
   */
  complaintUrl: '',
  /** EU representative under GDPR Art. 27 (name and address), if the publisher is outside the EU. */
  euRepresentative: '',
  /** UK representative under UK GDPR Art. 27 (name and address), if the publisher is outside the UK. */
  ukRepresentative: '',
  /** Hosting provider and the country or region where the server and database run. */
  hosting: '',
  /** Where Sentry stores crash reports (its US or EU data region). */
  crashReportRegion: '',
  /** Country whose law governs the terms of service, and its courts. */
  governingLaw: '',
  /*
   * Retention periods the code does not enforce yet (owner decision; proposals and the backend work they
   * need are in docs/store/PRIVACY.md, "Retention"). Write them as players should read them, e.g. "24 months".
   */
  /** How long support email is kept after the last message in a conversation (proposal: 24 months). */
  retentionSupportMail: '',
  /** How long a handled web deletion request is kept (proposal: 12 months after it was handled). */
  retentionDeletionRequests: '',
  /** After how long without online play an account is deleted, after a notice in the game (proposal: 24 months). */
  retentionInactiveAccounts: '',
  /** How long the host keeps server request logs with IP addresses (proposal: 30 days). */
  retentionServerLogs: '',
  /** Terms of service. The shipped page is a draft until termsEffective is set. */
  termsUrl: './terms.html',
  /** Date the terms of service came into force. Empty: terms.html shows itself as a draft for legal review. */
  termsEffective: '',
  /** Date the privacy policy text was last changed. */
  policyUpdated: '2026-11-05',
};
