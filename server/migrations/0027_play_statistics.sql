-- Migration 0027 (state-of-the-game report, section 5 step 5, growth 1):
-- play statistics an adult player chose to share. Rows carry a random
-- statistics id (`install`), never a player id, a name or an IP address;
-- turning sharing off deletes the id's rows. Kept 400 days (retention).
create table if not exists stats_events (
  install text not null,
  day integer not null,
  name text not null,
  at bigint not null,
  props jsonb not null default '{}',
  build text not null default '',
  arm text not null default '',
  received_at bigint not null
);
create index if not exists stats_events_install_day on stats_events (install, day);
create index if not exists stats_events_day on stats_events (day);
create index if not exists stats_events_received on stats_events (received_at);

-- The daily table (rebuilt hourly for the last 40 install days): per install
-- day and experiment arm, installs, day-1/7/30 returns and the funnel.
create table if not exists stats_daily (
  day integer not null,
  arm text not null,
  installs integer not null,
  d1 integer not null,
  d7 integer not null,
  d30 integer not null,
  tutorial_done integer not null,
  raided7 integer not null,
  payers7 integer not null,
  computed_at bigint not null,
  primary key (day, arm)
);
