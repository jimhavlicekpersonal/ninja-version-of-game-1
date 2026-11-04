-- Roadmap steps 72-73: which battle rules and data version a ticket was
-- issued under (its report must match, and it is re-simulated with those
-- rules), and which rules a player's base was uploaded under (matchmaking
-- re-checks it under a different version). Nullable: older rows mean the
-- rules that were live when they were written.
alter table tickets add column if not exists rules integer;
alter table tickets add column if not exists data_version text;
alter table players add column if not exists base_rules integer;
