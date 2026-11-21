/**
 * Beast Mode 2026-11-21 STB-09: the app's pause and resume run the same background work as a hidden page (sound
 * off, base upload, device reminders; then cancel and save on return). main.ts needs a browser and Capacitor, so
 * this reads it; the timers' hidden check is tested in connectionNetwork.test.ts, the audio resume in music.test.ts.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const main = readFileSync('src/main.ts', 'utf8');
const body = (name: string) => new RegExp(`const ${name} = \\(\\) => \\{([\\s\\S]*?)\\n  \\};`).exec(main)?.[1] ?? '';

describe('app lifecycle', () => {
  it('Capacitor pause and resume go through the same functions as visibilitychange', () => {
    expect(main).toContain("CapApp.addListener('pause', wentToBackground)");
    expect(main).toContain("CapApp.addListener('resume', cameBack)");
    expect(main).toMatch(/visibilityState === 'hidden' \? wentToBackground\(\) : cameBack\(\)/);
  });

  it('going to the background suspends sound, uploads the base and plans reminders (opt-in); coming back undoes it', () => {
    const away = body('wentToBackground');
    expect(away).toContain('goingAway()');
    expect(away).toContain('sound.suspend(true)');
    expect(away).toContain('connection.uploadBase()');
    expect(away).toMatch(/if \(prefs\.get\('reminders'\)\)[\s\S]*reminders\.schedule/);
    const back = body('cameBack');
    expect(back).toContain('sound.suspend(false)');
    expect(back).toContain('reminders.cancelAll()');
    expect(back).toContain('controller.save()');
    // GLOBAL-010: the hide/pagehide/pause flush of waiting actions stays.
    expect(main).toContain("window.addEventListener('pagehide', goingAway)");
    expect(body('goingAway')).toContain('connection.flush()');
  });
});
