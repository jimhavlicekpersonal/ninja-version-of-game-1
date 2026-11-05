-- Migration 0025 (re-audit: accounts, minors, moderation notices, sessions).

-- The age band a player stated (src/gameplay/sim/age.ts: under13, 13to17, adult).
-- Null on rows from before bands (only under18 was asked). Like under18, it only
-- gets stricter; staff clear the whole row after a support check.
alter table player_age add column if not exists band text;

-- Device tokens: which sign-in made them (unlinking that provider signs those
-- devices out) and when each was last used (unused ones are pruned). The first
-- device's token stays in players.token_hash.
alter table player_tokens add column if not exists provider text;
alter table player_tokens add column if not exists last_used_at bigint;
create index if not exists player_tokens_provider_idx on player_tokens (player_id, provider);

-- Sign in with Apple: the refresh token from exchanging the authorization code
-- at link time, and the client id it was issued to, so it can be revoked when
-- the account is deleted or Apple is unlinked (App Review 5.1.1(v)).
alter table identity_links add column if not exists refresh_token text;
alter table identity_links add column if not exists client_id text;

-- One-time codes for the web deletion page: only a hash, with an expiry.
create table if not exists deletion_codes (
  player_id text primary key references players(id) on delete cascade,
  code_hash text not null,
  created_at bigint not null,
  expires_at bigint not null
);
-- A web request that carried a valid code (the player's own); staff carry out only these
-- (others need an explicit staff override note).
alter table deletion_requests add column if not exists verified boolean not null default false;

-- Notices to a player (EU DSA art. 16(5)/17): the outcome of their reports, and
-- moderation decisions about them with the reason and how to appeal.
create table if not exists player_notices (
  id text primary key,
  player_id text not null references players(id) on delete cascade,
  at bigint not null,
  kind text not null,
  text text not null,
  read boolean not null default false
);
create index if not exists player_notices_player_idx on player_notices (player_id, at);

-- Why a player's chat is paused (shown with the mute and the appeal route).
alter table players add column if not exists mute_reason text;
