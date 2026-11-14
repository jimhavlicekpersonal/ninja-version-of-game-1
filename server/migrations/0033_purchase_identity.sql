-- Migration 0033 (backend batch 2026-11-13, audit A5, A24, A29).
-- A5/A24: the device that asked for a purchase (its intent's `device`), so refunds and Sandbox credit
-- are counted per phone, not per free account. Rows from before have none.
alter table purchase_intents add column if not exists device text;
alter table purchases add column if not exists device text;
create index if not exists purchases_device_idx on purchases (device) where device is not null;
-- A24: a whole-server daily cap on Sandbox/test credit reads recent non-production purchases.
create index if not exists purchases_env_at_idx on purchases (at) where environment <> 'Production';
-- A5: players whose server-held villages were played on a device (device_seqs keys).
create index if not exists villages_device_seqs_idx on villages using gin (device_seqs jsonb_ops);
-- A29: App Store Server Notifications seen (notificationUUID), with Apple's signed time, so a repeated
-- delivery is skipped and an older refund-state notification arriving late is not applied over a newer one.
create table if not exists store_notifications (
  id text primary key,
  store text not null,
  ref text,
  type text not null,
  signed_at bigint not null,
  received_at bigint not null
);
create index if not exists store_notifications_ref_idx on store_notifications (store, ref);
create index if not exists store_notifications_received_idx on store_notifications (received_at);
