-- Migration 0010 (roadmap steps 35-37): store purchases the server checked.
-- Each store transaction is recorded once (primary key), so a receipt can
-- never be redeemed twice, on any device or account.
create table if not exists purchases (
  store text not null,
  transaction_id text not null,
  player_id text not null,
  product_id text not null,
  cents integer not null,
  at bigint not null,
  environment text not null,
  status text not null default 'credited',
  refunded_at bigint,
  ref text not null,
  held_on_server boolean not null,
  primary key (store, transaction_id)
);
create index if not exists purchases_player_idx on purchases (player_id, at desc);
create index if not exists purchases_ref_idx on purchases (store, ref);

-- Asked before paying (age cap); the store purchase carries the id back.
create table if not exists purchase_intents (
  id text primary key,
  player_id text not null references players(id) on delete cascade,
  product_id text not null,
  cents integer not null,
  at bigint not null,
  used boolean not null default false
);
create index if not exists purchase_intents_player_idx on purchase_intents (player_id, at);
