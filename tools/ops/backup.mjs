// Database backup (roadmap step 44): pg_dump (custom format, compressed),
// encrypted with AES-256-GCM so the file can sit in any storage.
//   DATABASE_URL=… BACKUP_KEY=<base64 of 32 bytes> node tools/ops/backup.mjs [out-dir]
// Writes kagemura-<UTC time>.dump.enc and prints its path. Make a key once with:
//   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
// Keep the key somewhere other than the backups (a password manager).
import { execFileSync } from 'node:child_process';
import { createCipheriv, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const url = process.env.DATABASE_URL;
const key = Buffer.from(process.env.BACKUP_KEY ?? '', 'base64');
if (!url || key.length !== 32) {
  console.error('Set DATABASE_URL and BACKUP_KEY (base64 of 32 random bytes).');
  process.exit(1);
}
const out = process.argv[2] ?? 'backups';
mkdirSync(out, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, 'Z');
const plain = join(out, `kagemura-${stamp}.dump`);
execFileSync('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', `--file=${plain}`, url], { stdio: 'inherit' });
const iv = randomBytes(12);
const cipher = createCipheriv('aes-256-gcm', key, iv);
const body = Buffer.concat([cipher.update(readFileSync(plain)), cipher.final()]);
// File: "TKB1" | iv (12) | tag (16) | ciphertext
writeFileSync(`${plain}.enc`, Buffer.concat([Buffer.from('TKB1'), iv, cipher.getAuthTag(), body]));
rmSync(plain);
console.log(`${plain}.enc`);
