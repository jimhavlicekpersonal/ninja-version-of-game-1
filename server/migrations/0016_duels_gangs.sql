-- Migration 0016 (roadmap steps 62-63): Friendly Duels and Gangs.
-- Gang chat and Gang troop requests reuse grove_chat and troop_requests with the Gang's id
-- in grove_id, so those columns no longer point at groves only.
alter table grove_chat drop constraint if exists grove_chat_grove_id_fkey;
alter table troop_requests drop constraint if exists troop_requests_grove_id_fkey;

alter table tickets add column if not exists challenge_id text;
alter table players add column if not exists duel_base jsonb;
alter table players add column if not exists squad_left_at bigint not null default 0;

create table if not exists duels (
  id text primary key,
  at bigint not null,
  attacker_id text not null,
  defender_id text not null,
  record jsonb not null
);
create index if not exists duels_attacker_idx on duels (attacker_id, at);
create index if not exists duels_defender_idx on duels (defender_id, at);

create table if not exists duel_tallies (
  attacker_id text not null,
  defender_id text not null,
  duels integer not null default 0,
  wins integer not null default 0,
  best_stars integer not null default 0,
  best_destruction real not null default 0,
  primary key (attacker_id, defender_id)
);
create index if not exists duel_tallies_defender_idx on duel_tallies (defender_id);

create table if not exists duel_challenges (
  id text primary key,
  from_id text not null,
  to_id text not null,
  created_at bigint not null,
  expires_at bigint not null,
  from_result jsonb,
  to_result jsonb
);
create index if not exists duel_challenges_from_idx on duel_challenges (from_id, created_at);
create index if not exists duel_challenges_to_idx on duel_challenges (to_id, created_at);

create table if not exists squads (
  id text primary key,
  name text not null,
  created_at bigint not null,
  rating jsonb
);
create table if not exists squad_members (
  player_id text primary key references players(id),
  squad_id text not null references squads(id),
  role text not null,
  joined_at bigint not null
);
create index if not exists squad_members_squad_idx on squad_members (squad_id);
create table if not exists squad_invites (
  id text primary key,
  squad_id text not null references squads(id),
  from_id text not null,
  to_id text not null,
  at bigint not null
);
create index if not exists squad_invites_to_idx on squad_invites (to_id, at);
create index if not exists squad_invites_squad_idx on squad_invites (squad_id, at);
