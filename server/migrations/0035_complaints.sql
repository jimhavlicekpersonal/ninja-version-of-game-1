-- Migration 0035 (backend batch 2026-11-13): complaints about illegal or harmful content (EU Digital
-- Services Act art. 16, UK Online Safety Act), from POST /v1/complaints and the page at GET /complaints.
-- No foreign key to players: a complaint may name nobody, and the complainant's id goes when they delete
-- their account (the complaint stays: others may be named in it). Handled ones go a year later.
create table if not exists complaints (
  id text primary key,
  at bigint not null,
  subject text not null,
  reason text not null,
  contact text,
  player_id text,
  status text not null default 'open',
  resolved_at bigint,
  resolution text
);
create index if not exists complaints_status_idx on complaints (status, at);
create index if not exists complaints_player_idx on complaints (player_id) where player_id is not null;
