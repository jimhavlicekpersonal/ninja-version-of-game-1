import Phaser from 'phaser';
import './ui/styles.css';
import { Analytics, IdbEventStore, MemoryEventStore, type EventStore } from './analytics/events';
import { GameController } from './game/controller';
import { openGameDb } from './persist/idb';
import { IdbSaveStore, MemorySaveStore, type SaveStore } from './persist/saveStore';
import { registerServiceWorker } from './pwa/register';
import { Keys } from './render/assets';
import { VillageScene, type VillageSceneInit } from './render/VillageScene';
import { OffsetClock, SystemClock } from './sim/clock';
import { defaultData } from './sim/data';
import { Bus, type UiEvents } from './ui/bus';
import { Hud } from './ui/hud';

declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;

const DEBUG_OFFSET_KEY = 'tk.debugTimeOffsetMs';

/** The testing tool's time skip, kept in localStorage so a reload keeps it. */
function createDebugTime() {
  let offset = 0;
  try {
    offset = Number(localStorage.getItem(DEBUG_OFFSET_KEY)) || 0;
  } catch {
    offset = 0;
  }
  return {
    offsetMs: () => offset,
    skip(ms: number) {
      offset += ms;
      try {
        localStorage.setItem(DEBUG_OFFSET_KEY, String(offset));
      } catch {
        /* storage blocked: the skip lasts until reload */
      }
    },
  };
}

function platformName(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  if (/Windows/.test(ua)) return 'windows';
  if (/Mac/.test(ua)) return 'mac';
  return 'other';
}

async function openStorage(): Promise<{ store: SaveStore; events: EventStore }> {
  try {
    const db = await openGameDb();
    const events = new IdbEventStore(db);
    void events.prune().catch(() => undefined);
    // Ask the browser not to evict our save (granted automatically for installed apps on most browsers).
    void navigator.storage?.persist?.().catch(() => undefined);
    return { store: new IdbSaveStore(db), events };
  } catch (e) {
    console.warn('Falling back to in-memory storage', e);
    return { store: new MemorySaveStore(), events: new MemoryEventStore() };
  }
}

async function boot(): Promise<void> {
  const debugTime = createDebugTime();
  const clock = new OffsetClock(new SystemClock(), debugTime.offsetMs);
  const { store, events } = await openStorage();
  const analytics = new Analytics(events, clock);
  const { controller, offline, isNew, loadError } = await GameController.start({ clock, store, analytics, data: defaultData });
  analytics.log('session_start', { isNew, awayMs: offline?.awayMs ?? 0, platform: platformName(), standalone: matchMedia('(display-mode: standalone)').matches });

  const host = document.getElementById('game')!;
  const renderScale = Math.min(window.devicePixelRatio || 1, 2);
  const size = () => ({ w: Math.max(1, host.clientWidth), h: Math.max(1, host.clientHeight) });
  const { w, h } = size();
  const bus = new Bus<UiEvents>();
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: host,
    backgroundColor: '#6fcdee',
    banner: false,
    disableContextMenu: true,
    scale: { mode: Phaser.Scale.NONE, width: w * renderScale, height: h * renderScale, zoom: 1 / renderScale },
    render: { antialias: true, powerPreference: 'high-performance' },
    input: { activePointers: 3, mouse: { preventDefaultWheel: true } },
    fps: { target: 60 },
  });
  const init: VillageSceneInit = { controller, bus, renderScale };
  game.scene.add('village', VillageScene, true, init);

  const onResize = () => {
    const s = size();
    game.scale.resize(s.w * renderScale, s.h * renderScale);
  };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 250));

  const thumbs = new Map<string, string | null>();
  const hud = new Hud({
    root: document.getElementById('hud')!,
    controller,
    bus,
    analytics,
    store,
    thumbnail(type) {
      if (!thumbs.has(type)) {
        const key = Keys.buildingBase(type);
        const url = game.textures.exists(key) ? (game.textures.getBase64(key) as string) : null;
        thumbs.set(type, url);
      }
      return thumbs.get(type) ?? null;
    },
    getFps: () => game.loop.actualFps,
    debugTime,
    build: { version: __APP_VERSION__, builtAt: __BUILD_TIME__ },
  });

  if (offline) hud.showWelcomeBack(offline);
  if (loadError) hud.toast(`${loadError} A backup was kept and a new village started.`, 'error');
  if (!store.persistent) hud.toast('This browser mode cannot save your village.', 'error');
  if (isNew) hud.toast('Welcome to your kingdom! Tap Build to plant an Acorn Orchard.', 'info');

  // Autosave regularly and whenever the app goes to the background or closes.
  window.setInterval(() => void controller.save(), 15_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void controller.save();
  });
  window.addEventListener('pagehide', () => void controller.save());

  registerServiceWorker((text) => hud.toast(text, 'info'));
  document.getElementById('boot')?.classList.add('done');
}

boot().catch((e) => {
  console.error(e);
  const el = document.getElementById('boot');
  if (el) el.innerHTML = `<div class="err">Something went wrong starting the game.<br><small>${String((e as Error)?.message ?? e)}</small></div>`;
});
