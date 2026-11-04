-- Migration 0014 (roadmap step 55): league seasons on the server.
-- A season is closed once (the row is the lock): its Honor leaderboard is
-- archived and every player's Honor is softened as the game does
-- (sim/ranks.ts seasonResetTrophies), in one transaction.
create table if not exists seasons (
  season integer primary key,
  closed_at bigint not null,
  players_reset integer not null default 0
);

create table if not exists season_archive (
  season integer not null,
  board text not null,
  rank integer not null,
  player_id text not null,
  name text not null,
  score integer not null,
  keep integer not null,
  primary key (season, board, rank)
);
create index if not exists season_archive_player_idx on season_archive (player_id, season);
