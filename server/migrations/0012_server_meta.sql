-- Migration 0012 (roadmap step 42): which deployment owns this database.
-- The first server to start writes its DEPLOY_ENV; a server of another kind
-- refuses to start on it (staging can never write to production's data).
create table if not exists server_meta (
  key text primary key,
  value text not null
);
