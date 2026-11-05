-- Migration 0002 (roadmap step 10): the server issues each ticket's battle seed.
-- Null on tickets issued before this change; those keep the client's seed.
alter table tickets add column if not exists seed bigint;
