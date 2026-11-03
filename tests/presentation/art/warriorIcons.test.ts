/** Every roster warrior has its own icon, and no two icons draw the same picture. */
import { describe, expect, it } from 'vitest';
import roster from '../../../src/gameplay/data/roster.json';
import { paintWarriorIcon, warriorIconDefs } from '../../../src/presentation/art/warriorIcons';

/** A fake 2D context that records every drawing call, so two icons can be compared without a browser. */
function recorder(): { ctx: CanvasRenderingContext2D; log: string[] } {
  const log: string[] = [];
  const gradient = { addColorStop: (o: number, c: string) => log.push(`stop ${o} ${c}`) };
  const target: Record<string, unknown> = {};
  const ctx = new Proxy(target, {
    get(_t, prop: string) {
      if (prop in target) return target[prop];
      if (prop === 'createRadialGradient' || prop === 'createLinearGradient') return (...a: number[]) => (log.push(`${prop} ${a.map((n) => n.toFixed(2)).join(',')}`), gradient);
      return (...a: unknown[]) => log.push(`${prop} ${a.map((n) => (typeof n === 'number' ? n.toFixed(2) : String(n))).join(',')}`);
    },
    set(_t, prop: string, v) {
      target[prop] = v;
      log.push(`${prop}=${typeof v === 'object' ? 'gradient' : String(v)}`);
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, log };
}

describe('warrior icons', () => {
  it('every roster warrior has an icon with matching role and tier, and nothing extra', () => {
    expect(Object.keys(warriorIconDefs).sort()).toEqual(roster.warriors.map((w) => w.id).sort());
    for (const w of roster.warriors) {
      const d = warriorIconDefs[w.id];
      expect(d.role, w.id).toBe(w.role);
      expect(d.tier, w.id).toBe(w.tier);
      expect(Boolean(d.ridiculous), w.id).toBe(Boolean((w as { ridiculous?: boolean }).ridiculous));
    }
  });

  it('signature props are all different', () => {
    const props = Object.values(warriorIconDefs).map((d) => d.prop);
    expect(new Set(props).size).toBe(props.length);
  });

  it('all 50 icons draw distinct pictures', () => {
    const seen = new Map<string, string>();
    for (const id of Object.keys(warriorIconDefs)) {
      const { ctx, log } = recorder();
      paintWarriorIcon(ctx, id);
      expect(log.length, id).toBeGreaterThan(40);
      const sig = log.join('\n');
      expect(seen.get(sig), `${id} looks the same as ${seen.get(sig)}`).toBeUndefined();
      seen.set(sig, id);
    }
  });
});
