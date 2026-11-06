-- Migration 0028 (state-of-the-game report, section 5 step 7, compliance C14):
-- Google Play's UGC policy asks that users accept the terms or user policy before
-- they post. The game asked once per device and kept it in local storage only; the
-- server now keeps which version of the community rules each account accepted,
-- and chat and chosen names need the current one.
alter table players add column if not exists rules_version integer not null default 0;
alter table players add column if not exists rules_accepted_at bigint not null default 0;
