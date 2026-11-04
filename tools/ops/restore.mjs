// Restore a backup made by tools/ops/backup.mjs into an EMPTY database (roadmap step 44).
//   TARGET_DATABASE_URL=… BACKUP_KEY=… node tools/ops/restore.mjs <file.dump.enc>
// Never point TARGET_DATABASE_URL at the live database: restore into a new one,
// check it (tools/ops/restore-check.mjs), then switch the server's DATABASE_URL.
import { execFileSync } from 'node:child_process';
import { createDecipheriv } from 'node:crypto';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';

const file = process.argv[2];
const url = process.env.TARGET_DATABASE_URL;
// While BACKUP_KEY is rotated (step 58), BACKUP_KEY_OLD reads backups made before.
const keys = [process.env.BACKUP_KEY, process.env.BACKUP_KEY_OLD].filter(Boolean).map((k) => Buffer.from(k, 'base64'));
const key = keys[0] ?? Buffer.alloc(0);
if (!file || !url || key.length !== 32) {
  console.error('Usage: TARGET_DATABASE_URL=… BACKUP_KEY=… node tools/ops/restore.mjs <file.dump.enc>');
  process.exit(1);
}
const data = readFileSync(file);
if (data.subarray(0, 4).toString() !== 'TKB1') {
  console.error('Not a Kagemura backup file.');
  process.exit(1);
}
let body = null;
for (const k of keys) {
  try {
    const decipher = createDecipheriv('aes-256-gcm', k, data.subarray(4, 16));
    decipher.setAuthTag(data.subarray(16, 32));
    body = Buffer.concat([decipher.update(data.subarray(32)), decipher.final()]);
    break;
  } catch {
    // Not this key: try the previous one.
  }
}
if (!body) {
  console.error('Neither BACKUP_KEY nor BACKUP_KEY_OLD opens this backup.');
  process.exit(1);
}
const plain = file.replace(/\.enc$/, '') + '.restore';
writeFileSync(plain, body);
try {
  execFileSync('pg_restore', ['--no-owner', '--no-privileges', '--exit-on-error', `--dbname=${url}`, plain], { stdio: 'inherit' });
} finally {
  rmSync(plain);
}
console.log('Restored. Now run tools/ops/restore-check.mjs against it.');
