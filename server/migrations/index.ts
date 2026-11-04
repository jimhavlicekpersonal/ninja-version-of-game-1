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
import m0010 from './0010_purchases.sql?raw';
import m0011 from './0011_push_tokens.sql?raw';
import m0012 from './0012_server_meta.sql?raw';
import m0013 from './0013_staff_tools.sql?raw';
import m0014 from './0014_seasons.sql?raw';
import m0015 from './0015_friends.sql?raw';
import m0016 from './0016_gangs.sql?raw';
import m0017 from './0017_duels.sql?raw';

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
  '0010_purchases.sql': m0010,
  '0011_push_tokens.sql': m0011,
  '0012_server_meta.sql': m0012,
  '0013_staff_tools.sql': m0013,
  '0014_seasons.sql': m0014,
  '0015_friends.sql': m0015,
  '0016_gangs.sql': m0016,
  '0017_duels.sql': m0017,
});
