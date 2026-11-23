-- Beast Mode 2026-11-23 SEC-01: the last refused village move (the import's reason), for staff (/admin/v1/players/:id).
alter table players add column if not exists move_refused_at bigint not null default 0;
alter table players add column if not exists move_refused text;
