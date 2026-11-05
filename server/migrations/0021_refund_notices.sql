-- Migration 0021 (re-audit): refunds that arrive before the purchase was redeemed.
-- Apple and Google can refund or void a purchase the game never sent to the
-- server (an offline or modified game). The notice is kept here, so the old
-- receipt is refused if it is redeemed later instead of being credited for good.
create table if not exists refund_notices (
  store text not null,
  key text not null,
  at bigint not null,
  why text not null,
  primary key (store, key)
);
