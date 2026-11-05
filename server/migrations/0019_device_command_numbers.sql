-- Migration 0019 (worldwide audit GLOBAL-009): command numbers per device.
-- Several devices can hold one server-kept village; each numbers its own
-- commands, and the server remembers the last number per device here, so two
-- devices' "command 1" are two different commands. Null until a game that
-- sends a device id writes a batch (older games keep the single counter).
alter table villages add column if not exists device_seqs jsonb;
