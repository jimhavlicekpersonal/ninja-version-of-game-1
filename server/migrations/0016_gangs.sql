-- Migration 0016 (roadmap step 63): Gangs, teams of 2-4 friends.
-- Gang chat, troop requests and gifts reuse the Alliance tables with the
-- scope id 'squad:<id>', so those tables no longer require an Alliance.
create table if not exists squads (
  id text primary key,
  name text not null,
  leader_id text not null,
  created_at bigint not null
);

create table if not exists squad_members (
  player_id text primary key references players(id) on delete cascade,
  squad_id text not null references squads(id) on delete cascade,
  role text not null,
  joined_at bigint not null
);
create index if not exists squad_members_squad_idx on squad_members (squad_id);

create table if not exists squad_invites (
  id text primary key,
  squad_id text not null references squads(id) on delete cascade,
  from_id text not null references players(id) on delete cascade,
  to_id text not null references players(id) on delete cascade,
  at bigint not null,
  status text not null default 'open'
);
create unique index if not exists squad_invites_open_idx on squad_invites (squad_id, to_id) where status = 'open';
create index if not exists squad_invites_to_idx on squad_invites (to_id, status);

-- 24 hours after leaving a Gang before joining another.
alter table players add column if not exists squad_left_at bigint not null default 0;

alter table grove_chat drop constraint if exists grove_chat_grove_id_fkey;
alter table troop_requests drop constraint if exists troop_requests_grove_id_fkey;
