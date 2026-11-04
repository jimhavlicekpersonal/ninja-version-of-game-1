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

export const migrations = loadMigrations({
  '0001_initial.sql': m0001,
  '0002_ticket_seed.sql': m0002,
  '0003_base_versions.sql': m0003,
});
