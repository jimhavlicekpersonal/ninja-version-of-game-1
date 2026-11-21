-- Beast Mode 2026-11-21 GT-13: whether a war attack counts toward the war chest (a star, or at least
-- chestMinDeployShare of the Keep's camp housing deployed). Rows from before count, as they did.
alter table raid_attacks add column if not exists counts boolean not null default true;
alter table squad_war_attacks add column if not exists counts boolean not null default true;
