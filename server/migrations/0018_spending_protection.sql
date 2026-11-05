-- Migration 0018 (worldwide audit GLOBAL-004/005/006): spending protection.
-- Each intent says until when it holds its share of an under-18 player's
-- monthly cap: a cancelled purchase frees it at once, a pending one (Ask to
-- Buy) holds longer. Null (rows written by the previous build during a rolling
-- deploy) means the old rule: 30 minutes from `at`.
alter table purchase_intents add column if not exists hold_until bigint;
create index if not exists purchase_intents_hold_idx on purchase_intents (player_id, hold_until);

-- The age group a player told the server. Once under 18, the game cannot turn
-- it back to adult on its own: staff can, after support checks (admin tool).
create table if not exists player_age (
  player_id text primary key references players(id) on delete cascade,
  under18 boolean not null,
  at bigint not null
);
