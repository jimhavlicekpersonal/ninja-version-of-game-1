-- Toadstool Kingdoms server schema (PostgreSQL 14+). Times are epoch milliseconds.
-- Safe to run on every start: it creates what is missing and upgrades the
-- protocol-1 tables (PvP only) in place.

create table if not exists players (
  id text primary key,
  name text not null,
  token_hash text not null unique,
  trophies integer not null default 0,
  hall_level integer not null default 1,
  shield_until bigint not null default 0,
  base jsonb,
  created_at bigint not null,
  updated_at bigint not null
);
alter table players add column if not exists grove_id text;
alter table players add column if not exists last_seen_at bigint not null default 0;
drop index if exists players_match_idx;
create index if not exists players_match2_idx on players (hall_level, trophies) where base is not null;
create index if not exists players_rank_idx on players (trophies desc) where base is not null;

create table if not exists tickets (
  id text primary key,
  attacker_id text not null references players(id),
  defender_id text references players(id),
  base jsonb not null,
  defender_trophies integer not null,
  created_at bigint not null,
  used boolean not null default false
);
alter table tickets alter column defender_id drop not null;
alter table tickets add column if not exists kind text not null default 'pvp';
alter table tickets add column if not exists defender_name text not null default '';
alter table tickets add column if not exists expires_at bigint not null default 0;
alter table tickets add column if not exists week integer;
alter table tickets add column if not exists grove_id text;
alter table tickets add column if not exists target integer;
create index if not exists tickets_lock_idx on tickets (defender_id, created_at) where not used;

create table if not exists attacks (
  id text primary key,
  at bigint not null,
  attacker_id text not null references players(id),
  defender_id text not null references players(id),
  record jsonb not null
);
create index if not exists attacks_defender_idx on attacks (defender_id, at);
create index if not exists attacks_attacker_idx on attacks (attacker_id, at);

create table if not exists groves (
  id text primary key,
  name text not null,
  color text not null,
  created_at bigint not null
);

-- One Grove per player: the primary key is the player.
create table if not exists grove_members (
  player_id text primary key references players(id),
  grove_id text not null references groves(id),
  role text not null,
  joined_at bigint not null,
  xp integer not null default 0
);
create index if not exists grove_members_grove_idx on grove_members (grove_id);

create table if not exists grove_chat (
  seq bigserial primary key,
  id text not null unique,
  grove_id text not null references groves(id),
  at bigint not null,
  player_id text,
  name text,
  text text not null,
  kind text not null
);
create index if not exists grove_chat_grove_idx on grove_chat (grove_id, seq);
create index if not exists grove_chat_player_idx on grove_chat (player_id, at);

create table if not exists troop_requests (
  id text primary key,
  grove_id text not null references groves(id),
  player_id text not null references players(id),
  name text not null,
  at bigint not null,
  size integer not null,
  filled integer not null default 0,
  open boolean not null default true
);
create index if not exists troop_requests_grove_idx on troop_requests (grove_id, at) where open;
create index if not exists troop_requests_player_idx on troop_requests (player_id, at);

create table if not exists donations (
  id text primary key,
  request_id text not null references troop_requests(id),
  grove_id text not null,
  from_id text not null,
  from_name text not null,
  to_id text not null,
  troop text not null,
  count integer not null,
  level integer not null,
  at bigint not null,
  delivered boolean not null default false
);
create index if not exists donations_inbox_idx on donations (to_id) where not delivered;

create table if not exists raid_pairings (
  week integer not null,
  grove_id text not null,
  opponent_grove_id text,
  opponent_name text not null,
  bot_seed bigint not null,
  roster jsonb not null,
  our_size integer not null,
  our_hall integer not null,
  created_at bigint not null,
  primary key (week, grove_id)
);

create table if not exists raid_attacks (
  id text primary key,
  week integer not null,
  grove_id text not null,
  attacker_id text not null,
  target integer not null,
  stars integer not null,
  destruction real not null,
  at bigint not null
);
create index if not exists raid_attacks_idx on raid_attacks (week, grove_id);

create table if not exists raid_claims (
  week integer not null,
  player_id text not null,
  grove_id text not null,
  outcome text not null,
  at bigint not null,
  primary key (week, player_id)
);

-- Shadow Clans (protocol 4): PvP onboarding, Shadow Rank, regions, factions, tournaments.
alter table players add column if not exists pvp_opt_in boolean not null default false;
alter table players add column if not exists rating integer not null default 1000;
alter table players add column if not exists defense_rating integer not null default 1000;
alter table players add column if not exists rated_games integer not null default 0;
alter table players add column if not exists rating_season integer not null default -1;
alter table players add column if not exists last_season jsonb;
alter table players add column if not exists region_id text;
alter table players add column if not exists faction text;
create index if not exists players_rating_idx on players (rating desc) where rated_games > 0;
create index if not exists players_defense_idx on players (defense_rating desc) where rated_games > 0;
create index if not exists players_region_idx on players (region_id);
create index if not exists players_faction_idx on players (faction) where faction is not null;
create index if not exists attacks_at_idx on attacks (at);
create index if not exists tickets_created_idx on tickets (created_at) where kind = 'pvp';

create table if not exists regions (
  id text primary key,
  name text not null,
  seed bigint not null,
  created_at bigint not null
);

create table if not exists faction_terms (
  clan text not null,
  season integer not null,
  player_id text not null,
  primary key (clan, season)
);

create table if not exists tournament_scores (
  tournament integer not null,
  player_id text not null references players(id),
  idx integer not null,
  score integer not null,
  at bigint not null,
  primary key (tournament, player_id, idx)
);

-- Shadow Clans fixes: alternate accounts, stored combat rating, measured demand, shared territory,
-- faction leaders' war targets, army snapshots on tickets.
alter table players add column if not exists owner_key text;
alter table players add column if not exists combat_rating integer;
create index if not exists players_owner_idx on players (owner_key) where owner_key is not null;
alter table tickets add column if not exists settlement text;
alter table tickets add column if not exists army_cap jsonb;

create table if not exists searches (
  player_id text not null,
  hall integer not null,
  at bigint not null
);
create index if not exists searches_at_idx on searches (at, hall);

create table if not exists region_claims (
  region_id text not null,
  settlement text not null,
  player_id text not null references players(id),
  name text not null,
  since bigint not null,
  primary key (region_id, settlement)
);

create table if not exists faction_targets (
  clan text not null,
  week integer not null,
  target text not null,
  by_player text not null,
  primary key (clan, week)
);
