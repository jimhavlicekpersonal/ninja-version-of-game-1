-- Migration 0036 (2026-11-14 verification fixes, audit A16): a token rotation waits for the new token's
-- first use. POST /v1/sessions/rotate stores the new token's hash here; the old token keeps working until
-- a request arrives with the new one, which swaps them (players.token_hash or player_tokens) and drops the
-- row. A rotation nobody confirms within ten minutes lapses (retention deletes it) and the old token stays,
-- so an answer lost on the network never leaves an account without a key. Deleted with the account.
create table if not exists token_rotations (
  new_hash text primary key,
  old_hash text not null,
  player_id text not null references players(id) on delete cascade,
  created_at bigint not null
);
create index if not exists token_rotations_old_idx on token_rotations (old_hash);
create index if not exists token_rotations_player_idx on token_rotations (player_id);
create index if not exists token_rotations_created_idx on token_rotations (created_at);
