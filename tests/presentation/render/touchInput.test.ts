import { describe, expect, it, vi } from 'vitest';

// Phaser needs a browser; releaseStaleTouches only touches the manager it is given.
vi.mock('phaser', () => ({ default: {} }));
const { releaseStaleTouches } = await import('../../../src/presentation/render/touchInput');

type FakePointer = { active: boolean; isDown: boolean; identifier: number; event: unknown };

function fakeManager(pointers: FakePointer[]) {
  const cancelled: number[] = [];
  return {
    cancelled,
    manager: {
      canvas: {},
      // Index 0 is the mouse pointer: never a touch.
      pointers: [{ active: true, isDown: true, identifier: 0, event: null }, ...pointers],
      onTouchCancel(ev: { changedTouches: { identifier: number }[] }) {
        for (const t of ev.changedTouches) {
          cancelled.push(t.identifier);
          const p = pointers.find((q) => q.identifier === t.identifier)!;
          p.active = false;
          p.isDown = false;
        }
      },
    },
  };
}

const touchEvent = (ids: number[]) => ({ touches: ids.map((identifier) => ({ identifier })), timeStamp: 1 }) as unknown as TouchEvent;

describe('stale touch pointers', () => {
  it('a touch whose end never arrived (its HUD element was removed) is released before the next touch', () => {
    // Finger 4 lifted off a HUD button that was rebuilt mid-tap; finger 9 is the new touch.
    const stuck: FakePointer = { active: true, isDown: true, identifier: 4, event: { changedTouches: [{ identifier: 4, pageX: 30, pageY: 40 }] } };
    const { manager, cancelled } = fakeManager([stuck, { active: false, isDown: false, identifier: 0, event: null }]);
    expect(releaseStaleTouches(manager as never, touchEvent([9]))).toBe(1);
    expect(cancelled).toEqual([4]);
    // A one-finger drag is a drag again, not a pinch against the ghost finger.
    expect(manager.pointers.slice(1).filter((p) => p.isDown)).toHaveLength(0);
    expect(manager.pointers[0].isDown).toBe(true);
  });

  it('a finger still on the screen is kept, so pinch zoom works', () => {
    const held: FakePointer = { active: true, isDown: true, identifier: 2, event: null };
    const { manager, cancelled } = fakeManager([held]);
    expect(releaseStaleTouches(manager as never, touchEvent([2, 3]))).toBe(0);
    expect(cancelled).toEqual([]);
    expect(held.isDown).toBe(true);
  });
});
