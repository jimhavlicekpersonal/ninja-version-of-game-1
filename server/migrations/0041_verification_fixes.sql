-- Migration 0041 (third verification fixes 2026-11-14). All additive.
--
-- Inviter rewards as an anonymised ledger (one row per inviter reward paid:
-- the inviter and the time, nothing about the recruit). The monthly cap
-- counts these rows, so deleting a recruit's account (which deletes the
-- referral row and everything else of theirs) no longer frees a slot.
-- Deleted with the inviter's own account.
create table if not exists referral_rewards (
  inviter_id text not null,
  at bigint not null
);
create index if not exists referral_rewards_inviter on referral_rewards (inviter_id, at);
insert into referral_rewards (inviter_id, at)
  select inviter_id, inviter_rewarded_at from referrals where inviter_rewarded_at is not null;

-- A stable id per game installation (generated once on the device, never the
-- statistics id), as the game sends it with a friend code, a reward claim or
-- a purchase intent: "no shared device" checks use it. Deleted with the account.
create table if not exists player_installs (
  player_id text not null,
  install text not null,
  at bigint not null,
  primary key (player_id, install)
);
create index if not exists player_installs_install on player_installs (install);

-- Shared replays made, one row per creation: the daily limit counts these, so
-- deleting a share does not give it back. Deleted with the sharer's account;
-- pruned after two days by retention.
create table if not exists shared_replay_log (
  owner_id text not null,
  at bigint not null
);
create index if not exists shared_replay_log_owner on shared_replay_log (owner_id, at);
insert into shared_replay_log (owner_id, at) select owner_id, at from shared_replays where owner_id is not null;

-- The real defender of a shared replay (when the server found the raid), so a
-- defender who opts out, becomes a minor or deletes their account takes their
-- base out of every shared replay. Never shown.
alter table shared_replays add column if not exists defender_id text;
create index if not exists shared_replays_defender on shared_replays (defender_id) where defender_id is not null;

-- "Don't allow my base in shared replays" (default: allowed for adults; never for minors, in code).
alter table player_compliance add column if not exists no_base_in_replays boolean not null default false;
