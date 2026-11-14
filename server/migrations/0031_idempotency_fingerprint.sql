-- Migration 0031 (backend batch 2026-11-13, audit A13): an Idempotency-Key answer remembers which request
-- it answered (method, route and a hash of the body). The same key sent to another route or with another
-- body is refused (422) instead of replaying an answer meant for something else. Rows from older servers
-- have no fingerprint and are replayed as before.
alter table idempotency_keys add column if not exists fingerprint text;
