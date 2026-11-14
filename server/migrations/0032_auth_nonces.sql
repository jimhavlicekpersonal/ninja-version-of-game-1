-- Migration 0032 (backend batch 2026-11-13, audit A15): sign-in nonces the server issued
-- (POST /v1/auth/nonce). A Sign in with Apple or Google ID token sent with one must carry it, and it is
-- used up (deleted) by that sign-in, so a token copied from a log or a proxy cannot sign in again.
-- Expired rows go with retention.
create table if not exists auth_nonces (
  nonce text primary key,
  expires_at bigint not null
);
create index if not exists auth_nonces_expires_idx on auth_nonces (expires_at);
