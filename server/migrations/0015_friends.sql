-- Migration 0015 (roadmap step 59): one unique name per player, friend codes,
-- "who can find me", the staff badge, friend requests and friendships.
-- Existing players get their name key and friend code from the server when it
-- starts (server/core/friends.ts migrateNames: names that break the rules or
-- collide are fixed there, the oldest account keeping the plain name).
alter table players add column if not exists name_key text;
alter table players add column if not exists name_changed_at bigint not null default 0;
alter table players add column if not exists name_change_free boolean not null default false;
alter table players add column if not exists previous_name text;
alter table players add column if not exists previous_name_until bigint not null default 0;
alter table players add column if not exists friend_code text;
alter table players add column if not exists findable text not null default 'everyone';
alter table players add column if not exists hide_online boolean not null default false;
alter table players add column if not exists staff boolean not null default false;
create unique index if not exists players_name_key_idx on players (name_key);
create unique index if not exists players_friend_code_idx on players (friend_code);

-- A name its previous owner changed away from is held for them for 35 days.
create table if not exists name_holds (
  name_key text primary key,
  player_id text not null,
  until bigint not null
);

create table if not exists friend_requests (
  id text primary key,
  from_id text not null references players(id) on delete cascade,
  to_id text not null references players(id) on delete cascade,
  at bigint not null,
  status text not null default 'open'
);
create unique index if not exists friend_requests_open_idx on friend_requests (from_id, to_id) where status = 'open';
create index if not exists friend_requests_to_idx on friend_requests (to_id, status);

-- One row per pair, the smaller id first.
create table if not exists friendships (
  a text not null references players(id) on delete cascade,
  b text not null references players(id) on delete cascade,
  since bigint not null,
  primary key (a, b),
  check (a < b)
);
create index if not exists friendships_b_idx on friendships (b);
