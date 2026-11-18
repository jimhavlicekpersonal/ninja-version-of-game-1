/**
 * P6-15 (UIS-09): a real HUD on a real GameController in a DOM (happy-dom, a development dependency), with stub
 * dependencies. Tests build `Hud`, `BattleHud` and `Tutorial` through this.
 */
import { Analytics, MemoryEventStore } from '../../../src/backend/analytics/events';
import { Connection } from '../../../src/backend/net/connection';
import { MemorySaveStore } from '../../../src/backend/persist/saveStore';
import { LocalGroveSource } from '../../../src/backend/social/groveSource';
import { GameController } from '../../../src/gameplay/control/controller';
import { defaultData } from '../../../src/gameplay/sim/data';
import type { GameData } from '../../../src/gameplay/sim/types';
import { Bus, type UiEvents } from '../../../src/presentation/ui/bus';
import { Hud } from '../../../src/presentation/ui/hud';

export const T0 = Date.UTC(2026, 10, 18, 9);

export async function startGame(data: GameData = defaultData, now = T0) {
  let t = now;
  const clock = { now: () => t };
  const store = new MemorySaveStore({ data: null });
  const analytics = new Analytics(new MemoryEventStore(), clock, 'test');
  const { controller } = await GameController.start({ clock, store, analytics, data });
  if (controller.state.profile.under18 === null) controller.dispatch({ type: 'setProfile', under18: false });
  return { controller, store, analytics, advance: (ms: number) => (t += ms) };
}

export async function buildHud(opts: { data?: GameData } = {}) {
  document.body.innerHTML = '<div id="hud"></div><div id="battle-hud" hidden></div>';
  const game = await startGame(opts.data);
  const bus = new Bus<UiEvents>();
  const connection = new Connection({ game: game.controller, builtInUrl: '', offline: true, build: 'test', keepVillageOnServer: false });
  const prefs = new Map<string, boolean>();
  const hud = new Hud({
    root: document.getElementById('hud')!,
    controller: game.controller,
    bus,
    analytics: game.analytics,
    store: game.store,
    thumbnail: () => null,
    getFps: () => 60,
    troopThumb: () => null,
    warriorIcon: () => null,
    onAttack: () => undefined,
    onReplay: () => undefined,
    onGroveAttack: () => undefined,
    onTrial: () => undefined,
    onPractice: () => undefined,
    prefs: { get: (k) => prefs.get(k) ?? false, set: (k, v) => void prefs.set(k, v) },
    notifyPrefs: { get: (_id, f) => f, set: () => undefined },
    onRemindersEnabled: async () => undefined,
    reminderNote: '',
    onReplayTutorial: () => undefined,
    debugTime: { offsetMs: () => 0, skip: () => undefined },
    sandbox: true,
    build: { version: 'test', builtAt: 'now' },
    groveSource: new LocalGroveSource(game.controller),
    connection,
  });
  return { ...game, hud, bus, connection };
}
