-- Migration 0009 (roadmap steps 28, 30, 31): hidden matchmaking ratings and
-- the daily cap on a defender's honor loss.
alter table players add column if not exists attack_rating real not null default 1500;
alter table players add column if not exists attack_rd real not null default 350;
alter table players add column if not exists attack_battles integer not null default 0;
alter table players add column if not exists attack_rated_at bigint not null default 0;
alter table players add column if not exists base_rating real not null default 1500;
alter table players add column if not exists base_rd real not null default 350;
alter table players add column if not exists base_battles integer not null default 0;
alter table players add column if not exists base_rated_at bigint not null default 0;
-- Honor lost as a defender on one UTC day (day number since the epoch).
alter table players add column if not exists honor_loss_day integer not null default -1;
alter table players add column if not exists honor_lost integer not null default 0;
create index if not exists players_power_idx on players (attack_rating desc) where base is not null;
