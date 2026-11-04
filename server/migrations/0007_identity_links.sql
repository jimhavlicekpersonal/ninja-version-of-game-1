-- Migration 0007 (roadmap step 24): account linking = cloud save.
-- A player can sign in on several devices: each device has its own token
-- (players.token_hash stays the first device's).
create table if not exists player_tokens (
  token_hash text primary key,
  player_id text not null references players(id) on delete cascade,
  created_at bigint not null,
  label text not null default ''
);
create index if not exists player_tokens_player_idx on player_tokens (player_id);

-- Sign-ins linked to a player (Apple, Google, Game Center, Play Games): the
-- provider's stable id for the person, never their email or name.
create table if not exists identity_links (
  provider text not null,
  subject text not null,
  player_id text not null references players(id) on delete cascade,
  linked_at bigint not null,
  primary key (provider, subject)
);
create unique index if not exists identity_links_player_provider_idx on identity_links (player_id, provider);
