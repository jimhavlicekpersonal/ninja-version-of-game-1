-- Migration 0013 (roadmap step 48): the admin tool.
-- Suspensions: a banned player cannot use the online game, is not matched
-- and is left off the leaderboards until the time passes (0: not banned).
alter table players add column if not exists banned_until bigint not null default 0;
alter table players add column if not exists ban_reason text;
create index if not exists players_name_lower_idx on players (lower(name) text_pattern_ops);

-- Every staff action, for accountability (who, what, to whom, why).
create table if not exists staff_actions (
  id text primary key,
  at bigint not null,
  actor text not null,
  action text not null,
  player_id text,
  detail jsonb not null default '{}'::jsonb
);
create index if not exists staff_actions_player_idx on staff_actions (player_id, at desc);
create index if not exists staff_actions_at_idx on staff_actions (at desc);
