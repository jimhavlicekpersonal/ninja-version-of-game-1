// Check the server's public address (roadmap step 45):
//   node tools/ops/check-domain.mjs https://api.example.com
// - DNS has an IPv4 (A) and an IPv6 (AAAA) address;
// - /v1/hello answers over HTTPS on each (App Review tests on IPv6-only networks);
// - the certificate is valid for the name for at least 21 more days;
// - plain HTTP does not serve the API (it redirects or refuses).
import { promises as dns } from 'node:dns';
import https from 'node:https';
import http from 'node:http';

const target = new URL(process.argv[2] ?? '');
if (target.protocol !== 'https:') {
  console.error('Usage: node tools/ops/check-domain.mjs https://<server>');
  process.exit(1);
}
const problems = [];
const get = (mod, opts) =>
  new Promise((resolve, reject) => {
    const req = mod.get({ host: target.hostname, path: '/v1/hello', timeout: 10_000, ...opts }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers, cert: res.socket.getPeerCertificate?.() }));
    });
    req.on('timeout', () => req.destroy(new Error('timed out')));
    req.on('error', reject);
  });
for (const [family, rr] of [[4, 'A'], [6, 'AAAA']]) {
  const addrs = await dns.resolve(target.hostname, rr).catch(() => []);
  if (!addrs.length) {
    problems.push(`no ${rr} record (IPv${family})`);
    continue;
  }
  try {
    const r = await get(https, { family, servername: target.hostname, port: target.port || 443 });
    const hello = JSON.parse(r.body);
    console.log(`IPv${family} ${addrs[0]}: ${r.status} ${hello.name} protocol ${hello.protocol}${hello.environment ? ` (${hello.environment})` : ''}`);
    const days = (Date.parse(r.cert.valid_to) - Date.now()) / 86_400_000;
    if (days < 21) problems.push(`the certificate expires in ${Math.floor(days)} days`);
    if (!r.headers['strict-transport-security']) problems.push('no Strict-Transport-Security header (set TRUST_PROXY so the server sees HTTPS)');
  } catch (e) {
    problems.push(`HTTPS over IPv${family} failed: ${e.message}`);
  }
}
try {
  const plain = await get(http, { port: 80 });
  if (plain.status === 200) problems.push('plain HTTP serves the API: redirect it to HTTPS at the host');
} catch {
  // Refused: fine.
}
if (problems.length) {
  console.error(`Problems:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log('The address is ready: HTTPS on IPv4 and IPv6.');
