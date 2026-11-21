/**
 * Beast Mode 2026-11-21 SEC-03 (earlier R-1): store and public web builds let a player point the game at any
 * server (a free URL field in Settings), a phishing path and a sign-in token relay. Now only dev builds and builds
 * made with VITE_ALLOW_SERVER_CHOICE=1 use a typed address, and no release workflow sets that flag.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { forgetChosenServer, resolveServerUrl, serverChoiceAllowed, type KeyValue } from '../../../src/backend/net/connection';

function kv(init: Record<string, string> = {}): KeyValue & { map: Map<string, string> } {
  const map = new Map(Object.entries(init));
  return { map, get: (k) => map.get(k) ?? null, set: (k, v) => void (v === null ? map.delete(k) : map.set(k, v)) };
}
const read = (f: string) => readFileSync(resolve(__dirname, '../../..', f), 'utf8');

describe('SEC-03: the server address in release builds', () => {
  it('with the flag off, a stored address is ignored and the built-in one is used', () => {
    expect(resolveServerUrl(kv({ 'tk.net.server': 'https://evil.example' }), 'https://api.example', false)).toBe('https://api.example');
  });

  it("'off' still turns online play off", () => {
    expect(resolveServerUrl(kv({ 'tk.net.server': 'off' }), 'https://api.example', false)).toBe('');
  });

  it('only https outside builds that allow a choice', () => {
    expect(resolveServerUrl(kv(), 'http://192.168.1.5:8080', false)).toBe('');
    expect(resolveServerUrl(kv(), 'http://192.168.1.5:8080', true)).toBe('http://192.168.1.5:8080');
  });

  it('dev builds and the explicit test flag keep the choice', () => {
    expect(serverChoiceAllowed({ dev: true, flag: undefined })).toBe(true);
    expect(serverChoiceAllowed({ dev: false, flag: '1' })).toBe(true);
    expect(serverChoiceAllowed({ dev: false, flag: undefined })).toBe(false);
    expect(serverChoiceAllowed({ dev: false, flag: 'true' })).toBe(false);
    expect(resolveServerUrl(kv({ 'tk.net.server': 'http://localhost:8787' }), 'https://api.example', true)).toBe('http://localhost:8787');
  });

  it('a stored custom address is forgotten on start; play offline is kept', () => {
    const a = kv({ 'tk.net.server': 'https://evil.example' });
    forgetChosenServer(a);
    expect(a.map.has('tk.net.server')).toBe(false);
    const b = kv({ 'tk.net.server': 'off' });
    forgetChosenServer(b);
    expect(b.get('tk.net.server')).toBe('off');
  });

  it('main.ts applies the rule, and no release workflow sets the flag', () => {
    const main = read('src/main.ts');
    expect(main).toMatch(/serverChoiceAllowed\(\{ dev: import\.meta\.env\.DEV, flag: import\.meta\.env\.VITE_ALLOW_SERVER_CHOICE as string \| undefined \}\)/);
    expect(main).toMatch(/resolveServerUrl\(browserKeyValue, builtInUrl, allowServerChoice\)/);
    expect(main).toMatch(/new Connection\(\{[^)]*allowServerChoice,/);
    for (const wf of ['deploy.yml', 'android.yml', 'ios-testflight.yml', 'content-preview.yml']) expect(read(`.github/workflows/${wf}`)).not.toMatch(/VITE_ALLOW_SERVER_CHOICE/);
  });
});
