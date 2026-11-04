-- Migration 0005 (roadmap step 15): reports, blocks and the moderation queue
-- (Apple 1.2: filter, report, block, timely response).

-- A report of a chat message (with the text as it was, as evidence) or of a
-- player. Staff work through open ones with the admin API.
create table if not exists reports (
  id text primary key,
  at bigint not null,
  reporter_id text not null,
  kind text not null,
  target_id text not null,
  target_name text not null,
  message_id text,
  grove_id text,
  text text,
  reason text not null,
  note text not null default '',
  status text not null default 'open',
  resolved_at bigint,
  resolution text
);
-- One open report per reporter and message (or player).
create unique index if not exists reports_once_idx on reports (reporter_id, target_id, coalesce(message_id, '')) where status = 'open';
create index if not exists reports_open_idx on reports (at) where status = 'open';
create index if not exists reports_message_idx on reports (message_id) where message_id is not null;
create index if not exists reports_target_idx on reports (target_id);

-- Who each player blocked: their messages and troop requests are hidden from the blocker.
create table if not exists blocks (
  player_id text not null,
  blocked_id text not null,
  blocked_name text not null,
  at bigint not null,
  primary key (player_id, blocked_id)
);
create index if not exists blocks_blocked_idx on blocks (blocked_id);

-- A message hidden by moderation (enough reports, or staff), and chat mutes.
alter table grove_chat add column if not exists hidden boolean not null default false;
alter table players add column if not exists muted_until bigint not null default 0;
