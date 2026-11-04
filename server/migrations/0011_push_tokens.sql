-- Migration 0011 (roadmap step 40): devices that receive server push.
-- Each device keeps its own choices (types switched on, time zone) and a
-- count of pushes sent on its local day (maxPerDay).
create table if not exists push_tokens (
  token text primary key,
  player_id text not null references players(id) on delete cascade,
  platform text not null,
  types text[] not null default '{}',
  tz_offset_minutes integer not null default 0,
  updated_at bigint not null,
  day integer not null default 0,
  sent integer not null default 0
);
create index if not exists push_tokens_player_idx on push_tokens (player_id);
