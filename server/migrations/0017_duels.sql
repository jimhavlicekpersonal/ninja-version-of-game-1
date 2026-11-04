-- Migration 0017 (roadmap step 62): Friendly Duels between friends.
-- Unranked: no Honor, loot, troops, rating or shield ever change. A duel's
-- replay (with its base) is kept 30 days like PvP replays; the rivalry tally
-- per pair is kept.
create table if not exists duels (
  id text primary key,
  at bigint not null,
  attacker_id text not null references players(id) on delete cascade,
  defender_id text not null references players(id) on delete cascade,
  challenge_id text,
  record jsonb not null
);
create index if not exists duels_attacker_idx on duels (attacker_id, at desc);
create index if not exists duels_defender_idx on duels (defender_id, at desc);

create table if not exists rivalries (
  a text not null references players(id) on delete cascade,
  b text not null references players(id) on delete cascade,
  duels integer not null default 0,
  a_wins integer not null default 0,
  b_wins integer not null default 0,
  a_best integer not null default 0,
  b_best integer not null default 0,
  last_at bigint not null,
  primary key (a, b),
  check (a < b)
);

-- A separate layout a player sets for friends to try (optional).
create table if not exists duel_layouts (
  player_id text primary key references players(id) on delete cascade,
  base jsonb not null,
  updated_at bigint not null
);

-- Duel challenge: both attack each other's base within 24 hours.
create table if not exists duel_challenges (
  id text primary key,
  a text not null references players(id) on delete cascade,
  b text not null references players(id) on delete cascade,
  created_at bigint not null,
  ends_at bigint not null,
  a_duel text,
  b_duel text,
  winner text,
  status text not null default 'open'
);
create index if not exists duel_challenges_a_idx on duel_challenges (a, status);
create index if not exists duel_challenges_b_idx on duel_challenges (b, status);
