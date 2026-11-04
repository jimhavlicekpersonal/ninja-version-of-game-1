/**
 * Every migration, bundled into the server build (no files are read at run
 * time). Add each new file here: an explicit list, because a glob import would
 * be cached by Vitest's module cache and miss a new file. A test checks that
 * every .sql file in this folder is listed.
 */
import { loadMigrations } from '../migrate';
import m0001 from './0001_initial.sql?raw';
import m0002 from './0002_ticket_seed.sql?raw';
import m0003 from './0003_base_versions.sql?raw';
import m0004 from './0004_account_deletion.sql?raw';
import m0005 from './0005_moderation.sql?raw';
import m0006 from './0006_server_economy.sql?raw';
import m0007 from './0007_identity_links.sql?raw';
import m0008 from './0008_idempotency.sql?raw';
import m0009 from './0009_ratings.sql?raw';

export const migrations = loadMigrations({
  '0001_initial.sql': m0001,
  '0002_ticket_seed.sql': m0002,
  '0003_base_versions.sql': m0003,
  '0004_account_deletion.sql': m0004,
  '0005_moderation.sql': m0005,
  '0006_server_economy.sql': m0006,
  '0007_identity_links.sql': m0007,
  '0008_idempotency.sql': m0008,
  '0009_ratings.sql': m0009,
});
