/**
 * Device F19: low-memory signals reach the game. Android `onTrimMemory` and the iOS memory warning
 * fire the window event `tkmemorywarning`, which main.ts answers by dropping painted art no scene
 * shows (`trimTextureCaches`). Native code is not compiled in `npm test`: this checks the wiring.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');
const EVENT = 'tkmemorywarning';

describe('low-memory signals (device F19)', () => {
  it('Android forwards onTrimMemory and iOS its memory warning as one window event', () => {
    const android = read('android/app/src/main/java/com/toadstoolkingdoms/app/MainActivity.java');
    expect(android).toMatch(/public void onTrimMemory\(int level\)/);
    expect(android).toContain(`triggerWindowJSEvent("${EVENT}")`);
    const ios = read('ios/App/App/TkViewController.swift');
    expect(ios).toMatch(/override func didReceiveMemoryWarning\(\)/);
    expect(ios).toContain(`triggerWindowJSEvent(eventName: "${EVENT}")`);
  });

  it('the game trims its texture caches on that event and when it goes to the background', () => {
    const main = read('src/main.ts');
    expect(main).toContain(`addEventListener('${EVENT}', lowMemory)`);
    expect(main).toMatch(/const lowMemory = \(\) => \{\s*trimTextureCaches\(game\.textures\);/);
    expect(main).toMatch(/CapApp\.addListener\('pause', goingAway\)/);
    expect(main).toMatch(/addEventListener\('pagehide', goingAway\)/);
  });
});
