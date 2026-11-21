-- migrate: no-transaction
-- Migration 0044 (Beast Mode 2026-11-21, SEC-06). Additive.
--
-- A name's skeleton (src/backend/net/names.ts `nameSkeleton`): names in Latin look-alike scripts read through the
-- look-alike folds, so "Јоhn" (Cyrillic) and "John" can no longer both be claimed. Not unique: names claimed
-- before this deploy may share one (no forced rename); the server refuses new clashes. The server fills it for
-- existing players at start (`backfillSkeletons`). Built CONCURRENTLY, so statement by statement.
alter table players add column if not exists name_skeleton text;
create index concurrently if not exists players_name_skeleton_idx on players (name_skeleton);
