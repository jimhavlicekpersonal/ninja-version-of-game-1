-- Migration 0039 (2026-11-14 code-debt batch, backend audit A17): parts of a server-held village kept in
-- their own rows, so a command batch rewrites only what it changed. `villages.file` then holds the rest
-- of the save file and lists its parts in `$parts`; each row here holds some top-level keys of
-- `file.village` (`layout`: the buildings; `progress`: tasks, daily chest, pass, trials, research and the
-- like) with the content hash of `data`, and a write whose hash is unchanged writes no new row version.
-- Only a server started with VILLAGE_PARTS=1 writes parts (every build from this one reads both forms),
-- so the previous build keeps working during the rolling deploy that brings this migration. Deleted with
-- the village (and so with the account).
create table if not exists village_parts (
  player_id text not null references villages(player_id) on delete cascade,
  part text not null,
  hash text not null,
  data jsonb not null,
  primary key (player_id, part)
);
