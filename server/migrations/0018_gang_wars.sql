-- Migration 0018 (roadmap steps 65-66): Gang Wars and Gang Rating.
-- A war's rosters, relay state and result live in one document, changed in
-- transactions with the row locked; attacks and claims have their own rows.
alter table squads add column if not exists gang_rating double precision not null default 1500;
alter table squads add column if not exists gang_rd double precision not null default 350;
alter table squads add column if not exists gang_battles integer not null default 0;
alter table squads add column if not exists gang_rated_at bigint not null default 0;

create table if not exists squad_war_queue (
  squad_id text primary key references squads(id) on delete cascade,
  size integer not null,
  rating double precision not null,
  power double precision not null,
  at bigint not null
);

create table if not exists squad_wars (
  id text primary key,
  a_squad text not null,
  b_squad text,
  created_at bigint not null,
  prep_until bigint not null,
  ends_at bigint not null,
  doc jsonb not null
);
create index if not exists squad_wars_a_idx on squad_wars (a_squad, created_at desc);
create index if not exists squad_wars_b_idx on squad_wars (b_squad, created_at desc);

create table if not exists squad_war_attacks (
  id text primary key,
  war_id text not null references squad_wars(id) on delete cascade,
  side text not null,
  attacker_id text not null,
  target integer not null,
  relay boolean not null,
  at bigint not null,
  stars integer not null,
  destruction integer not null,
  record jsonb not null
);
create index if not exists squad_war_attacks_war_idx on squad_war_attacks (war_id, side, target);

create table if not exists squad_war_claims (
  war_id text not null references squad_wars(id) on delete cascade,
  player_id text not null,
  at bigint not null,
  primary key (war_id, player_id)
);
