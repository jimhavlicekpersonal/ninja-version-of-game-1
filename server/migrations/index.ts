/** Every migration file in this folder, bundled into the server build (no files are read at run time). */
import { loadMigrations } from '../migrate';

const files = import.meta.glob<string>('./*.sql', { query: '?raw', import: 'default', eager: true });

export const migrations = loadMigrations(files);
