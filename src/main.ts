import Phaser from 'phaser';
import './presentation/ui/styles.css';
import { Analytics, IdbEventStore, MemoryEventStore, type EventStore } from './backend/analytics/events';
import { GameController } from './gameplay/control/controller';
import { openGameDb } from './backend/persist/idb';
import { IdbSaveStore, MemorySaveStore, SANDBOX_SAVE_KEY, SaveConflictError, type SaveStore } from './backend/persist/saveStore';
import { registerServiceWorker } from './backend/pwa/register';
import { Keys, buildingThumbKey } from './presentation/render/assets';
import { loadInterfaceFonts } from './presentation/render/fonts';
import { loadArtManifest } from './presentation/render/artManifest';
import { VillageScene, type VillageSceneInit } from './presentation/render/VillageScene';
import { BattleScene } from './presentation/render/BattleScene';
import { App } from './app';
import { browserKeyValue, Connection, resolveServerUrl } from './backend/net/connection';
import { LocalGroveSource, RemoteGroveSource, type GroveSource } from './backend/social/groveSource';
import { sound } from './presentation/audio/sound';
import { notifyPrefs, prefs } from './backend/platform/prefs';
import { WebReminders, type ReminderService } from './backend/platform/reminders';
import { NativeReminders, isNative, platform } from './backend/platform/native';
import { MockPaymentProvider, type PaymentProvider } from './backend/payments/provider';
import { StoreKitPaymentProvider, UnavailablePaymentProvider } from './backend/payments/storekit';
import { choosePaymentProvider, isSandbox, paymentPath } from './backend/payments/select';
import { planNotifications, upcomingReminders } from './gameplay/sim/reminders';
import { Tutorial } from './presentation/ui/tutorial';
import { OffsetClock, SystemClock } from './gameplay/sim/clock';
import { defaultData } from './gameplay/sim/data';
import { Bus, type UiEvents } from './presentation/ui/bus';
import { Hud } from './presentation/ui/hud';

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

async function openStorage(sandbox: boolean): Promise<{ store: SaveStore; events: EventStore }> {
  try {
    const db = await openGameDb();
    const events = new IdbEventStore(db);
    void events.prune().catch(() => undefined);
    // Ask the browser not to evict our save (granted automatically for installed apps on most browsers).
    void navigator.storage?.persist?.().catch(() => undefined);
    // The testing sandbox has its own village: time skips and test purchases never touch the real one.
    return { store: new IdbSaveStore(db, sandbox ? SANDBOX_SAVE_KEY : undefined), events };
  } catch (e) {
    console.warn('Falling back to in-memory storage', e);
    return { store: new MemorySaveStore(), events: new MemoryEventStore() };
  }
}

async function boot(): Promise<void> {
  const params = new URLSearchParams(location.search);
  // Testing tools (time skips, instant test purchases) exist only in the
  // testing sandbox: ?sandbox (or ?debug) in the address. The sandbox has its
  // own save and never goes online, so neither its clock nor its free
  // purchases can reach a real village or a shared economy.
  const sandbox = isSandbox(location.search);
  const debugTime = sandbox ? createDebugTime() : { offsetMs: () => 0, skip: () => undefined };
  const clock = new OffsetClock(new SystemClock(), debugTime.offsetMs);
  const [{ store, events }] = await Promise.all([openStorage(sandbox), loadArtManifest()]);
  const analytics = new Analytics(events, clock);
  // Payments: StoreKit on iPhone; nothing yet on Android or the public web build;
  // the instant mock store only in the sandbox (clearly labelled there).
  const path = paymentPath(platform(), sandbox);
  const storeKit = path === 'storekit' ? new StoreKitPaymentProvider() : null;
  const payments: PaymentProvider = choosePaymentProvider(path, {
    storekit: () => storeKit!,
    mock: () => new MockPaymentProvider(() => clock.now()),
    unavailable: () => new UnavailablePaymentProvider(),
  });
  // Online play: the server chosen in Settings, else the one built into this version (VITE_SERVER_URL).
  const builtInUrl = (import.meta.env.VITE_SERVER_URL as string | undefined) || '';
  // With a server, real players raid this village instead of bots (never in the sandbox).
  const serverUrl = sandbox ? '' : resolveServerUrl(browserKeyValue, builtInUrl);
  const { controller, offline, isNew, loadError } = await GameController.start({ clock, store, analytics, data: defaultData, payments, botRaids: !serverUrl });
  const connection = new Connection({ game: controller, builtInUrl, offline: sandbox });
  const groveSource: GroveSource = connection.enabled ? new RemoteGroveSource(controller, connection) : new LocalGroveSource(controller);
  if (storeKit) {
    void storeKit.listen((productId, transactionId) => {
      const r = controller.dispatch({ type: 'grantPurchase', productId, transactionId });
      if (r.ok) analytics.log('purchase', { productId, transactionId, provider: 'storekit', deferred: true });
    });
  }
  analytics.log('session_start', { isNew, awayMs: offline?.awayMs ?? 0, platform: platformName(), standalone: matchMedia('(display-mode: standalone)').matches });

  await loadInterfaceFonts();
  const host = document.getElementById('game')!;
  // Draw at the screen's real density (iPhone 3x, Pixel 7 2.6x) so lines and text are smooth, not upscaled.
  const renderScale = Math.min(window.devicePixelRatio || 1, 3);
  const size = () => ({ w: Math.max(1, host.clientWidth), h: Math.max(1, host.clientHeight) });
  const { w, h } = size();
  const bus = new Bus<UiEvents>();
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: host,
    backgroundColor: '#1d2537',
    banner: false,
    disableContextMenu: true,
    scale: { mode: Phaser.Scale.NONE, width: w * renderScale, height: h * renderScale, zoom: 1 / renderScale },
    render: { antialias: true, powerPreference: 'high-performance' },
    input: { activePointers: 3, mouse: { preventDefaultWheel: true } },
    fps: { target: 60 },
  });
  const init: VillageSceneInit = { controller, bus, renderScale };
  game.scene.add('village', VillageScene, true, init);
  game.scene.add('battle', BattleScene, false);

  const onResize = () => {
    const s = size();
    game.scale.resize(s.w * renderScale, s.h * renderScale);
  };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 250));

  const thumbs = new Map<string, string>();
  // Only real images are remembered: a texture that isn't ready yet is asked for again next time.
  const thumbOf = (key: string): string | null => {
    const known = thumbs.get(key);
    if (known) return known;
    if (!game.textures.exists(key)) return null;
    const url = game.textures.getBase64(key) as string;
    if (url) thumbs.set(key, url);
    return url || null;
  };
  let app: App | null = null;
  let tutorial: Tutorial | null = null;
  const reminders: ReminderService = isNative() ? new NativeReminders() : new WebReminders();
  const hud = new Hud({
    root: document.getElementById('hud')!,
    controller,
    bus,
    analytics,
    store,
    thumbnail: (type) => thumbOf(buildingThumbKey(game.textures, type)),
    getFps: () => game.loop.actualFps,
    troopThumb: (type) => thumbOf(Keys.troop(type)),
    warriorIcon: (id) => thumbOf(Keys.warriorIcon(id)),
    onAttack: () => app?.scout(false),
    onReplay: (record) => app?.replay(record),
    onGroveAttack: (target) => app?.groveAttack(target),
    onTrial: (tier) => app?.trial(tier),
    onPractice: (army) => app?.practice(army),
    prefs,
    notifyPrefs,
    onRemindersEnabled: async () => {
      const ok = await reminders.enable();
      if (!ok) {
        prefs.set('reminders', false);
        hud.toast('Notifications are blocked. You can allow them in your device settings.', 'error');
      }
    },
    reminderNote: reminders.note,
    onReplayTutorial: () => tutorial?.restart(),
    debugTime,
    sandbox,
    build: { version: __APP_VERSION__, builtAt: __BUILD_TIME__ },
    groveSource,
    connection,
  });

  app = new App({
    game,
    controller,
    hud,
    hudRoot: document.getElementById('hud')!,
    battleRoot: document.getElementById('battle-hud')!,
    renderScale,
    troopThumb: (type) => thumbOf(Keys.troop(type)),
    connection,
    groveSource,
  });

  connection.start();

  // A raid the app closed in the middle of plays out now, so it can't be erased by quitting.
  const interrupted = controller.resolvePendingBattle();
  if (interrupted) {
    const { pending, record } = interrupted;
    if (pending.ticket) {
      const sub = { ticket: pending.ticket, seed: pending.setup.seed, army: pending.setup.army, levels: pending.setup.levels, reinforcements: pending.setup.reinforcements, deployments: pending.deployments };
      void connection.report(pending.kind === 'war' ? 'raid' : 'attack', sub);
    }
    const what = pending.kind === 'war' ? 'Alliance War attack' : pending.kind === 'trial' ? 'Shadow Trial' : 'raid';
    hud.toast(`Your ${what} on ${pending.opponentName} was interrupted and has been played out: ${record.result.stars}★, ${record.result.destruction}%. See the battle log.`, 'info');
  }

  if (sandbox) hud.toast('Testing sandbox: a separate practice village with testing tools and a free test store. Your real village is untouched, and online play is off.', 'info');
  if (params.has('debug')) {
    // Testing hook, only with ?debug in the URL.
    (window as unknown as Record<string, unknown>).tk = { game, controller, app, connection };
  }

  if (offline) {
    hud.showWelcomeBack(offline, () => {
      if (offline.raids.some((r) => r.result.destruction >= 50)) controller.triggerOffer('heavy_defense_loss');
    });
  }
  if (loadError) hud.toast(`${loadError} A backup was kept and a new village started.`, 'error');
  if (!store.persistent) hud.toast('This browser mode cannot save your village.', 'error');
  tutorial = new Tutorial(controller, analytics, document.body);
  tutorial.start();
  // A village kept after a failed load, further along than this one: offer it back.
  void hud.offerRecovery().catch((e) => console.warn('Could not check for kept villages', e));

  // Sound: unlock on the first touch (iOS needs a gesture), tap clicks, event cues, music.
  document.addEventListener('pointerdown', () => sound.unlock(), { capture: true });
  document.addEventListener('click', (e) => {
    if ((e.target as Element | null)?.closest?.('button, [role="button"]')) sound.play('tap');
  }, { capture: true });
  controller.onEvents((events) => {
    for (const e of events) {
      if (e.kind === 'raid_settled') {
        // The server's answer to an online attack.
        const r = e.record;
        if (e.outcome === 'confirmed') hud.toast(`Raid on ${r.opponentName} confirmed by the server${Object.values(r.banked ?? {}).some((v) => (v ?? 0) > 0) ? ': loot banked' : ''}.`, 'success');
        else hud.toast(`The server did not accept your raid on ${r.opponentName} (${r.rejected}). It counts as practice: no loot or honor.`, 'error');
      } else if (e.kind === 'reward' && e.source.startsWith('season:')) hud.toast('The league season ended: your chest was added. See Honor for details.', 'success');
      if (e.kind === 'purchase_granted') sound.play('coin');
      else if (e.kind === 'skip_used') sound.play('magic');
      else if (e.kind === 'reward') sound.play('star');
      else if (e.kind === 'donation') sound.play('collect');
      else if (e.kind === 'upgrade_start' || e.kind === 'clear_start' || e.kind === 'train_start') sound.play('build');
    }
  });
  controller.onOffer(() => sound.play('notify'));
  sound.music('village');

  // Healthy play: one friendly break suggestion after an hour of play.
  let playedMs = 0;
  let lastTick = performance.now();
  let breakShown = false;
  window.setInterval(() => {
    const t = performance.now();
    if (document.visibilityState === 'visible') playedMs += t - lastTick;
    lastTick = t;
    if (!breakShown && prefs.get('sessionReminder') && playedMs >= 60 * 60_000) {
      breakShown = true;
      analytics.log('session_reminder', { minutes: Math.round(playedMs / 60_000) });
      hud.modal(
        'Time for a break?',
        Object.assign(document.createElement('p'), { textContent: "You've been playing for an hour. How about a stretch and a glass of water? Your Village Artisans will keep working while you're away." }),
        [{ label: 'Keep playing', primary: true, onClick: () => hud.closeAllModals() }],
      );
    }
  }, 5000);

  // Autosave regularly and whenever the app goes to the background or closes.
  window.setInterval(() => void controller.save(), 15_000);
  document.addEventListener('visibilitychange', () => {
    const hidden = document.visibilityState === 'hidden';
    sound.suspend(hidden);
    if (hidden) {
      app?.flushBattle();
      void controller.save();
      void connection.uploadBase();
      if (prefs.get('reminders')) {
        // Opt-in only: the player's chosen types, no quiet-hours pings, a daily cap.
        const gd = controller.data;
        const planned = planNotifications(upcomingReminders(controller.state, controller.now(), gd), notifyPrefs.enabledSet(gd.notifications.types), controller.now(), new Date().getTimezoneOffset(), gd);
        void reminders.schedule(planned);
      }
    } else {
      void reminders.cancelAll();
      // A save right away also tells a tab left in the background that another one has taken over.
      void controller.save();
    }
  });
  window.addEventListener('pagehide', () => {
    app?.flushBattle();
    void controller.save();
  });
  // A failed save is shown (at most once a minute), never only logged.
  let lastSaveWarning = 0;
  controller.onSaveError((e) => {
    if (e instanceof SaveConflictError) {
      hud.showTakenOver();
      return;
    }
    if (Date.now() - lastSaveWarning < 60_000) return;
    lastSaveWarning = Date.now();
    hud.toast(`Your village could not be saved (${e.message}). Free some device storage, and copy a save code in Settings to keep it safe.`, 'error');
  });

  if (!isNative()) registerServiceWorker((text) => hud.toast(text, 'info'));
  document.getElementById('boot')?.classList.add('done');
}

boot().catch((e) => {
  console.error(e);
  const el = document.getElementById('boot');
  if (el) el.innerHTML = `<div class="err">Something went wrong starting the game.<br><small>${String((e as Error)?.message ?? e)}</small></div>`;
});
