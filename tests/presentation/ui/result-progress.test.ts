/**
 * P6-07 (UIS-01): the result screen's progress lines are facts about the battle just fought: a line only for what
 * moved between the snapshot before it and the one after it was settled.
 */
import { describe, expect, it } from 'vitest';
import { progressLines, snapProgress } from '../../../src/presentation/ui/resultProgress';
import { currentTasks, rollPeriods } from '../../../src/gameplay/sim/pass';
import { data, newGame } from '../../gameplay/sim/helpers';

describe('result progress (P6-07)', () => {
  it('nothing moved: no lines', () => {
    const { state, clock } = newGame();
    rollPeriods(state, clock.now(), data);
    const a = snapProgress(state, data);
    expect(progressLines(a, snapProgress(state, data), state, data)).toEqual([]);
  });

  it('a task whose count went up, honor to the next league and the Scroll tier when they changed', () => {
    const { state, clock } = newGame();
    rollPeriods(state, clock.now(), data);
    const before = snapProgress(state, data);
    const after = structuredClone(state);
    const task = currentTasks(after, 1, data).find((t) => !t.claimed && t.progress < t.target)!;
    expect(task).toBeTruthy();
    (after.stats as unknown as Record<string, number>)[task.stat] = ((after.stats as unknown as Record<string, number>)[task.stat] ?? 0) + 1;
    after.trophies += 30;
    after.pass.points += 10;
    const lines = progressLines(before, snapProgress(after, data), after, data);
    const t = lines.find((l) => l.kind === 'task' && l.id === task.id);
    expect(t).toMatchObject({ from: task.progress, to: task.progress + 1, target: task.target });
    const honor = lines.find((l) => l.kind === 'honor');
    if (honor && honor.kind === 'honor') expect(honor.left).toBeGreaterThan(0);
    expect(lines.some((l) => l.kind === 'scroll')).toBe(true);
    // Only what moved: every task line is a task counting that stat (a daily and a weekly one may share it).
    const sameStat = new Set(currentTasks(after, 1, data).filter((x) => x.stat === task.stat && !x.claimed && x.progress < x.target + 1).map((x) => x.id));
    for (const l of lines) if (l.kind === 'task') expect(sameStat.has(l.id)).toBe(true);
  });
});
