-- Migration 0025 (ledger audit A1/E15): the scout a raid ticket answered.
-- For a village the server keeps, a new opponent needs a new scout in that
-- village (the first look after a raid is free, "Next" costs coins, replayed
-- by the server). Asking again with the same scout gets the same ticket back,
-- so a modified game cannot reroll opponents for free. Null on other tickets.
alter table tickets add column if not exists scout_seed bigint;
