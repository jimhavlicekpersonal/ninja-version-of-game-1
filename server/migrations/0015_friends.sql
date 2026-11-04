-- Migration 0015 (roadmap step 59): unique names, friend codes, privacy, friends and requests.
-- name_key is null on players from before this step until the server's name migration
-- (server/core/names.ts migrateNames) gives each one; a unique index keeps names unique.
alter table players add column if not exists name_key text;
alter table players add column if not exists previous_name text;
alter table players add column if not exists name_changed_at bigint not null default 0;
alter table players add column if not exists free_renames integer not null default 0;
alter table players add column if not exists findable text not null default 'everyone';
alter table players add column if not exists show_online boolean not null default true;
alter table players add column if not exists friend_code text;
alter table players add column if not exists staff boolean not null default false;
create unique index if not exists players_name_key_idx on players (name_key);
create unique index if not exists players_friend_code_idx on players (friend_code);
create index if not exists players_no_name_key_idx on players (created_at) where name_key is null;

-- A released name is kept for its previous owner for a while.
create table if not exists name_holds (
  name_key text primary key,
  player_id text not null,
  until bigint not null
);

-- One row per pair, a < b.
create table if not exists friendships (
  a text not null references players(id),
  b text not null references players(id),
  since bigint not null,
  primary key (a, b),
  check (a < b)
);
create index if not exists friendships_b_idx on friendships (b);

create table if not exists friend_requests (
  id text primary key,
  from_id text not null references players(id),
  to_id text not null references players(id),
  at bigint not null
);
create index if not exists friend_requests_to_idx on friend_requests (to_id, at);
create index if not exists friend_requests_from_idx on friend_requests (from_id, at);
