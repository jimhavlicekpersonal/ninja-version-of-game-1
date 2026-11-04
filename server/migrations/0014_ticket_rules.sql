-- Migration 0014 (roadmap step 73): each ticket records the battle rules (SIM_RULES)
-- and balance-data version it was issued under, so the report is re-simulated with
-- the same engine even after an update. Null on older tickets (the live engine).
alter table tickets add column if not exists rules integer;
alter table tickets add column if not exists data_version text;
