# UK Online Safety Act 2023: assessments for Kagemura (DRAFT, owner and legal review)

Status: **draft written from the code on 2026-11-05**, not an adopted assessment. The Act makes the provider (the publisher in `public/legal-config.js` → `operator`) responsible; this file prepares the written records Ofcom expects, for the owner to check, complete, sign and keep. Statements marked **(fix release)** depend on age and moderation features being added in parallel (age screen, no free-text chat under 13, private discovery defaults 13–17, moderation notices, deletion code): they are true only for builds ≥ that release.

Sources (Ofcom, read 2026-11-05; recheck the versions before adopting):
- Online safety regulatory documents and guidance: https://www.ofcom.org.uk/online-safety/illegal-and-harmful-content/online-safety-regulatory-documents
- Risk Assessment Guidance and Risk Profiles, v2.0 (25 June 2026): https://www.ofcom.org.uk/siteassets/resources/documents/online-safety/information-for-industry/illegal-harms/updates/risk-assessment-guidance-and-risk-profiles.pdf
- Quick guide to children's risk assessments: https://www.ofcom.org.uk/online-safety/illegal-and-harmful-content/quick-guide-to-childrens-risk-assessments
- Statement: Age Assurance and Children's Access (children's access assessments guidance)
- Record-Keeping and Review Guidance (24 April 2025): https://www.ofcom.org.uk/siteassets/resources/documents/online-safety/information-for-industry/illegal-harms/record-keeping-and-review-guidance.pdf
- Online Safety Act compliance guide for providers: https://www.ofcom.org.uk/online-safety/illegal-and-harmful-content/guide-for-services

## 1. Is Kagemura in scope?

- **User-to-user service:** yes. Players can write chat messages that other players read (Alliance chat, Gang chat), choose names other players see (player, Alliance and Gang names), and send friend requests, Gang invites and duel challenges. That is user-generated content encountered by other users. The "limited functionality" exemption does not apply (players talk to each other, not only comment on our content).
- **Links with the UK:** the game is offered in UK app stores and on the web; the UK is a target market once the UK storefront is selected. If the owner does not ship to the UK, record that decision here instead and exclude the UK territory in both stores.
- **Category:** not a categorised service (far below the Category 1/2B user thresholds). The duties for all user-to-user services apply: illegal content risk assessment and safety duties, children's access assessment, children's risk assessment and safety duties if children are likely to access, content reporting, complaints, record-keeping and review, and terms-of-service statements.
- **Size for the Codes:** a small service (fewer than 7 million monthly UK users), so most measures that apply are those for all services plus those triggered by the risks found below. Re-check each Codes measure against the final risk levels.

## 2. Service description (what the risk assessment is about)

| Feature | What users can do | Who sees it | Code |
|---|---|---|---|
| Player name | Choose a name (2–24 display units, any living script, word-filtered, unique, 28-day change limit) | Every player who meets them: raids, leaderboards, Alliances, friends | `src/gameplay/sim/social/names.ts`, `server/core/names.ts` |
| Alliance chat | Free-text messages (filtered) to an Alliance of up to the Alliance size; troop requests and donations | Members of that Alliance | `server/core/groves.ts` |
| Gang chat | Free-text messages to a Gang of 2–4 friends | Gang members | `server/core/squads.ts` |
| Friends | Find a player by exact name (if they allow it), friend code, link or QR; send/accept requests; see last-online if allowed | The two players | `server/core/friends.ts` |
| Friendly Duels, Gang Wars, raids | Attack another player's village layout | Attacker and defender; replays | `server/core/duels.ts`, `gangWars.ts`, `pvp.ts` |
| Alliance and Gang names | Choose a name (filtered) | Everyone browsing Alliances / Gang members and opponents | same |

Not present: private one-to-one messages, images, video, voice, file sharing, user-posted links that preview, public feeds, livestreaming, user search by anything other than exact name or code, location sharing. Chat **can contain typed URLs as text** (not blocked; see gaps).

## 3. Illegal content risk assessment (draft)

Method: Ofcom's four steps (understand the harms, assess the risk, decide and implement measures, report/review/update) using the Risk Profiles. Evidence used: the feature list above, the code's existing measures, no live user data yet (pre-launch). **Re-do with real data** (reports, moderation outcomes) within three months of launch.

Risk factors from Ofcom's U2U risk profile that apply: gaming service; user profiles (names); users can find and connect with other users (friend search, Alliance join); group messaging (Alliance/Gang chat); possibly child users; anonymous accounts (no email or real name needed). Not applicable: direct messaging, image/video posting, livestreaming, file sharing, encrypted messaging, marketplaces.

| Kind of priority illegal content (Ofcom list) | Relevant? | Draft risk level | Why |
|---|---|---|---|
| CSEA: grooming | Yes | **Medium** | Gaming plus group chat plus finding users plus possible child users is the profile Ofcom flags for grooming. Reduced by: no one-to-one messaging, no images, under-13 free-text chat off (fix release), 13–17 private discovery defaults (fix release), report/block, "do not share personal details" rule. Remaining path: an adult and a 13–17 player in the same Alliance chat, then moving off-platform. |
| CSEA: CSAM (images, links) | Partly | **Low** | No images; a typed link to CSAM is possible because URLs are not blocked. |
| Hate offences, harassment, stalking, threats, abuse | Yes | **Medium** | Free-text chat, names, competitive raiding. Word filter is narrow; reports and mutes exist. |
| Fraud and financial offences (scams, account trading) | Yes | **Low–medium** | Players may offer to "sell" accounts or Jade off-platform; rules forbid it; no in-game trading or gifting of Jade. |
| Terrorism, encouraging suicide or self-harm, foreign interference, false communications | Possible in text | **Low** | Only text in small groups; no amplification. |
| Drugs, firearms/weapons sales, sexual exploitation of adults, human trafficking, unlawful immigration, proceeds of crime | Possible in text | **Low** | No marketplace, payments between users or images. |
| Intimate image abuse, extreme pornography, cyberflashing, image-based offences, epilepsy trolling | No | **Negligible** | No user images, video or files. |
| Animal cruelty | No | **Negligible** | No user media. |
| Other illegal content (non-priority) | Possible | Low | Same text-only reasoning. |

Owner to confirm the list against v2.0 of the guidance (it lists the current priority kinds; v1 had 17) and record a level for each.

## 4. Children's access assessment (draft)

- **Is it possible for children to access the service?** Yes. There is no highly effective age assurance; the age screen is self-declared (fix release).
- **Child user condition:** likely met. A cartoon strategy game rated 13+ (Apple, `docs/store/PRIVACY.md`) with an under-13 band will have UK users under 18 in significant numbers. **Conclusion: likely to be accessed by children** → children's risk assessment and children's safety duties apply. Record this conclusion and the date.

## 5. Children's risk assessment (draft)

Primary priority content (pornography; suicide, self-harm and eating-disorder content): **Low** (text only, small groups, filter, reports).
Priority content (abuse and hate, bullying, violent content, harmful substances, dangerous stunts): **Medium for bullying, abuse and hate** (free-text chat and names among competing players), Low for the rest. Violent content: the game's own cartoon combat is provider content, not user content.
Non-designated content: pressure to spend (not user content, but record that offers never open on their own for under-18 players, fix release), contact from strangers (grooming, above).
Age groups: under 13 (fixed phrases only, generated name, not findable), 13–15 and 16–17 (free-text chat, friends-of-friends discovery, online status off by default). Owner: decide whether 13–15 should also start with Alliance chat limited to Alliances they create or join by invite.

## 6. Measures in the code today

| Measure | Where | Ofcom Codes area |
|---|---|---|
| Word filter on chat, names and Gang/Alliance names, word edges in every script, substrings in unspaced scripts | `src/gameplay/sim/social/grove.ts`, `names.ts` | content moderation |
| Unicode name rules (no look-alike script mixing, no invisible or direction-override characters, reserved names blocked) | `names.ts`, `server/core/names.ts` | impersonation |
| Report a message or a player with a reason and note; one open report per reporter and target | `server/core/moderation.ts` | reporting |
| Block (hides chat and requests; blocked player cannot find or befriend) | same, `server/core/friends.ts` | user controls |
| Auto-hide a message after 3 different reporters until staff decide | `HIDE_AFTER_REPORTS` | content moderation |
| Staff queue: dismiss, remove message, mute (up to a year), suspend; every staff action logged | `/admin`, `server/core/admin.ts`, `staff_actions` | content moderation, governance |
| Community rules acknowledged in game before the first chat to real players or opening Friends | `src/presentation/ui/communityRules.ts`, `public/community.html` | terms of service |
| Who can find me by name (everyone / friends of friends / nobody), last-online visibility | `players.findable`, `show_online` | user controls |
| Age bands from a neutral birth-year screen or the store's age signal (only stricter changes; staff reset after a check); under 13: fixed chat phrases only (`PRESET_CHAT`), a generated name, never findable by name or in platform-friend lists; 13–17: findable by friends of friends, online status off (fix release) | `src/gameplay/sim/age.ts`, `server/core/age.ts` | children's safety |
| Notices to reporters (outcome) and to affected players (action, reason, duration, appeal) (fix release) | moderation notices | reporting and complaints |
| Appeals: write to support within six months; reviewed by someone else (`public/terms.html` §7, draft) | support | complaints |
| Rate limits on reports and moderation routes | `server/rateLimit.ts` (`moderation` 30/h) | — |
| Account deletion in game and on the web | `server/core/account.ts` | — |

## 7. Gaps (owner / backend / GUI follow-ups)

1. **Named responsible person:** not named. Ofcom's Codes expect an individual accountable for the illegal content safety duties and the reporting and complaints duties. Responsible person: `________________` (name, role, date appointed). Fill here; it is not published.
2. **Typed URLs in chat** are not blocked or stripped: block links (or allow-list only the game's own domain) in chat and names. Backend/GAME THEORY (`filterText`).
3. **Filter coverage** is a short list; no image/hash matching is needed (no images), but consider a maintained multi-language list and grooming-pattern keywords ("snap", "whatsapp", "how old are you", phone-number patterns) that flag for review rather than block.
4. **Moderation staffing and response time:** none published. Set a target (for example: hidden messages reviewed within 24 h, all reports within 72 h) only once staffed, and record actual times.
5. **Rules and notices are English only** (R05/R06): UK is fine, but record it.
6. **No staff rename** of an offending name (only mute/suspend).
7. **Complaints about the provider's compliance** (not only about content) need a stated route: support email with the subject "Online safety complaint"; add to `public/support.html` once the responsible person exists.
8. **Age assurance:** self-declaration is not "highly effective age assurance". If the children's risk assessment keeps any High risk, Ofcom's children's Codes may expect stronger age checks for the affected features.
9. **Crisis/emergency:** rules tell players to contact emergency services; staff need an internal escalation note (credible threat to life, CSEA report to the NCA / CEOP for UK, NCMEC for US-hosted data) [recheck reporting duties: the OSA's CSEA reporting to the NCA applies once the regulations are in force].

## 8. Complaints procedure (to adopt)

- Who can complain: any UK user or affected person (including non-users named in content).
- About: illegal content, content harmful to children, a moderation decision (removal, mute, suspension, refusal to act on a report), use of age bands, or our compliance with these duties.
- How: in game (Report, with the notices' appeal link, fix release) or by email to `supportEmail` with the Player ID.
- What happens: acknowledgment; review by a staff member who did not take the original decision; outcome told to the complainant; if a decision is reversed, content/account restored.
- Timing: target to be set with staffing (gap 4). Keep every complaint and its outcome (record-keeping).

## 9. Record-keeping and review

- Keep this document, once adopted, as the written record: date, version of Ofcom's guidance used, evidence considered, risk levels, measures, the responsible person, and who approved it.
- Keep a list of every Codes measure that applies and whether it is followed or an alternative is used (with reasons).
- Review: at least **every 12 months**, and **before** any significant change: direct messages, images, voice, links, public feeds, opening to new age groups, changes to discovery defaults, or a large growth in UK users. Also re-do it within **three months of launch** with real report data.
- Moderation data to keep for review: number of reports by kind, auto-hidden messages, actions, appeal outcomes, response times (from `reports`, `staff_actions`; build a monthly staff report).

## 10. Sign-off

| Field | Value |
|---|---|
| Provider (legal name) | `operator` in `public/legal-config.js` |
| Responsible person | (gap 1) |
| Assessment date / version | |
| Approved by | |
| Next review due | |
