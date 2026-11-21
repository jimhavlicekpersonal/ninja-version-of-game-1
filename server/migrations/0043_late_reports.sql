-- Migration 0043 (Beast Mode 2026-11-21, SEC-04). Additive.
--
-- Battle reports sent later than REPORT_GRACE_MS after the raid started, per player, so staff can see who holds
-- reports back (a report held while the player is online can search deployment plans with the shipped simulator).
alter table players add column if not exists late_reports integer not null default 0;
alter table players add column if not exists late_report_at bigint not null default 0;
-- When the player's current online session began (requests no more than 5 minutes apart).
alter table players add column if not exists online_since bigint not null default 0;
