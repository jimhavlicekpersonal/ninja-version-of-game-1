-- Toadstool Kingdoms PvP server schema (PostgreSQL 14+). Times are epoch milliseconds.
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
create index if not exists players_match_idx on players (trophies) where base is not null;

create table if not exists tickets (
  id text primary key,
  attacker_id text not null references players(id),
  defender_id text not null references players(id),
  base jsonb not null,
  defender_trophies integer not null,
  created_at bigint not null,
  used boolean not null default false
);

create table if not exists attacks (
  id text primary key,
  at bigint not null,
  attacker_id text not null references players(id),
  defender_id text not null references players(id),
  record jsonb not null
);
create index if not exists attacks_defender_idx on attacks (defender_id, at);
create index if not exists attacks_attacker_idx on attacks (attacker_id, at);
