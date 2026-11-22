/** Beast Mode OPS-06 / STB-06: the controller logs Shadow Trials, a scouted base left unplayed, and lost graphics. */
import { describe, expect, it } from 'vitest';
import { Analytics, MemoryEventStore } from '../../../src/backend/analytics/events';
import { cleanStatsEvent } from '../../../src/backend/net/stats';
import { GameController } from '../../../src/gameplay/control/controller';
import { MemorySaveStore } from '../../../src/backend/persist/saveStore';
import { FakeClock } from '../../../src/gameplay/sim/clock';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { trialBase, trialVariant } from '../../../src/gameplay/sim/trials';
import { trialBattleSeed } from '../../../src/gameplay/sim/village';
import { pointDeploys } from '../sim/helpers';

async function start() {
  const clock = new FakeClock();
  const events = new MemoryEventStore();
  const { controller } = await GameController.start({ clock, store: new MemorySaveStore(), data, analytics: new Analytics(events, clock, 'test') });
  await new Promise((r) => setTimeout(r, 0));
  return { controller, events };
}

describe('statistics events from the controller', () => {
  it('a Shadow Trial attempt logs trial_end with its tier, result and end reason', async () => {
    const { controller: c, events } = await start();
    c.state.army = { hedgehog_roller: 10 };
    const tier = 1;
    const base = trialBase(tier, data, trialVariant(c.state.trials, tier));
    const setup = { seed: trialBattleSeed(c.state.seed, c.state.nextSeed, tier), base, army: { hedgehog_roller: 10 }, infiltration: true };
    expect(c.finishTrial(tier, setup, pointDeploys(setup, 'hedgehog_roller', 10), undefined)).not.toBeNull();
    await new Promise((r) => setTimeout(r, 0));
    const e = events.events.find((x) => x.name === 'trial_end');
    expect(e?.props).toMatchObject({ tier: 1 });
    expect(typeof e?.props.cleared).toBe('boolean');
    expect(typeof e?.props.endReason).toBe('string');
  });

  it('noteScoutLeft and noteGraphicsLost log shareable events', async () => {
    const { controller: c, events } = await start();
    c.noteScoutLeft(2);
    c.noteGraphicsLost(true);
    await new Promise((r) => setTimeout(r, 0));
    const left = events.events.find((x) => x.name === 'scout_leave')!;
    expect(cleanStatsEvent({ name: left.name, at: left.at, props: left.props as never })!.props).toEqual({ keep: 1, nexts: 2 });
    const lost = events.events.find((x) => x.name === 'webgl_lost')!;
    expect(cleanStatsEvent({ name: lost.name, at: lost.at, props: lost.props as never })!.props).toEqual({ stuck: true });
  });
});
