-- Migration 0008 (roadmap step 26, protocol 7): a write sent again with the
-- same Idempotency-Key (by the same caller) gets the first answer back.
-- Kept a day (retention).
create table if not exists idempotency_keys (
  scope text not null,
  key text not null,
  status integer not null,
  body jsonb,
  created_at bigint not null,
  primary key (scope, key)
);
create index if not exists idempotency_keys_created_idx on idempotency_keys (created_at);
