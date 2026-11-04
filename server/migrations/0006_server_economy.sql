-- Migration 0006 (roadmap step 19): server-owned villages (Phase 2).

-- The village the server keeps for a player who moved it there, as a save
-- file (src/gameplay/sim/save.ts). `revision` goes up with every write and a
-- write must name the revision it read (no lost updates); `seq` is the last
-- client command applied; `state_hash` is the economy hash at `at`.
create table if not exists villages (
  player_id text primary key references players(id) on delete cascade,
  file jsonb not null,
  revision bigint not null,
  seq bigint not null default 0,
  at bigint not null,
  state_hash text not null,
  created_at bigint not null,
  updated_at bigint not null
);

-- Every change to a server-held resource, with the balance after it and why
-- (a command, an attack's loot, a raid's losses, a gift). Append-only: rows
-- are never changed (only deleted with the account).
create table if not exists ledger (
  id bigserial primary key,
  player_id text not null,
  at bigint not null,
  resource text not null,
  delta bigint not null,
  balance bigint not null,
  reason text not null,
  ref text
);
create index if not exists ledger_player_idx on ledger (player_id, id);
create or replace function ledger_append_only() returns trigger language plpgsql as $$
begin
  raise exception 'the ledger is append-only';
end
$$;
drop trigger if exists ledger_no_update on ledger;
create trigger ledger_no_update before update on ledger for each row execute function ledger_append_only();

-- Every command a client sent and what the server made of it (kept 30 days).
create table if not exists command_log (
  player_id text not null,
  seq bigint not null,
  at bigint not null,
  client_at bigint not null,
  type text not null,
  command jsonb not null,
  ok boolean not null,
  error text,
  primary key (player_id, seq)
);
create index if not exists command_log_at_idx on command_log (at);
