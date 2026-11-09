import { t as i18nText } from './presentation/ui/i18n';
import { listText as i18nList, fmtNumber, initLanguage, labelText as i18nLabel, t } from './presentation/ui/i18n';
import Phaser from 'phaser';
import './presentation/ui/styles.css';
import { Analytics, IdbEventStore, MemoryEventStore, type EventStore } from './backend/analytics/events';
import { CrashReporter } from './backend/analytics/crashReports';
import { httpStatsTransport, StatsSharing } from './backend/analytics/share';
import { armOf } from './backend/net/balanceBundle';
import { platformSignIn } from './backend/platform/auth';
import { GameController } from './gameplay/control/controller';
import { openGameDb, reconnected } from './backend/persist/idb';
import { IdbSaveStore, MemorySaveStore, SANDBOX_SAVE_KEY, SaveConflictError, type SaveStore } from './backend/persist/saveStore';
import { registerServiceWorker, updateWebApp } from './backend/pwa/register';
import { Keys, buildingThumbKey, paintedBuildingBytes, prepareTextures, villageTexture } from './presentation/render/assets';
import { loadInterfaceFonts } from './presentation/render/fonts';
import { loadArtManifest, queueArt } from './presentation/render/artManifest';
import { VillageScene, type VillageSceneInit } from './presentation/render/VillageScene';
import { BattleScene } from './presentation/render/BattleScene';
import { quality, renderScaleFor } from './presentation/render/quality';
import { App } from './app';
import { browserKeyValue, Connection, resolveServerUrl } from './backend/net/connection';
import { BalanceLoader } from './backend/net/balance';
import { SIM_RULES } from './gameplay/sim/battle/battle';
import { LocalGroveSource, RemoteGroveSource, type GroveSource } from './backend/social/groveSource';
import { sound } from './presentation/audio/sound';
import { notifyPrefs, prefs } from './backend/platform/prefs';
import { WebReminders, type ReminderService } from './backend/platform/reminders';
import { NativeReminders, isNative, platform } from './backend/platform/native';
import { MockPaymentProvider, type PaymentProvider } from './backend/payments/provider';
import { StoreKitPaymentProvider, UnavailablePaymentProvider } from './backend/payments/storekit';
import { PlayBillingPaymentProvider } from './backend/payments/playBilling';
import { pushDevice } from './backend/platform/push';
import { choosePaymentProvider, isSandbox, paymentPath } from './backend/payments/select';
import { planNotifications, upcomingReminders } from './gameplay/sim/reminders';
import { Tutorial } from './presentation/ui/tutorial';
import { provideUiArt } from './presentation/ui/feedback';
import { senseiPortrait } from './presentation/art/portraits';
import { chestSvg, revealChest } from './presentation/art/chest';
import { OffsetClock, SystemClock } from './gameplay/sim/clock';
import { defaultData } from './gameplay/sim/data';
import { Bus, type UiEvents } from './presentation/ui/bus';
import { Hud, STATS_EXPLAINER } from './presentation/ui/hud';
import { acceptedRulesVersion, onCommunityRulesAccepted } from './presentation/ui/communityRules';
import { encodeExportCode, NewerSaveError, serialize, type SaveFile } from './gameplay/sim/save';

declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;

const DEBUG_OFFSET_KEY = 'tk.debugTimeOffsetMs';

/** The inline start-up guard from index.html (src/backend/pwa/boot.js). */
const bootGuard = (window as unknown as { __tkBoot?: { done(): void; stop(): void; progress?(text?: string): void } }).__tkBoot;
// Every module loaded: from here on boot() reports its own errors (the guard keeps its timer).
(window as unknown as { __tkStarted?: boolean }).__tkStarted = true;

/** The splash's status line (start-up progress). */
function bootStatus(text: string): void {
  const el = document.querySelector<HTMLElement>('#boot .boot-status');
  if (el) el.textContent = text;
  // Each step is progress: the boot guard's "taking a long time" clock starts again (report section 5 step 3).
  bootGuard?.progress?.(text);
}

/**
 * A banner across the top of the screen for things that stay true for the whole session
 * (the browser can't save; the browser may delete the save). Toasts disappear unseen.
 */
function showBanner(id: string, text: string, actions: { label: string; onClick: (close: () => void) => void }[] = []): () => void {
  document.getElementById(id)?.remove();
  const el = document.createElement('div');
  el.id = id;
  el.className = 'tk-banner';
  el.setAttribute('role', 'status');
  const p = document.createElement('span');
  p.textContent = text;
  el.append(p);
  const close = () => el.remove();
  for (const a of actions) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = a.label;
    b.addEventListener('click', () => a.onClick(close));
    el.append(b);
  }
  document.body.append(el);
  return close;
}

/** The save store this boot opened, for the error screen's "Copy save code". */
let bootStore: SaveStore | null = null;

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


/**
 * Why the server refused a raid report, as a sentence in the player's language (remnant audit
 * 2026-11-06: the toast showed the code, e.g. "account_deleted"); empty for a code with no words yet.
 */
function rejectedWhy(code: string | undefined): string {
  const known = ['expired', 'defender_protected', 'no_warriors', 'account_deleted', 'conflict', 'version_mismatch', 'banned'];
  return code && known.includes(code) ? ` ${t(`raid.rejected.${code}`)}` : '';
}
async function openStorage(sandbox: boolean): Promise<{ store: SaveStore; events: EventStore; db: IDBDatabase | null }> {
  try {
    // Gives up after 5 s (some iOS versions never answer): the game then runs on memory with a banner.
    const db = await openGameDb();
    const events = new IdbEventStore(db);
    void events.prune().catch(() => undefined);
    // The testing sandbox has its own village: time skips and test purchases never touch the real one.
    return { store: new IdbSaveStore(db, sandbox ? SANDBOX_SAVE_KEY : undefined), events, db };
  } catch (e) {
    console.warn(i18nText("ui.falling_back_to_in_memory_storage_f1f5b7fd50"), e);
    return { store: new MemorySaveStore(), events: new MemoryEventStore(), db: null };
  }
}

/**
 * Ask the browser not to evict the save (client re-audit item 7). Safari deletes a site's storage
 * after 7 days without a visit unless the game is on the Home Screen, and `persist()` is often
 * refused there. Returns false when the save may be evicted.
 */
async function storageKept(): Promise<boolean> {
  const s = navigator.storage;
  if (!s?.persisted) return true; // nothing to ask: assume the browser's normal rules
  try {
    if (await s.persisted()) return true;
    return Boolean(await s.persist?.());
  } catch {
    return true;
  }
}

const PERSIST_PROMPT_KEY = 'tk.persistPromptUntil';
const WEEK_MS = 7 * 24 * 3600_000;

function persistPromptDue(): boolean {
  try {
    return Date.now() >= Number(localStorage.getItem(PERSIST_PROMPT_KEY) || 0);
  } catch {
    return true;
  }
}

function snoozePersistPrompt(): void {
  try {
    localStorage.setItem(PERSIST_PROMPT_KEY, String(Date.now() + WEEK_MS));
  } catch {
    /* storage blocked: asked again next start */
  }
}

/** Set up first thing in boot(), so a failed start is reported too. */
let crashReporter: CrashReporter | null = null;

async function boot(): Promise<void> {
  const params = new URLSearchParams(location.search);
  // Testing tools (time skips, instant test purchases) exist only in the
  // testing sandbox: ?sandbox (or ?debug) in the address. The sandbox has its
  // own save and never goes online, so neither its clock nor its free
  // purchases can reach a real village or a shared economy.
  const sandbox = isSandbox(location.search);
  // Crash reports (VITE_SENTRY_DSN builds only; Settings can switch them off; never from the sandbox).
  crashReporter = new CrashReporter({
    dsn: sandbox ? undefined : (import.meta.env.VITE_SENTRY_DSN as string | undefined),
    release: `kagemura@${__APP_VERSION__}`,
    environment: isNative() ? platform() : 'web',
    enabled: () => prefs.get('crashReports'),
    tags: { device: platformName() },
  });
  crashReporter.install();
  const debugTime = sandbox ? createDebugTime() : { offsetMs: () => 0, skip: () => undefined };
  const clock = new OffsetClock(new SystemClock(), debugTime.offsetMs);
  // Report section 5 step 9: the player's language (stored choice, else the device's), before any game text shows.
  await initLanguage();
  bootStatus(i18nText("ui.opening_your_village_985a7b5b5b"));
  const [{ store, events, db }] = await Promise.all([openStorage(sandbox), loadArtManifest()]);
  bootStore = store;
  const analytics = new Analytics(events, clock);
  // Payments: StoreKit on iPhone; Google Play Billing on Android only in builds made with
  // VITE_PLAY_BILLING=1; none on the public web build; the instant mock store only in the
  // sandbox (clearly labelled there).
  const path = paymentPath(platform(), sandbox, import.meta.env.VITE_PLAY_BILLING === '1');
  const storeKit = path === 'storekit' ? new StoreKitPaymentProvider() : null;
  const play = path === 'play' ? new PlayBillingPaymentProvider() : null;
  const payments: PaymentProvider = choosePaymentProvider(path, {
    storekit: () => storeKit!,
    play: () => play!,
    mock: () => new MockPaymentProvider(() => clock.now()),
    unavailable: () => new UnavailablePaymentProvider(),
  });
  // Online play: the server chosen in Settings, else the one built into this version (VITE_SERVER_URL).
  const builtInUrl = (import.meta.env.VITE_SERVER_URL as string | undefined) || '';
  // With a server, real players raid this village instead of bots (never in the sandbox).
  const serverUrl = sandbox ? '' : resolveServerUrl(browserKeyValue, builtInUrl);
  // Balance bundles (roadmap step 76): the operators' signed number changes from the last session, applied
  // before the village loads (never mid-session, never in the sandbox, never without the public key).
  // Experiment arms (report section 5 step 5) are picked by the statistics id: only players who share are in one.
  const balance = sandbox ? null : new BalanceLoader(browserKeyValue, defaultData, SIM_RULES, (import.meta.env.VITE_BALANCE_PUBLIC_KEY as string | undefined) ?? '', () => StatsSharing.installIdIn(browserKeyValue));
  await balance?.applyCached();
  const { controller, offline, isNew, loadError } = await GameController.start({ clock, store, analytics, data: defaultData, payments, botRaids: !serverUrl, sandbox });
  // "Update Kagemura" (roadmap step 75) opens the store listing in the apps; the web build reloads.
  const env = import.meta.env as Record<string, string | undefined>;
  const updateUrl = isNative() ? (platform() === 'ios' ? env.VITE_APP_STORE_URL : platform() === 'android' ? env.VITE_PLAY_STORE_URL : undefined) : undefined;
  const connection = new Connection({ game: controller, builtInUrl, offline: sandbox, build: `${__APP_VERSION__}+${isNative() ? platform() : 'web'}`, keepVillageOnServer: true, updateUrl, rulesAccepted: acceptedRulesVersion, ...(balance ? { balance, dataVersion: () => balance.dataVersion() } : {}) });
  onCommunityRulesAccepted(() => void connection.acceptRules());
  // Report section 5 step 8 (growth 9): task days roll at the player's own midnight (the sim allows a change once a week).
  {
    const minutes = -new Date().getTimezoneOffset();
    if (controller.state.localTime?.offsetMinutes !== minutes) controller.dispatch({ type: 'setLocalTime', minutes });
  }
  const groveSource: GroveSource = connection.enabled ? new RemoteGroveSource(controller, connection) : new LocalGroveSource(controller);
  // Shared play statistics (report section 5 step 5): adults only, off until they say yes, never in the sandbox.
  const stats = sandbox || !connection.enabled
    ? null
    : new StatsSharing({
        kv: browserKeyValue,
        transport: httpStatsTransport(connection.url),
        build: `${__APP_VERSION__}+${isNative() ? platform() : 'web'}`,
        ageBand: () => connection.ageBand,
        arm: () => armOf(balance?.applied ?? null),
        serverReady: () => Boolean(connection.server?.features.includes('stats')),
        backlog: (n) => analytics.recent(n),
      });
  if (stats) {
    analytics.onLog((e) => stats.hear(e));
    stats.start();
  }
  // Store receipts go to the server when it checks them (roadmap Phase 4).
  controller.purchaseVerifier = () => (payments.store ? connection.purchaseVerifier(payments.store) : null);
  // Purchases approved later (Ask to Buy, pending payments), and paid ones not yet delivered.
  const deliverLater = (receipt: Parameters<GameController['deliverReceipt']>[0]) =>
    void controller.deliverReceipt(receipt).then((r) => {
      if (r.ok) hud?.toast(i18nText("ui.your_purchase_has_been_delivered_ae90965955"), 'success');
    });
  if (storeKit) void storeKit.listen(deliverLater);
  if (play) void play.listen(deliverLater);
  // Paid purchases not delivered yet are retried on every reconnection (not only the first one
  // after start), and again with a bounded backoff while some are still waiting (GLOBAL-013).
  // Each one is delivered once: the village records its store transaction id.
  let wasOnline = false;
  let recoverTimer: ReturnType<typeof setTimeout> | undefined;
  let recoverTry = 0;
  let recovering = false;
  const recoverPurchases = () => {
    clearTimeout(recoverTimer);
    if (recovering) return;
    recovering = true;
    void controller
      .deliverUnfinishedReport()
      .then(({ delivered, left }) => {
        if (delivered) hud?.toast(i18nText('common.purchasesRecovered', {n: delivered}), 'success');
        if (left > 0 && (connection.online || !connection.enabled)) recoverTimer = setTimeout(recoverPurchases, Math.min(15_000 * 2 ** recoverTry++, 15 * 60_000));
        else recoverTry = 0;
      })
      // Refunds and reversed refunds the server knows of (remnant audit 2026-11-06).
      .then(() => controller.settleRefunds(connection.serverVillage))
      .then(({ revoked, reinstated }) => {
        if (revoked) hud?.toast(t('purchase.refunded', { n: revoked }), 'info');
        if (reinstated) hud?.toast(t('purchase.reinstated', { n: reinstated }), 'success');
      })
      .catch((e) => console.warn('Could not settle refunds', e))
      .finally(() => (recovering = false));
  };
  // Things the player must hear about once: a queue this device could not store (GLOBAL-010),
  // and what the server held back when the village moved (GLOBAL-002).
  let toldStorage = false;
  connection.subscribe(() => {
    if (connection.storageProblem && !toldStorage) {
      toldStorage = true;
      hud?.toast(i18nText("ui.this_device_could_not_store_your_lates_8c473f9787"), 'error');
    } else if (!connection.storageProblem) toldStorage = false;
    const held = connection.village?.importHeld;
    if (held) {
      connection.village!.importHeld = null;
      const parts = i18nList([held.jade ? i18nText("ui.jade_9ff8af5a0c", { arg1: fmtNumber(held.jade) }) : '', held.premium ? i18nText("ui.the_premium_season_scroll_6a112fd87e") : ''].filter(Boolean));
      if (parts) hud?.toast(i18nText("ui.your_village_is_on_the_server_now_coul_42714aac00", { arg1: parts }), 'info');
    }
  });
  // The one-time question about play statistics: once online (the age is known by then), not in a battle.
  let statsAsked = false;
  const askStats = () => {
    if (!stats?.shouldAsk || !connection.online) return;
    let battle = false;
    try {
      battle = Boolean(app?.inBattle);
    } catch {
      battle = true; // the scenes are not set up yet: ask a little later
    }
    if (battle) return void setTimeout(askStats, 60_000);
    const answer = (on: boolean) => {
      void stats.set(on);
      hud?.toast(on ? i18nText("ui.thank_you_you_can_turn_this_off_in_set_b65491280f") : i18nText("ui.nothing_is_shared_you_can_change_this__a91160e994"), 'info');
    };
    showBanner('tk-banner-stats', i18nText("ui.help_improve_kagemura_share_play_stati_d5a5c00a9e"), [
      { label: i18nText("ui.share_29887a5ff9"), onClick: (close) => { close(); answer(true); } },
      { label: i18nText("ui.no_thanks_49780701dc"), onClick: (close) => { close(); answer(false); } },
      {
        label: i18nText("ui.what_is_shared_742745a508"),
        onClick: (close) => {
          close();
          void hud?.confirm(i18nText("ui.share_play_statistics_551c0c9c62"), STATS_EXPLAINER, i18nText("ui.share_29887a5ff9"), false, i18nText("ui.no_thanks_49780701dc")).then(answer);
        },
      },
    ]);
  };
  connection.subscribe(() => {
    if (statsAsked || !stats?.shouldAsk || !connection.online) return;
    statsAsked = true;
    setTimeout(askStats, 20_000);
  });
  connection.subscribe(() => {
    const on = connection.online;
    if (on && !wasOnline) {
      recoverTry = 0;
      recoverPurchases();
      void syncPush();
    }
    wasOnline = on;
  });
  // Coming back to the app: approvals and payments may have finished in the meantime.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && (connection.online || !connection.enabled)) recoverPurchases();
  });
  // Server push (step 40): the types switched on in Settings, only while notifications are on.
  const syncPush = () =>
    connection
      .syncPush(prefs.get('reminders') ? [...notifyPrefs.enabledSet(controller.data.notifications.types)] : [], new Date().getTimezoneOffset(), pushDevice)
      .catch((e) => console.warn(i18nText("ui.push_registration_failed_9a9f4cdbb5"), e));
  analytics.log('session_start', { isNew, awayMs: offline?.awayMs ?? 0, platform: platformName(), standalone: matchMedia('(display-mode: standalone)').matches });

  await loadInterfaceFonts();
  const host = document.getElementById('game')!;
  // Draw at the screen's real density (iPhone 3x, Pixel 7 2.6x) so lines and text are smooth, not upscaled;
  // low quality (cheap phones, ?quality=low, Settings) stops at 2x and 30 FPS (render/quality.ts).
  const q = quality();
  const renderScale = renderScaleFor(q);
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
    render: { antialias: true, powerPreference: q.powerPreference },
    input: { activePointers: 3, mouse: { preventDefaultWheel: true } },
    // The limit sits just above 30 so a 60/90/120 Hz display reliably steps every 2nd/3rd/4th frame.
    // High has no real limit (1000), but a limit makes Phaser use its limiting step, so the idle
    // throttle below can lower the rate at run time without restarting the loop.
    fps: q.fps < 60 ? { target: q.fps, limit: q.fps + 1 } : { target: 60, limit: 1000 },
  });
  // The map is drawn on a canvas: name it for screen readers (client re-audit item 15).
  game.canvas?.setAttribute('role', 'img');
  game.canvas?.setAttribute('aria-label', i18nText("ui.village_map_drag_to_look_around_pinch__2599974c91"));
  const init: VillageSceneInit = { controller, bus, renderScale };
  // Start-up (client re-audit item 3): a small first scene loads any real art, then paints the
  // generated textures in short slices (the splash shows progress and the page keeps answering),
  // then starts the village. The splash stays until the village's first frame is on screen.
  const gd = controller.data;
  let resolveFirstFrame: () => void = () => undefined;
  const firstFrame = new Promise<void>((resolve) => (resolveFirstFrame = resolve));
  class PrepareScene extends Phaser.Scene {
    constructor() {
      super('prepare');
    }
    preload(): void {
      bootStatus(i18nText("ui.unpacking_the_scrolls_6dcf82d807"));
      queueArt(this);
    }
    create(): void {
      bootStatus(i18nText("ui.painting_the_village_5cb74eddf7"));
      // No frames while painting: on a slow phone each frame between slices would cost as much as a slice.
      game.loop.sleep();
      const st = controller.state;
      void prepareTextures(this, gd, st.buildings, st.cosmetics.hallSkin, (f) => bootStatus(i18nText("ui.painting_the_village_6de68dbf99", { arg1: Math.round(f * 100) })))
        .catch((e) => console.warn(i18nText("ui.texture_preparation_failed_the_scenes__e13e4bce87"), e))
        .then(() => {
          bootStatus(i18nText("ui.lighting_the_lanterns_bc821aedf0"));
          game.loop.wake();
          const village = this.scene.get('village');
          village.events.once(Phaser.Scenes.Events.CREATE, () => game.events.once(Phaser.Core.Events.POST_RENDER, () => resolveFirstFrame()));
          this.scene.start('village', init);
        });
    }
  }
  game.scene.add('village', VillageScene, false);
  game.scene.add('battle', BattleScene, false);
  game.scene.add('prepare', PrepareScene, true);

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
  // Art the HUD may not import itself (only art contract files are open to GUI): the Sensei portrait and the chest.
  provideUiArt({ senseiPortrait, chestSvg, revealChest });
  const hud = new Hud({
    root: document.getElementById('hud')!,
    controller,
    bus,
    analytics,
    store,
    thumbnail: (type) => thumbOf(buildingThumbKey(game.textures, type)),
    // The Keep at the player's own level in each look (Store → Looks), painted on first use.
    skinThumbnail: (skin) => {
      const keep = controller.state.buildings.find((b) => controller.data.buildings[b.type]?.category === 'hall');
      return thumbOf(villageTexture(game.textures, 'elder_toadstool', Math.max(1, keep?.level ?? 1), controller.data.buildings.elder_toadstool.size, skin));
    },
    getFps: () => game.loop.actualFps,
    troopThumb: (type) => thumbOf(Keys.troop(type)),
    warriorIcon: (id) => thumbOf(Keys.warriorIcon(id)),
    onAttack: () => app?.scout(false),
    onReplay: (record) => app?.replay(record),
    onGroveAttack: (target) => app?.groveAttack(target),
    onTrial: (tier) => app?.trial(tier),
    onBounty: (eventKey, base) => app?.bounty(eventKey, base),
    onRematch: (defenseId) => app?.rematch(defenseId),
    onPractice: (army) => app?.practice(army),
    onDuel: (friendId, name, opts) => void app?.duel(friendId, name, opts),
    onGangWarAttack: (target, relay, enemyName, bot) => void app?.gangWarAttack(target, relay, enemyName, bot),
    prefs,
    notifyPrefs,
    onRemindersEnabled: async () => {
      const ok = await reminders.enable();
      if (!ok) {
        prefs.set('reminders', false);
        hud.toast(i18nText("ui.notifications_are_blocked_you_can_allo_1340696696"), 'error');
      }
      void syncPush();
    },
    onNotificationsChanged: () => void syncPush(),
    reminderNote: reminders.note,
    onReplayTutorial: () => tutorial?.restart(),
    debugTime,
    sandbox,
    build: { version: __APP_VERSION__, builtAt: __BUILD_TIME__ },
    crashReports: crashReporter.configured,
    ...(stats ? { stats } : {}),
    signIn: platformSignIn({ googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined, appleServicesId: import.meta.env.VITE_APPLE_SERVICES_ID as string | undefined }),
    groveSource,
    connection,
    // Friend links (step 59): the web game's own address; in the apps, VITE_PUBLIC_URL (the web game) if set.
    friendLinkBase: () => (isNative() ? (env.VITE_PUBLIC_URL ?? null) || null : `${location.origin}${location.pathname}`),
    updateWebApp: (beforeReload, note) => updateWebApp(beforeReload, note),
  });

  // Toasts raised before the first frame (interrupted raid, sandbox notice, load errors, purchases
  // delivered at start) wait for it: under the splash they would expire unseen.
  let shown = false;
  const earlyToasts: Parameters<Hud['toast']>[] = [];
  const showToast = hud.toast.bind(hud);
  hud.toast = (text, kind = 'info') => {
    if (shown) showToast(text, kind);
    else earlyToasts.push([text, kind]);
  };

  // How to keep the village when the browser may delete it (client re-audit item 7): Settings
  // shows this note every time; the village screen shows a banner at most once a week.
  let persistAdvice = false;
  const copySaveCode = () => {
    const code = encodeExportCode(serialize(controller.state, controller.now()));
    const done = () => hud.toast(i18nText("ui.save_code_copied_keep_it_somewhere_saf_7ceeb86aed"), 'success');
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(code).then(done, () => hud.toast(i18nText("ui.open_settings_copy_save_code_to_copy_i_285b47e44e"), 'info'));
    else hud.toast(i18nText("ui.open_settings_copy_save_code_to_copy_i_285b47e44e"), 'info');
  };
  const persistNote = (): HTMLElement => {
    const box = document.createElement('div');
    box.className = 'note';
    const ios = platformName() === 'ios';
    const p = document.createElement('p');
    p.textContent = ios
      ? // Report section 5 step 3 (device F6): a Home Screen web app has its own storage, apart from Safari's, so it starts
        // a new village. The save code is what carries this one over.
        i18nText("ui.safari_may_delete_this_village_after_a_9133912cdf")
      : i18nText("ui.this_browser_may_delete_this_village_i_1af0777d33");
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn';
    b.textContent = i18nText("ui.copy_save_code_3ac3ad4d9c");
    b.addEventListener('click', copySaveCode);
    box.append(p, b);
    return box;
  };
  const openPersistAdvice = () => hud.modal(i18nText("ui.keep_your_village_safe_c885b1fcbb"), persistNote(), [{ label: i18nText("ui.ok_565339bc4d"), primary: true, onClick: () => hud.closeAllModals() }]);
  const rawModal = hud.modal.bind(hud);
  hud.modal = (title, body, ...rest) => {
    if (title === i18nLabel('Settings') && persistAdvice) body.prepend(persistNote());
    return rawModal(title, body, ...rest);
  };

  /** Android Back during a battle: close its dialog, else ask to end the battle (or leave scouting / a replay). */
  const battleBack = () => {
    const hudEl = document.getElementById('battle-hud');
    if (!hudEl) return;
    const dialogs = hudEl.querySelectorAll<HTMLElement>('.modal-backdrop');
    const top = dialogs[dialogs.length - 1];
    if (top) {
      // A dialog with a close button (End the battle?) closes; the results screen goes home.
      (top.querySelector<HTMLButtonElement>('.modal-head .icon-btn') ?? top.querySelector<HTMLButtonElement>('.modal-foot .btn.primary'))?.click();
      return;
    }
    const buttons = [...hudEl.querySelectorAll<HTMLButtonElement>('button')].filter((b) => b.offsetParent !== null);
    const pick = (label: string) => buttons.find((b) => b.textContent?.trim() === i18nLabel(label));
    (pick('End battle') ?? pick('Exit replay') ?? pick('Home'))?.click();
  };

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
  // Without a server, paid-but-undelivered purchases are delivered from the store now (the HUD exists for its toast).
  if (!connection.enabled) recoverPurchases();

  // A friend link (?friend=KAGE-XXXXXX) opens Friends on that player once the game is online.
  const friendParam = new URLSearchParams(location.search).get('friend');
  if (friendParam && !sandbox) {
    const stop = connection.subscribe(() => {
      if (!connection.canFriends) return;
      stop();
      hud.openFriends(friendParam);
    });
  }

  // A raid the app closed in the middle of plays out now, so it can't be erased by quitting.
  const interrupted = controller.resolvePendingBattle();
  if (interrupted) {
    const { pending, record } = interrupted;
    if (pending.ticket) {
      const sub = { ticket: pending.ticket, seed: pending.setup.seed, army: pending.setup.army, levels: pending.setup.levels, reinforcements: pending.setup.reinforcements, deployments: pending.deployments };
      void connection.report(pending.channel === 'gangwar' ? 'gangwar' : pending.kind === 'war' ? 'raid' : 'attack', sub);
    }
    const what = pending.channel === 'gangwar' ? i18nText("ui.gang_war_attack_59b0d70c6d") : pending.kind === 'war' ? i18nText("ui.alliance_war_attack_b99d44a1a6") : pending.kind === 'trial' ? i18nText("ui.shadow_trial_3aa629e356") : i18nText("ui.raid_263dae9af8");
    hud.toast(i18nText("ui.your_on_was_interrupted_and_has_been_p_2998375358", { arg1: what, arg2: pending.opponentName, arg3: record.result.stars, arg4: record.result.destruction }), 'info');
  }

  if (sandbox) hud.toast(i18nText("ui.testing_sandbox_a_separate_practice_vi_e3d2ae64e5"), 'info');
  if (params.has('debug')) {
    // Testing hook, only with ?debug in the URL.
    (window as unknown as Record<string, unknown>).tk = { game, controller, app, connection, paintedBytes: paintedBuildingBytes };
  }

  // Re-audit: no paid offer after a loss (the Rebuild Kit after raids, often simulated ones, read as "pay to not lose").
  if (offline) hud.showWelcomeBack(offline, () => undefined);
  if (loadError) hud.toast(i18nText("ui.a_backup_was_kept_and_a_new_village_st_6cb7ba05bd", { arg1: loadError }), 'error');
  tutorial = new Tutorial(controller, analytics, document.body);
  tutorial.start();
  // A village kept after a failed load, further along than this one: offer it back.
  void hud.offerRecovery().catch((e) => console.warn(i18nText("ui.could_not_check_for_kept_villages_1d0aca4f81"), e));

  // Sound: unlock on the first touch (iOS needs a gesture), tap clicks, event cues, music.
  document.addEventListener('pointerdown', () => sound.unlock(), { capture: true });
  document.addEventListener('click', (e) => {
    if ((e.target as Element | null)?.closest?.("button, [role=\"button\"]")) sound.play('tap');
  }, { capture: true });
  controller.onEvents((events) => {
    for (const e of events) {
      if (e.kind === 'raid_settled') {
        // The server's answer to an online attack.
        const r = e.record;
        if (e.outcome === 'confirmed') hud.toast(i18nText("ui.raid_on_confirmed_by_the_server_62aee4a29d", { arg1: r.opponentName, arg2: Object.values(r.banked ?? {}).some((v) => (v ?? 0) > 0) ? i18nText("ui.loot_banked_c1d50f49bf") : '' }), 'success');
        else hud.toast(i18nText("ui.the_server_did_not_accept_your_raid_on_844fc2eef5", { arg1: r.opponentName, arg2: rejectedWhy(r.rejected) }), 'error');
      } else if (e.kind === 'reward' && e.source.startsWith('season:')) hud.toast(i18nText("ui.the_league_season_ended_your_chest_was_ed31b9f094"), 'success');
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
        i18nText("ui.time_for_a_break_079e415422"),
        Object.assign(document.createElement('p'), { textContent: i18nLabel("You've been playing for an hour. How about a stretch and a glass of water? Your Village Artisans will keep working while you're away.") }),
        [{ label: i18nText("ui.keep_playing_b0b47d01a0"), primary: true, onClick: () => hud.closeAllModals() }],
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
        // A type the server pushes (the Alliance War) is not also scheduled on the device.
        const enabled = notifyPrefs.enabledSet(gd.notifications.types);
        for (const t of connection.pushTypes) enabled.delete(t);
        const planned = planNotifications(upcomingReminders(controller.state, controller.now(), gd), enabled, controller.now(), new Date().getTimezoneOffset(), gd);
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
  let retryingSave = false;
  controller.onSaveError((e) => {
    if (e instanceof SaveConflictError) {
      hud.showTakenOver();
      return;
    }
    // iOS closed the IndexedDB connection (app in the background): reopen it and save once more.
    if (db && !retryingSave) {
      retryingSave = true;
      void reconnected(db, e).then((ok) => {
        if (ok) void controller.save();
        setTimeout(() => (retryingSave = false), 5000);
      });
      if (!lastSaveWarning) {
        // The first lost connection is retried quietly; a second failure is shown below.
        lastSaveWarning = 1;
        return;
      }
    }
    if (Date.now() - lastSaveWarning < 60_000) return;
    lastSaveWarning = Date.now();
    hud.toast(i18nText("ui.your_village_could_not_be_saved_free_s_e56253c28f", { arg1: e.message }), 'error');
  });

  // Android Back (client re-audit item 6): close what is on top, leave a battle with a confirm, else ask before leaving.
  if (isNative() && platform() === 'android') {
    void import('@capacitor/app')
      .then(({ App: CapApp }) =>
        CapApp.addListener('backButton', () => {
          if (app?.inBattle) return battleBack();
          if (hud.closeTop()) return;
          void hud.confirm(i18nText("ui.leave_kagemura_0b798fad93"), i18nText("ui.your_village_is_saved_and_your_artisan_85332ff544"), i18nText("ui.leave_fc6e4a408d"), false, i18nText("ui.stay_08fd1de4b0")).then((leave) => {
            if (leave) void controller.save().finally(() => void CapApp.exitApp());
          });
        }),
      )
      .catch((e) => console.warn(i18nText("ui.back_button_unavailable_922733130d"), e));
  }

  // Battery (client re-audit item 17): the village drops to ~20 FPS after a few seconds without
  // input or game events, and comes back at the first touch, key, wheel or event. Never in battle.
  const loop = game.loop as unknown as { _limitRate: number; hasFpsLimit: boolean };
  const activeRate = loop._limitRate;
  const IDLE_RATE = 1000 / 21;
  const IDLE_AFTER_MS = 5000;
  let lastActive = performance.now();
  let idle = false;
  const active = () => {
    lastActive = performance.now();
    if (idle) {
      idle = false;
      loop._limitRate = activeRate;
    }
  };
  for (const t of ['pointerdown', 'pointermove', 'wheel', 'keydown', 'touchstart']) window.addEventListener(t, active, { capture: true, passive: true });
  controller.onEvents(() => active());
  window.setInterval(() => {
    if (app?.inBattle) return active();
    if (!idle && loop.hasFpsLimit && activeRate < IDLE_RATE && performance.now() - lastActive > IDLE_AFTER_MS) {
      idle = true;
      loop._limitRate = IDLE_RATE;
    }
  }, 1000);

  // The splash goes once the village's first frame is drawn; then the queued toasts and banners.
  await firstFrame;
  document.getElementById('boot')?.classList.add('done');
  bootGuard?.done();
  shown = true;
  earlyToasts.forEach(([text, kind], i) => setTimeout(() => showToast(text, kind), i * 1200));
  if (!store.persistent) {
    showBanner('tk-banner-save', i18nText("ui.this_browser_can_t_save_your_village_p_2206e03480"), [{ label: i18nText("ui.hide_ac20a57bfd"), onClick: (close) => close() }]);
  } else if (!sandbox && !isNative()) {
    void storageKept().then((kept) => {
      if (kept) return;
      // Safari (outside the Home Screen) and other browsers that refuse to keep storage may delete
      // the village after a week away: say how to keep it, at most once a week.
      persistAdvice = true;
      if (!persistPromptDue()) return;
      showBanner('tk-banner-persist', i18nText("ui.this_browser_may_delete_your_village_i_ae643ded55"), [
        { label: i18nText("ui.keep_it_safe_190db1d347"), onClick: (close) => { close(); snoozePersistPrompt(); openPersistAdvice(); } },
        { label: i18nText("ui.not_now_a0e63d7c71"), onClick: (close) => { close(); snoozePersistPrompt(); } },
      ]);
    });
  }
  // Report section 5 step 3 (device F6): opened from the iOS Home Screen with a brand-new village, the
  // player may have a village in Safari, which this app cannot see. Say so once.
  if (!sandbox && !isNative() && platformName() === 'ios' && standaloneWebApp() && !controller.state.tutorial.done && !homeScreenHintShown()) {
    markHomeScreenHintShown();
    hud.modal(
      i18nText("ui.played_in_safari_before_1b168b5abe"),
      (() => {
        const p = document.createElement('p');
        p.textContent = i18nText("ui.the_home_screen_app_keeps_its_own_vill_41ab3ab967");
        return p;
      })(),
      [{ label: i18nText("ui.ok_565339bc4d"), primary: true, onClick: () => hud.closeAllModals() }],
    );
  }
  if (!isNative()) registerServiceWorker((text) => hud.toast(text, 'info'));
}

/** Running as an installed web app (iOS Home Screen, or an installed PWA). */
function standaloneWebApp(): boolean {
  try {
    return (navigator as Navigator & { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches;
  } catch {
    return false;
  }
}

const HOME_SCREEN_HINT_KEY = 'tk.homeScreenHint';
function homeScreenHintShown(): boolean {
  try {
    return localStorage.getItem(HOME_SCREEN_HINT_KEY) === '1';
  } catch {
    return true; // storage blocked: never nag on every start
  }
}
function markHomeScreenHintShown(): void {
  try {
    localStorage.setItem(HOME_SCREEN_HINT_KEY, '1');
  } catch {
    /* storage blocked */
  }
}

boot().catch((e) => {
  console.error(e);
  bootGuard?.stop();
  crashReporter?.report(e, { kind: 'boot' });
  const el = document.getElementById('boot');
  if (!el) return;
  el.classList.remove('done');
  // Built with textContent: an error message is never markup (client re-audit item 11).
  const card = document.createElement('div');
  card.className = 'err';
  card.setAttribute('role', 'alert');
  const line = (text: string, cls?: string) => {
    const p = document.createElement('p');
    p.textContent = text;
    if (cls) p.className = cls;
    card.append(p);
    return p;
  };
  const button = (label: string, onClick: () => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn primary';
    b.textContent = label;
    b.style.margin = "8px 4px 0";
    b.addEventListener('click', onClick);
    card.append(b);
    return b;
  };
  const newer = e instanceof NewerSaveError;
  if (newer) {
    line(i18nText("ui.your_village_was_saved_by_a_newer_vers_7833d39835"));
    line(isNative() ? i18nText("ui.update_kagemura_from_then_open_it_agai_b145c71973", { arg1: platform() === 'ios' ? i18nText("ui.the_app_store_8768b638e4") : i18nText("ui.google_play_027b168468") }) : i18nText("ui.tap_update_to_get_the_newest_version_y_150542a397"), 'small');
  } else {
    line(i18nText("ui.something_went_wrong_starting_the_game_b41810f792"));
    line(String((e as Error)?.message ?? e), 'small');
  }
  const status = line('', 'small');
  const retry = button(newer && !isNative() ? i18nText("ui.update_c1c1009d3f") : i18nText("ui.retry_942087cc2d"), () => {
    retry.disabled = true;
    if (newer && !isNative()) void updateWebApp(async () => undefined, (t) => (status.textContent = t)).then((r) => {
      if (r !== 'reloading') location.reload();
    });
    else location.reload();
  });
  if (newer) {
    button(i18nText("ui.copy_save_code_3ac3ad4d9c"), () => {
      void (async () => {
        const raw = (await bootStore?.load().catch(() => null)) as SaveFile | null;
        if (!raw?.village) {
          status.textContent = i18nText("ui.no_save_could_be_read_on_this_device_ac5f04e7ad");
          return;
        }
        const code = encodeExportCode(raw);
        try {
          await navigator.clipboard.writeText(code);
          status.textContent = i18nText("ui.save_code_copied_load_it_in_settings_o_ceeaf51351");
        } catch {
          // No clipboard: show it for copying by hand.
          const box = document.createElement('textarea');
          box.readOnly = true;
          box.value = code;
          box.style.cssText = 'width:100%;min-height:80px;margin-top:8px;font-size:16px';
          card.append(box);
          box.select();
          status.textContent = i18nText("ui.copy_this_save_code_by_hand_d9cd7d7d1d");
        }
      })();
    });
  }
  el.replaceChildren(card);
});
