-- Security fixes 2026-11-24 (SECR-01). Additive.
--
-- How many events each statistics id sent per UTC day of arrival, so POST /v1/stats
-- keeps at most STATS_DAILY_CAP of them (src/backend/net/stats.ts). Only the random
-- statistics id, never a player id or an IP address. Rows are pruned after two days
-- and deleted with the id's events when sharing is turned off.
create table if not exists stats_quota (
  install text not null,
  day int not null,
  n bigint not null,
  primary key (install, day)
);
create index if not exists stats_quota_day on stats_quota (day);
