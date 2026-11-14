-- Migration 0038 (growth batch 2026-11-14, retention audit G13, G14, growth 1/3).
-- Referrals: one row per recruit (so at most one reward pair per recruit);
-- both sides' rewards are fixed amounts paid once each, the inviter's capped
-- per month in code. Account deletion removes rows either way (growthRepo.ts).
create table if not exists referrals (
  recruit_id text primary key,
  inviter_id text not null,
  at bigint not null,
  qualified_at bigint,
  recruit_rewarded_at bigint,
  inviter_rewarded_at bigint
);
create index if not exists referrals_inviter on referrals (inviter_id, inviter_rewarded_at);

-- Shared replays: a battle the server re-simulated, stored under a short
-- code the sharer chose to make; no player name unless an adult asked for
-- theirs. Deleted by the sharer, with the account, or when expired.
create table if not exists shared_replays (
  id text primary key,
  owner_id text,
  at bigint not null,
  expires_at bigint not null,
  rules integer not null,
  data_version text not null,
  record jsonb not null,
  views integer not null default 0
);
create index if not exists shared_replays_owner on shared_replays (owner_id, at);
create index if not exists shared_replays_expires on shared_replays (expires_at);

-- Play statistics by local day: the UTC offset a statistics id reported
-- (minutes, rounded to 15), one summary row per statistics id rebuilt only
-- when it sent new events, and the rollup's watermark. No player id, as in 0027.
create table if not exists stats_install_tz (
  install text primary key,
  tz integer not null,
  at bigint not null
);
create table if not exists stats_installs (
  install text primary key,
  arm text not null default '',
  first_at bigint not null,
  tz integer,
  first_day_utc integer not null,
  first_day_local integer not null,
  days_utc integer[] not null default '{}',
  days_local integer[] not null default '{}',
  tutorial_done boolean not null default false,
  tutorial_max integer not null default 0,
  first_raid_at bigint,
  first_purchase_at bigint,
  updated_at bigint not null
);
create index if not exists stats_installs_utc on stats_installs (first_day_utc);
create index if not exists stats_installs_local on stats_installs (first_day_local);
create table if not exists stats_watermarks (
  name text primary key,
  value bigint not null
);
