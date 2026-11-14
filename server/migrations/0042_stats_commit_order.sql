-- Migration 0042 (last gaps 2026-11-14). Additive.
--
-- The statistics rollup's watermark becomes commit-order safe. A receipt time
-- is taken before its insert commits, so a batch committed after a rollup had
-- read past its receipt time was skipped for good (the 5-minute lag window only
-- narrowed that). Each event now carries the id of the transaction that wrote
-- it (the default, so every insert sets it, also an older build's during a
-- rolling deploy), and a run reads only events from transactions older than the
-- oldest one still running (pg_snapshot_xmin): all of those have committed or
-- rolled back, so nothing below the watermark can still appear. Needs
-- PostgreSQL 13 or later (pg_current_xact_id).
alter table stats_events add column if not exists txid bigint;
alter table stats_events alter column txid set default (pg_current_xact_id()::text::bigint);
-- Events of the last two days get this migration's id, so the first run under
-- the new watermark (which starts at 0) summarizes them again (idempotent);
-- older ones were rolled by the previous watermark and are read whenever their
-- statistics id sends again (a summary is rebuilt from all of an id's events).
update stats_events set txid = pg_current_xact_id()::text::bigint
  where txid is null and received_at > (extract(epoch from now()) * 1000)::bigint - 2 * 86400000;
create index if not exists stats_events_txid on stats_events (txid);
