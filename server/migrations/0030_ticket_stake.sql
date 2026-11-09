-- Migration 0030 (balance audit 2026-11-08, declared stakes): the star count an attacker
-- declared when the raid started (POST /v1/attacks/start). It is fixed before the battle
-- seed is sent, so a stake can never be chosen after seeing how the battle plays out.
alter table tickets add column if not exists stake smallint;
