-- Migration 0004 (roadmap step 14): account deletion.
-- A defender keeps the replay of a raid even when the raider deletes their
-- account (shown as "Deleted player"), so an attack no longer needs its
-- attacker to exist.
alter table attacks drop constraint if exists attacks_attacker_id_fkey;

-- Deletion requests from the web form (GET /account/delete), for players who
-- can no longer open the game. Staff work through them with the admin API.
create table if not exists deletion_requests (
  id text primary key,
  at bigint not null,
  player_id text not null,
  name text not null,
  contact text not null,
  note text not null,
  status text not null default 'open',
  resolved_at bigint,
  resolution text
);
create index if not exists deletion_requests_open_idx on deletion_requests (at) where status = 'open';
