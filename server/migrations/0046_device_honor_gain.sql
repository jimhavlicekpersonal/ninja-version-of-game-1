-- Beast Mode 2026-11-21 SEC-01 (interim): honor a player gained from raids on one UTC day, for the daily ceiling on
-- villages kept on the device (DEVICE_HONOR_PER_DAY). -1: nothing recorded yet.
alter table players add column if not exists honor_gain_day integer not null default -1;
alter table players add column if not exists honor_gained integer not null default 0;
