-- Migration 0037 (2026-11-14, error codes): a notice also kept as message codes. `parts` is a JSON list of
-- { key, params } (MessageRef in src/backend/net/protocol.ts); the game shows it in the player's language,
-- and `text` stays the English for older games. Notices written before this have no parts. Additive and
-- nullable, so the previous server build keeps working during a rolling deploy.
alter table player_notices add column if not exists parts jsonb;
