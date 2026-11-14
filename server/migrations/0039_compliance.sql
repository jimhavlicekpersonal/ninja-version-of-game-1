-- Migration 0039 (compliance switches 2026-11-14, audit C14 and A5).
-- One row per player who accepted a terms of service version or switched
-- the Apple consumption consent; both default to "nothing recorded / off".
-- Account deletion removes the row (server/complianceRepo.ts).
create table if not exists player_compliance (
  player_id text primary key,
  terms_version text,
  terms_accepted_at bigint,
  consumption_consent boolean not null default false,
  consumption_consent_at bigint
);
