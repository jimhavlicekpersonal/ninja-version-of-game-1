-- Migration 0020 (worldwide audit GLOBAL-002): what a village move held back.
-- A village moved from a device cannot prove where its Jade and its premium
-- Season Scroll came from. Jade beyond what the player could have earned
-- (plus purchases this server checked), a premium Scroll with no checked
-- purchase, and purchase records the server never saw are held here rather
-- than entering the shared economy. Nothing is deleted: the device keeps its
-- old village as a backup, and staff can give back what support confirms
-- (admin tool, give/take), marking the hold resolved.
create table if not exists import_holds (
  id text primary key,
  player_id text not null references players(id) on delete cascade,
  at bigint not null,
  jade integer not null,
  premium boolean not null,
  purchases jsonb not null,
  status text not null default 'held'
);
create index if not exists import_holds_player_idx on import_holds (player_id, at desc);
