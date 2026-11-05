-- Migration 0026 (state-of-the-game report, section 5 step 2, backend A21):
-- periodic jobs (retention, Google voided purchases, Gang War reminders) ran on
-- every instance, so two instances sent each Gang War push twice. An instance
-- runs a job only while it holds its lease; a lease that lapses (the holder
-- stopped) can be taken by any other instance.
create table if not exists job_leases (
  name text primary key,
  holder text not null,
  until bigint not null
);
