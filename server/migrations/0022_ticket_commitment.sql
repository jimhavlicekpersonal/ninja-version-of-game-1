-- Migration 0022 (re-audit): a battle commits when it starts.
-- started_at: when the game said the battle began (the player tapped Attack).
-- failures: reports refused after a re-simulation (the ticket is burned after a few).
alter table tickets add column if not exists started_at bigint;
alter table tickets add column if not exists failures integer not null default 0;
create index if not exists tickets_open_by_attacker_idx on tickets (attacker_id, kind) where not used;
create index if not exists tickets_open_by_expiry_idx on tickets (kind, expires_at) where not used;
