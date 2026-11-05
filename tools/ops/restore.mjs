// Restore a backup made by tools/ops/backup.mjs into an EMPTY database (roadmap step 44).
//   TARGET_DATABASE_URL=… BACKUP_KEY=… node tools/ops/restore.mjs <file.dump.enc>
// Never point TARGET_DATABASE_URL at the live database: restore into a new one,
// check it (tools/ops/restore-check.mjs), then switch the server's DATABASE_URL.
import { execFileSync } from 'node:child_process';
import { createDecipheriv } from 'node:crypto';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';

const file = process.argv[2];
const url = process.env.TARGET_DATABASE_URL;
const key = Buffer.from(process.env.BACKUP_KEY ?? '', 'base64');
if (!file || !url || key.length !== 32) {
  console.error('Usage: TARGET_DATABASE_URL=… BACKUP_KEY=… node tools/ops/restore.mjs <file.dump.enc>');
  process.exit(1);
}
const data = readFileSync(file);
if (data.subarray(0, 4).toString() !== 'TKB1') {
  console.error('Not a Kagemura backup file.');
  process.exit(1);
}
const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(4, 16));
decipher.setAuthTag(data.subarray(16, 32));
const plain = file.replace(/\.enc$/, '') + '.restore';
writeFileSync(plain, Buffer.concat([decipher.update(data.subarray(32)), decipher.final()]));
try {
  execFileSync('pg_restore', ['--no-owner', '--no-privileges', '--exit-on-error', `--dbname=${url}`, plain], { stdio: 'inherit' });
} finally {
  rmSync(plain);
}
console.log('Restored. Now run tools/ops/restore-check.mjs against it.');
