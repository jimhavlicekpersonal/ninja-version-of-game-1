-- migrate: no-transaction
-- Migration 0034 (backend batch 2026-11-13, audit A19 and A22): matchmaking walks the honor order up and
-- down from a pivot instead of sorting the whole window by random(). The index is built concurrently
-- (no write lock on players during a release), so this file runs outside a transaction (server/migrate.ts).
create index concurrently if not exists players_match_trophies_idx on players (trophies) where base is not null and banned_until = 0;
