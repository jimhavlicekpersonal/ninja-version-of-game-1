-- Migration 0003 (roadmap step 11): each base version is stored once, keyed by
-- the SHA-256 of its canonical JSON (server/contentHash.ts). Tickets and attack
-- records keep only the key (base_hash), instead of a 10-20 KB copy each.
--
-- Rows written before this change keep their own copy (tickets.base,
-- attacks.record->'base') and are read as before; the 30-day retention
-- (server/core/retention.ts) removes them. During a rolling deploy an old
-- server cannot read tickets made by the new one (their base is null): it
-- answers 500 and the game retries, so keep the overlap short.
create table if not exists base_versions (
  hash text primary key,
  base jsonb not null,
  created_at bigint not null,
  last_used_at bigint not null
);
create index if not exists base_versions_last_used_idx on base_versions (last_used_at);

alter table tickets add column if not exists base_hash text;
alter table tickets alter column base drop not null;
alter table attacks add column if not exists base_hash text;

-- Reference checks and retention scans.
create index if not exists tickets_base_hash_idx on tickets (base_hash);
create index if not exists attacks_base_hash_idx on attacks (base_hash);
create index if not exists tickets_created_idx on tickets (created_at);
create index if not exists attacks_at_idx on attacks (at);
