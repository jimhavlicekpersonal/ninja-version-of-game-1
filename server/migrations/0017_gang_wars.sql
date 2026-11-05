-- Migration 0017 (roadmap steps 65-66): Gang Wars.
alter table tickets add column if not exists war_id text;
alter table tickets add column if not exists relay boolean;
alter table tickets add column if not exists start_damage jsonb;

create table if not exists squad_wars (
  id text primary key,
  created_at bigint not null,
  ends_at bigint not null,
  squad_a text,
  squad_b text,
  rated boolean not null default false,
  record jsonb not null
);
create index if not exists squad_wars_a_idx on squad_wars (squad_a, created_at);
create index if not exists squad_wars_b_idx on squad_wars (squad_b, created_at);

create table if not exists squad_war_attacks (
  id text primary key,
  war_id text not null,
  side text not null,
  attacker_id text not null,
  target integer not null,
  relay boolean not null,
  stars integer not null,
  destruction real not null,
  at bigint not null
);
create index if not exists squad_war_attacks_war_idx on squad_war_attacks (war_id);

create table if not exists squad_war_relays (
  war_id text not null,
  side text not null,
  target integer not null,
  damage jsonb not null default '{}'::jsonb,
  stars integer not null default 0,
  destruction real not null default 0,
  strikes integer not null default 0,
  last_by text,
  holder text,
  hold_until bigint not null default 0,
  primary key (war_id, side, target)
);

create table if not exists squad_war_queue (
  squad_id text primary key,
  size integer not null,
  queued_at bigint not null,
  record jsonb not null
);
create index if not exists squad_war_queue_size_idx on squad_war_queue (size, queued_at);

create table if not exists squad_war_claims (
  war_id text not null,
  player_id text not null,
  outcome text not null,
  at bigint not null,
  primary key (war_id, player_id)
);
