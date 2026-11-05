import { Capacitor } from '@capacitor/core';
import type { Analytics } from '../../backend/analytics/events';
import type { GameController, VillageBackup } from '../../gameplay/control/controller';
import type { SaveStore } from '../../backend/persist/saveStore';
import { buildingDef, hallType, levelDef } from '../../gameplay/sim/data';
import type { OfflineSummary } from '../../gameplay/sim/offline';
import { hallUnlocks, troopCapUnlock, type UnlockItem } from '../../gameplay/sim/preview';
import { capacity, collectorAmount, collectorCapacity, effectiveLevel, missingFor } from '../../gameplay/sim/resources';
import { decodeExportCode, deserialize, encodeExportCode, serialize } from '../../gameplay/sim/save';
import type { Building, Cost, ResourceKind } from '../../gameplay/sim/types';
import { RESOURCE_KINDS } from '../../gameplay/sim/types';
import { NAME_ERROR_TEXT, checkName, isolateName } from '../../gameplay/sim/social/names';
import { armyHousing, housingCapacity, troopUnlock } from '../../gameplay/sim/army';
import type { BattleRecord } from '../../gameplay/sim/battle/types';
import { replayable } from '../../gameplay/sim/battle/battle';
import { shieldHoursFor } from '../../gameplay/sim/defense';
import { leagueChest, leagueFor, nextLeague, seasonEndsAt } from '../../gameplay/sim/ranks';
import { achievementViews } from '../../gameplay/sim/achievements';
import { activeOffers } from '../../gameplay/sim/offers';
import { currentTasks, unlockedTier } from '../../gameplay/sim/pass';
import { ArmyUi } from './armyUi';
import { costChips, RES_LABEL } from './chips';
import { PROVIDER_NAMES, storeAgeBand } from '../../backend/platform/auth';
import { askAgeBand } from './ageScreen';
import { EconomyUi } from './economyUi';
import { DailyUi } from './dailyUi';
import { chestReady } from '../../gameplay/sim/daily';
import { sound } from '../audio/sound';
import { FriendsUi } from './friendsUi';
import { GangWarUi } from './gangWarUi';
import { GroveUi } from './groveUi';
import { WARRIORS, MODEL } from '../../gameplay/sim/progression';
import type { GroveSource } from '../../backend/social/groveSource';
import { Connection } from '../../backend/net/connection';
import { attacksLeft, raidPhase } from '../../gameplay/sim/social/groveRaid';
import { builderStatus, countOfType, hallLevel, limitFor, placeQuote, skipQuote, topUpQuote, upgradeQuote, type QuoteResult } from '../../gameplay/sim/village';
import { troopLevelOf } from '../../gameplay/sim/research';
import { role as roleDef, warriorUnlockKeep } from '../../gameplay/sim/progression';
import { canTryAlternate, nextTrialTier, trialInfo, trialReward, trialVariant } from '../../gameplay/sim/trials';
import type { UiBus } from './bus';
import { clear, h, icon } from './dom';
import { formatCompact, formatDuration, formatNumber } from './format';
import { icons } from './icons';
import { getQualityChoice, quality, setQualityChoice, type QualityChoice } from '../render/quality';

export interface HudDeps {
  root: HTMLElement;
  controller: GameController;
  bus: UiBus;
  analytics: Analytics;
  store: SaveStore;
  /** Data URL of a building's art, for the Build menu. */
  thumbnail(type: string): string | null;
  getFps(): number;
  debugTime: { offsetMs(): number; skip(ms: number): void };
  /** The testing sandbox (separate save, offline): only there are testing tools shown. */
  sandbox: boolean;
  build: { version: string; builtAt: string };
  troopThumb(type: string): string | null;
  /** Data URL of a roster warrior's badge icon, for the Warrior Codex. */
  warriorIcon(id: string): string | null;
  onAttack(): void;
  onReplay(record: BattleRecord): void;
  onGroveAttack(target: number): void;
  /** Start a Shadow Trial attack on this tier. */
  onTrial(tier: number): void;
  /** Open a practice battle with this army (nothing spent or won). */
  onPractice(army: Record<string, number>): void;
  /** A Friendly Duel (step 62). */
  onDuel?(friendId: string, friendName: string, opts?: { layout?: 'live' | 'duel'; challengeId?: string }): void;
  /** A Gang War strike (step 67). */
  onGangWarAttack?(target: number, relay: boolean, enemyName: string, bot: boolean): void;
  prefs: { get(k: 'sessionReminder' | 'reminders' | 'crashReports'): boolean; set(k: 'sessionReminder' | 'reminders' | 'crashReports', v: boolean): void };
  /** This build sends crash reports (it has a Sentry DSN): show the switch. */
  crashReports?: boolean;
  /** Sign-ins this device can give (account linking, roadmap step 24). */
  signIn?: import('../../backend/platform/auth').SignInSource;
  notifyPrefs: { get(id: string, fallback: boolean): boolean; set(id: string, v: boolean): void };
  onRemindersEnabled(): Promise<void>;
  /** Notifications switched on or off, or a type changed (server push follows the choices). */
  onNotificationsChanged?(): void;
  reminderNote: string;
  onReplayTutorial(): void;
  /** Where the Grove screen gets its Grove: the bot Grove offline, a real one online. */
  groveSource: GroveSource;
  /** Online play (status 'off' when no server is configured). */
  connection: Connection;
  /** The address a friend link opens (step 59); null: share codes only. */
  friendLinkBase?: () => string | null;
  /**
   * Web "Update Kagemura": fetch the new build through the service worker and reload (`backend/pwa/register`
   * `updateWebApp`, injected by the composition root because `pwa/` is not a backend contract file).
   */
  updateWebApp?(beforeReload: () => Promise<unknown>, note: (text: string) => void): Promise<'reloading' | 'current' | 'timeout' | 'unavailable'>;
}

/** localStorage: the kept village already offered at start-up. */
const RECOVERY_SEEN_KEY = 'tk.recoveryOffered';

export class Hud {
  private readonly c: GameController;
  private readonly bus: UiBus;
  private readonly root: HTMLElement;
  private selectedId: string | null = null;
  private placementActive = false;

  private resEls = new Map<ResourceKind, { amt: HTMLElement; bar: HTMLElement; cap: HTMLElement | null }>();
  private buildersEl!: HTMLElement;
  private trophiesEl!: HTMLElement;
  private shieldEl!: HTMLElement;
  private shieldBox!: HTMLElement;
  private netPill!: HTMLElement;
  private unlocksEl!: HTMLElement;
  private sheet!: HTMLElement;
  private placeBar!: HTMLElement;
  private placeOk!: HTMLButtonElement;
  private bottomBar!: HTMLElement;
  private rail!: HTMLElement;
  private toasts!: HTMLElement;
  private modalRoot!: HTMLElement;
  private fpsEl!: HTMLElement;
  private showFps = false;
  private openModals = new Set<() => void>();
  readonly econ: EconomyUi;
  readonly grove: GroveUi;
  readonly friends: FriendsUi;
  private friendsBtn: HTMLElement | null = null;
  readonly daily: DailyUi;
  private readonly army: ArmyUi;
  private armyPill = h('span', { class: 'army-pill' });
  private eventChip!: HTMLElement;
  private railBadges: Record<string, HTMLElement> = {};
  /** True while a finger/mouse is pressed on the panel: never rebuild it mid-tap. */
  private sheetPressed = false;
  private sheetSig = '';

  constructor(private readonly deps: HudDeps) {
    this.c = deps.controller;
    this.bus = deps.bus;
    this.root = deps.root;
    try {
      this.showFps = localStorage.getItem('tk.showFps') === '1';
    } catch {
      /* storage blocked: keep default */
    }
    this.econ = new EconomyUi({
      c: this.c,
      modal: (...a) => this.modal(...a),
      confirm: (...a) => this.confirm(...a),
      toast: (...a) => this.toast(...a),
      closeAllModals: () => this.closeAllModals(),
    });
    this.grove = new GroveUi({
      kit: { c: this.c, modal: (...a) => this.modal(...a), confirm: (...a) => this.confirm(...a), toast: (...a) => this.toast(...a), closeAllModals: () => this.closeAllModals() },
      source: this.deps.groveSource,
      troopThumb: (t) => this.deps.troopThumb(t),
      onGroveAttack: (i) => this.deps.onGroveAttack(i),
    });
    const gangWar = new GangWarUi({
      kit: { c: this.c, modal: (...a) => this.modal(...a), confirm: (...a) => this.confirm(...a), toast: (...a) => this.toast(...a), closeAllModals: () => this.closeAllModals() },
      connection: this.deps.connection,
      onAttack: this.deps.onGangWarAttack ? (t, relay, name, bot) => this.deps.onGangWarAttack!(t, relay, name, bot) : undefined,
    });
    this.friends = new FriendsUi({
      war: (body, redraw, leader, members) => gangWar.draw(body, redraw, leader, members),
      kit: { c: this.c, modal: (...a) => this.modal(...a), confirm: (...a) => this.confirm(...a), toast: (...a) => this.toast(...a), closeAllModals: () => this.closeAllModals() },
      connection: this.deps.connection,
      shareBase: () => this.deps.friendLinkBase?.() ?? null,
      platform: this.deps.signIn,
      onDuel: (id, name, opts) => this.deps.onDuel?.(id, name, opts),
      onReplay: (r) => this.deps.onReplay(r),
      // Real raiders (never simulated ones) and Alliance mates.
      suggestions: () => [
        ...this.c.state.battleLog.filter((r) => r.kind === 'defense' && !r.simulated).map((r) => r.opponentName),
        ...this.deps.groveSource.snapshot().members.filter((m) => !m.you && this.deps.groveSource.snapshot().kind === 'online').map((m) => m.name),
      ],
    });
    this.daily = new DailyUi({ c: this.c, modal: (...a) => this.modal(...a), confirm: (...a) => this.confirm(...a), toast: (...a) => this.toast(...a), closeAllModals: () => this.closeAllModals() });
    this.army = new ArmyUi({
      kit: { c: this.c, modal: (...a) => this.modal(...a), confirm: (...a) => this.confirm(...a), toast: (...a) => this.toast(...a), closeAllModals: () => this.closeAllModals() },
      econ: this.econ,
      troopThumb: (t) => this.deps.troopThumb(t),
      onPractice: (army) => this.deps.onPractice(army),
      openBuildArmy: () => this.openBuildArmy(),
      openCodex: () => this.openCodex(),
    });
    this.buildSkeleton();
    this.c.subscribe(() => this.refresh());
    // Re-audit (minors online): before this device first goes online, the store's age signal or,
    // without one, the neutral age screen sets the age band. "Not now" keeps online play off.
    this.deps.connection.ageGate = async () =>
      (await storeAgeBand()) ??
      askAgeBand(
        { c: this.c, modal: (...a) => this.modal(...a) },
        'Online play connects you with other players. Please enter your year of birth so we can choose the right settings for your age.',
      );
    this.deps.connection.subscribe(() => this.updateNet());
    this.deps.connection.subscribe(() => this.showNewNotices());
    this.updateNet();
    this.deps.groveSource.subscribe(() => this.refresh());
    this.c.onOffer((rule) => this.econ.showOffer(rule));
    this.bus.on('select', (id) => {
      this.selectedId = id;
      this.renderSheet();
    });
    this.bus.on('placement:changed', ({ active, valid }) => {
      this.placementActive = active;
      this.placeBar.hidden = !active;
      this.bottomBar.hidden = active;
      this.rail.hidden = active;
      this.placeOk.disabled = !valid;
      if (active) this.sheet.hidden = true;
    });
    this.bus.on('toast', ({ text, kind }) => this.toast(text, kind));
    this.bus.on('placement:buy', (p) => void this.buyAndPlace(p.buildingType, p.x, p.y));
    window.setInterval(() => this.everySecond(), 1000);
    window.setInterval(() => {
      if (this.showFps) this.fpsEl.textContent = `${Math.round(this.deps.getFps())} fps`;
    }, 500);
    this.refresh();
  }

  // ------------------------------------------------------------ skeleton

  private buildSkeleton(): void {
    const top = h('div', { class: 'hud-top' });
    for (const k of ['acorns', 'dew'] as ResourceKind[]) {
      const amt = h('span', { class: 'res-amt' });
      const cap = h('span', { class: 'res-cap' });
      const fill = h('i');
      top.append(h('div', { class: `res res-${k}`, title: RES_LABEL[k] }, icon(icons[k as 'acorns' | 'dew'], 'res-icon'), h('div', { class: 'res-body' }, amt, h('div', { class: 'res-bar' }, fill), cap)));
      this.resEls.set(k, { amt, bar: fill, cap });
    }
    const moonAmt = h('span', { class: 'res-amt' });
    const moonBtn = h('div', { class: 'res res-moonstones', title: 'Jade: tap for the store', role: 'button' }, icon(icons.moonstones, 'res-icon'), h('div', { class: 'res-body' }, moonAmt), h('span', { class: 'res-plus' }, '+'));
    moonBtn.addEventListener('click', () => this.econ.openStore());
    top.append(moonBtn);
    this.resEls.set('moonstones', { amt: moonAmt, bar: h('i'), cap: null });
    this.buildersEl = h('span', { class: 'res-amt' });
    top.append(h('div', { class: 'res res-builders', title: 'Free Village Artisans' }, icon(icons.beaver, 'res-icon'), h('div', { class: 'res-body' }, this.buildersEl)));
    this.trophiesEl = h('span', { class: 'res-amt' });
    const trophyBtn = h('div', { class: 'res res-trophies', title: 'Honor', role: 'button' }, icon(icons.leaf, 'res-icon'), h('div', { class: 'res-body' }, this.trophiesEl));
    trophyBtn.addEventListener('click', () => this.openLeague());
    top.append(trophyBtn);
    this.shieldEl = h('span', { class: 'res-amt' });
    this.shieldBox = h('div', { class: 'res res-shield', title: 'Shield: no raids until it runs out' }, icon(icons.shield, 'res-icon'), h('div', { class: 'res-body' }, this.shieldEl));
    top.append(this.shieldBox);
    this.netPill = h('button', { class: 'net-pill', type: 'button', title: 'Online play', onclick: () => this.openSettings(true) });
    this.netPill.hidden = !this.deps.connection.enabled;
    top.append(this.netPill);

    this.unlocksEl = h('button', { class: 'unlocks', type: 'button', onclick: () => this.openUnlocks() });
    this.eventChip = h('button', { class: 'event-chip', type: 'button', 'aria-label': 'Events', onclick: () => this.daily.openEvents() });
    this.toasts = h('div', { class: 'toasts', 'aria-live': 'polite' });
    this.fpsEl = h('div', { class: 'fps' });
    this.fpsEl.hidden = !this.showFps;

    this.bottomBar = h(
      'div',
      { class: 'hud-bottom' },
      h(
        'div',
        { class: 'group' },
        h('button', { class: 'round-btn', type: 'button', 'aria-label': 'Settings', onclick: () => this.openSettings() }, icon(icons.gear)),
        h('button', { class: 'round-btn', type: 'button', 'aria-label': 'Battle log', onclick: () => this.openLog() }, icon(icons.scroll)),
        h('button', { class: 'round-btn', type: 'button', 'aria-label': 'Army', onclick: () => this.openTraining() }, icon(icons.troops), this.armyPill),
      ),
      h(
        'div',
        { class: 'group' },
        h('button', { class: 'round-btn big attack', type: 'button', 'aria-label': 'Attack', onclick: () => this.deps.onAttack() }, icon(icons.swords), h('span', {}, 'Attack')),
        h('button', { class: 'round-btn big build', type: 'button', 'aria-label': 'Build', onclick: () => this.openShop() }, icon(icons.hammer), h('span', {}, 'Build')),
      ),
    );

    this.placeOk = h('button', { class: 'round-btn ok', type: 'button', 'aria-label': 'Place here', onclick: () => this.bus.emit('placement:confirm') }, icon(icons.check));
    this.placeBar = h(
      'div',
      { class: 'place-bar' },
      h('button', { class: 'round-btn cancel', type: 'button', 'aria-label': 'Cancel', onclick: () => this.bus.emit('placement:cancel') }, icon(icons.close)),
      h('div', { class: 'place-hint' }, 'Drag the building, or tap where it should go'),
      this.placeOk,
    );
    this.placeBar.hidden = true;

    this.sheet = h('div', { class: 'sheet' });
    this.sheet.hidden = true;
    this.sheet.addEventListener('pointerdown', () => (this.sheetPressed = true));
    const release = () => window.setTimeout(() => (this.sheetPressed = false), 80);
    this.sheet.addEventListener('pointerup', release);
    this.sheet.addEventListener('pointercancel', release);
    this.sheet.addEventListener('pointerleave', release);
    this.modalRoot = h('div', { class: 'modal-root' });

    const head = h('div', { class: 'hud-head' }, top, h('div', { class: 'head-row' }, this.unlocksEl, this.eventChip), this.toasts);
    const railBtn = (label: string, ic: string, onClick: () => void) => {
      const badge = h('span', { class: 'badge' });
      badge.hidden = true;
      this.railBadges[label] = badge;
      return h('button', { class: 'round-btn', type: 'button', 'aria-label': label, onclick: onClick }, icon(ic), badge);
    };
    const rail = h(
      'div',
      { class: 'side-rail' },
      railBtn('Daily', icons.chest, () => this.daily.openDaily()),
      railBtn('Store', icons.moonstones, () => this.econ.openStore(activeOffers(this.c.state, this.c.now()).length ? 'offers' : 'moonstones')),
      railBtn('Pass', icons.lantern, () => this.econ.openPass()),
      railBtn('Goals', icons.star, () => this.econ.openGoals()),
      railBtn('Alliance', icons.grove, () => this.grove.open()),
      (this.friendsBtn = railBtn('Friends', icons.friends, () => this.friends.open())),
      railBtn('Trials', icons.leaf, () => this.openTrials()),
    );
    this.rail = rail;
    this.root.append(head, rail, this.fpsEl, this.bottomBar, this.placeBar, this.sheet, this.modalRoot);
  }

  // ------------------------------------------------------------ refresh

  private refresh(): void {
    const s = this.c.state;
    const gd = this.c.data;
    const cap = capacity(s, gd);
    for (const [k, el] of this.resEls) {
      el.amt.textContent = formatNumber(s.resources[k]);
      if (el.cap) {
        el.cap.textContent = `/ ${formatCompact(cap[k])}`;
        el.bar.style.width = `${Math.min(100, (s.resources[k] / Math.max(1, cap[k])) * 100)}%`;
        el.bar.parentElement!.classList.toggle('full', s.resources[k] >= cap[k]);
      }
    }
    const bs = builderStatus(s, gd, this.c.now());
    this.buildersEl.textContent = `${bs.free}/${bs.total}`;
    this.trophiesEl.textContent = String(s.trophies);
    this.updateShield();
    this.updateBadges();
    this.renderUnlockChip();
    this.renderSheet();
  }

  private updateBadges(): void {
    const s = this.c.state;
    const gd = this.c.data;
    const hl = hallLevel(s, gd);
    const set = (k: string, n: number) => {
      const b = this.railBadges[k];
      if (!b) return;
      b.hidden = n <= 0;
      b.textContent = String(n);
    };
    const campSpace = housingCapacity(s, gd);
    const ready = armyHousing(s.army, gd);
    this.armyPill.hidden = campSpace === 0;
    this.armyPill.textContent = `${ready}/${campSpace}`;
    this.armyPill.classList.toggle('busy', s.training.some((q) => q.endsAt > this.c.now()));
    this.armyPill.classList.toggle('full', ready >= campSpace);
    set('Store', activeOffers(s, this.c.now()).length);
    set('Daily', chestReady(s, this.c.now(), gd) ? 1 : 0);
    const tier = unlockedTier(s, gd);
    const tiersReady = gd.pass.tiers.filter((t) => t.tier <= tier && (!s.pass.claimedFree.includes(t.tier) || (s.pass.premium && !s.pass.claimedPremium.includes(t.tier)))).length;
    const tasksReady = currentTasks(s, hl, gd).filter((t) => !t.claimed && t.progress >= t.target).length;
    set('Pass', tiersReady + tasksReady);
    set('Goals', achievementViews(s, hl, gd).filter((v) => v.claimable).length);
    const live = raidPhase(this.c.now(), gd);
    if (this.deps.groveSource.kind === 'online') {
      const g = this.deps.groveSource.snapshot();
      set('Alliance', g.joined ? (g.raid.phase === 'live' ? g.raid.attacksLeft : 0) + g.requests.length : g.loading ? 0 : 1);
    } else {
      set('Alliance', s.grove.joined ? (live.phase === 'live' ? attacksLeft(s, live.week, gd) : 0) + s.grove.requests.length : 1);
    }
  }

  private static readonly NET_LABEL: Record<string, string> = { off: 'Offline play', connecting: 'Connecting…', online: 'Online', offline: 'No connection', incompatible: 'Update needed', suspended: 'Suspended' };

  /** Shown once per session when the server can no longer check this game (roadmap step 75). */
  private updateNoticeShown = false;

  /**
   * Open the store listing (apps), or fetch the new build and reload (web: save first, wait for the
   * service worker's new version, never reload into the same one; client re-audit item 11).
   */
  private openUpdate(): void {
    const url = this.deps.connection.updateUrl;
    if (url) {
      window.open(url, '_blank', 'noopener');
      return;
    }
    if (Capacitor.isNativePlatform()) {
      // A store build without a listing link: say what to do instead of doing nothing.
      const store = Capacitor.getPlatform() === 'ios' ? 'the App Store' : 'Google Play';
      this.modal('Update Kagemura', h('p', {}, `Open ${store}, find Kagemura and tap Update. Your village is saved on this device and on the server.`), [{ label: 'OK', primary: true, onClick: () => this.closeAllModals() }]);
      return;
    }
    const status = h('p', { role: 'status' }, 'Saving your village…');
    let close = () => {};
    close = this.modal('Update Kagemura', status, []);
    const update = this.deps.updateWebApp ?? (async (before: () => Promise<unknown>) => (await before().catch(() => undefined), location.reload(), 'reloading' as const));
    void update(() => this.c.save(), (text) => (status.textContent = text)).then((r) => {
      if (r === 'reloading') return;
      status.textContent =
        r === 'current'
          ? 'No newer version is available here yet: it may still be on its way. Try again in a little while; your village keeps working on this device.'
          : 'The new version could not be downloaded right now. Check your connection and try again.';
      const foot = h('div', { class: 'modal-foot' }, h('button', { class: 'btn primary', type: 'button', onclick: () => close() }, 'OK'));
      status.after(foot);
    });
  }

  private showUpdateNeeded(): void {
    const conn = this.deps.connection;
    const body = h(
      'div',
      {},
      h('p', {}, conn.lastError || 'A new version of Kagemura is out, and online play needs it.'),
      h('p', { class: 'muted' }, 'Online battles, raids and your Alliance pause until you update. Your village is safe: everything else keeps working on this device.'),
    );
    let close = () => {};
    close = this.modal('Update Kagemura', body, [
      { label: 'Later', onClick: () => close() },
      { label: conn.updateUrl ? 'Update' : 'Reload', primary: true, onClick: () => this.openUpdate() },
    ]);
  }

  /** Open Friends, looking up a name or code (a friend link). */
  openFriends(search?: string): void {
    this.friends.open(search);
  }

  private updateNet(): void {
    const conn = this.deps.connection;
    if (this.friendsBtn) this.friendsBtn.hidden = !conn.canFriends;
    if (conn.status === 'incompatible' && !this.updateNoticeShown) {
      this.updateNoticeShown = true;
      this.showUpdateNeeded();
    }
    this.netPill.hidden = !conn.enabled;
    this.netPill.className = `net-pill ${conn.status}`;
    this.netPill.textContent = Hud.NET_LABEL[conn.status] ?? conn.status;
    const queued = conn.enabled ? conn.outbox().length : 0;
    if (queued) this.netPill.textContent += ` · ${queued} to send`;
    if (conn.newDefenses > 0) {
      const n = conn.newDefenses;
      conn.newDefenses = 0;
      this.toast(`${n} player${n > 1 ? 's' : ''} raided your village. See the battle log.`, 'info');
    }
  }

  /** Settings section: server address, status, name and the leaderboard. */
  private onlineSection(): HTMLElement {
    const conn = this.deps.connection;
    const wrap = h('div', { class: 'online-settings' });
    const draw = () => {
      clear(wrap);
      const status = h('p', {}, h('span', { class: `net-pill inline ${conn.status}` }, Hud.NET_LABEL[conn.status] ?? conn.status), ' ', conn.enabled ? h('span', { class: 'muted small' }, conn.url) : '');
      wrap.append(h('h3', {}, 'Online play'), status);
      // A test server says so (roadmap step 42): progress there is not the real game's.
      const env = conn.server?.environment;
      if (env && env !== 'production') wrap.append(h('p', { class: 'muted small' }, `This is a ${env} server for testing: villages and purchases here are separate from the real game.`));
      if (conn.server?.notice) wrap.append(h('p', { class: 'store-note' }, conn.server.notice));
      if (!conn.enabled) {
        wrap.append(h('p', { class: 'muted' }, 'You are playing on your own: opponents, raiders and your Alliance are friendly bots. Enter a Kagemura: Ninja Clans server address to raid real players and join real Alliances.'));
        // Re-audit: "Play offline" keeps the online account; it can still be deleted from here.
        for (const url of conn.storedAccounts()) wrap.append(this.storedAccountBlock(url, draw));
      } else {
        wrap.append(h('p', { class: 'muted' }, 'Real players raid your village instead of bots, the opponents you scout are real villages (or wild ones when nobody fits), and your Alliance is a real Alliance. Your village itself still lives on this device.'));
        if (conn.lastError && conn.status !== 'online') wrap.append(h('p', { class: 'note' }, conn.lastError));
        if (conn.status === 'incompatible') wrap.append(h('p', {}, h('button', { class: 'btn primary', type: 'button', onclick: () => this.openUpdate() }, conn.updateUrl ? 'Update Kagemura' : 'Reload to update')));
        if (conn.player) {
          const name = h('input', { class: 'text', type: 'text', dir: 'auto', autocomplete: 'nickname', spellcheck: 'false', value: conn.player.name }) as HTMLInputElement;
          name.addEventListener('keydown', (e) => e.stopPropagation());
          const save = h('button', { class: 'btn ghost', type: 'button' }, 'Rename');
          save.addEventListener('click', () => {
            // Any script works (names.ts); the server applies the same rules.
            const checked = checkName(name.value);
            if (checked.error) return this.toast(NAME_ERROR_TEXT[checked.error], 'error');
            name.value = checked.name;
            void conn.rename(checked.name).then(
              () => this.toast('Name saved.', 'success'),
              (e: Error) => this.toast(e.message, 'error'),
            );
          });
          wrap.append(h('label', { class: 'muted small' }, 'Your name in online play'), h('div', { class: 'chat-input-row' }, name, save));
          const board = h('div', { class: 'events' }, 'Loading…');
          // Two ladders: Honor (leagues) and, when the server has it, the Power Ranking (skill plus Keep).
          let which: 'honor' | 'power' = 'honor';
          const hasPower = Boolean(conn.server?.features.includes('power-ranking'));
          const tabs = h('div', { class: 'shop-tabs' });
          const load = () => {
            const port = conn.port;
            if (!port) return;
            board.textContent = 'Loading…';
            clear(tabs);
            if (hasPower) {
              for (const [id, label] of [['honor', 'Honor'], ['power', 'Power']] as const) {
                const b = h('button', { type: 'button', class: id === which ? 'on' : '' }, label);
                b.addEventListener('click', () => {
                  which = id;
                  load();
                });
                tabs.append(b);
              }
            }
            const row = (rank: number, name: string, sub: string, value: string, chip: Node | null) =>
              h('div', { class: `log-row${name === conn.player?.name ? ' current' : ''}` }, h('div', {}, h('b', {}, `${rank}. ${isolateName(name)}`), h('div', { class: 'muted small' }, sub)), h('span', { class: 'chip' }, chip, value));
            const fail = (e: Error) => {
              board.textContent = e.message;
            };
            if (which === 'power') {
              void port.powerLeaderboard(30).then((lb) => {
                clear(board);
                board.append(h('p', { class: 'muted small' }, 'Power is your skill as an attacker plus the strength of your Keep, from your rated raids.'));
                for (const p of lb.players) board.append(row(p.rank, p.name, `Clan Keep ${p.hallLevel}${p.grove ? ` · ${isolateName(p.grove)}` : ''}`, String(p.power), null));
                board.append(h('p', { class: 'muted small' }, lb.me ? `You are number ${lb.me.rank}, with ${lb.me.power} power.` : 'Raid real players a few times to get on the Power Ranking.'));
                if (!lb.players.length) board.append('Nobody is on it yet.');
              }, fail);
              return;
            }
            void port.leaderboard(30).then((lb) => {
              clear(board);
              for (const p of lb.players) board.append(row(p.rank, p.name, `Clan Keep ${p.hallLevel}${p.grove ? ` · ${isolateName(p.grove)}` : ''}`, String(p.trophies), icon(icons.leaf)));
              if (lb.me) board.append(h('p', { class: 'muted small' }, `You are number ${lb.me.rank}.`));
              if (!lb.players.length) board.append('Nobody is ranked yet.');
            }, fail);
          };
          const details = h('details', {}, h('summary', {}, 'Leaderboard'), tabs, board);
          details.addEventListener('toggle', () => {
            if (details.open) load();
          });
          wrap.append(details);
          if (conn.canKeepVillage || conn.serverVillage) wrap.append(this.villageBlock());
          wrap.append(this.accountBlock());
        }
        const retry = h('button', { class: 'btn ghost', type: 'button' }, 'Connect now');
        retry.addEventListener('click', () => {
          conn.askAgeAgain();
          void conn.sync().then(draw);
        });
        if (conn.status !== 'online') wrap.append(h('div', { class: 'actions' }, retry));
      }
      const chosen = Connection.chosen();
      const addr = h('input', { class: 'text', type: 'url', inputmode: 'url', autocapitalize: 'off', spellcheck: 'false', placeholder: 'https://your-server.example.com', value: chosen && chosen !== 'off' ? chosen : '' }) as HTMLInputElement;
      addr.addEventListener('keydown', (e) => e.stopPropagation());
      const apply = (value: string) => {
        Connection.choose(value);
        this.toast('Restarting to switch servers…', 'info');
        void this.c.save().then(() => window.setTimeout(() => location.reload(), 600));
      };
      wrap.append(
        h('label', { class: 'muted small' }, 'Server address'),
        h('div', { class: 'chat-input-row' }, addr, h('button', { class: 'btn ghost', type: 'button', onclick: () => apply(addr.value || '') }, 'Use')),
        h(
          'div',
          { class: 'actions' },
          conn.enabled ? h('button', { class: 'btn ghost', type: 'button', onclick: () => apply('off') }, 'Play offline') : null,
          chosen ? h('button', { class: 'btn ghost', type: 'button', onclick: () => apply('') }, 'Use the built-in setting') : null,
        ),
        h('p', { class: 'muted small' }, 'Switching servers restarts the game. Your village stays on this device either way.'),
      );
    };
    draw();
    const unsub = conn.subscribe(draw);
    // Stop listening once the Settings window is gone.
    const obs = new MutationObserver(() => {
      if (!wrap.isConnected) {
        unsub();
        obs.disconnect();
      }
    });
    window.setTimeout(() => obs.observe(document.body, { childList: true, subtree: true }), 0);
    return wrap;
  }

  /** A ledger reason in words (the codes come from the server: command:<type>, attack:loot, …). */
  static ledgerReason(code: string): string {
    const words: Record<string, string> = {
      start: 'Starting resources',
      'command:collect': 'Collected',
      'command:place': 'Built',
      'command:upgrade': 'Upgrade',
      'command:cancel': 'Cancelled (refund)',
      'command:clear': 'Cleared',
      'command:train': 'Training',
      'command:trainArmy': 'Training',
      'command:dismiss': 'Sent warriors home',
      'command:cancelTraining': 'Training cancelled',
      'command:research': 'Research',
      'command:cancelResearch': 'Research cancelled',
      'command:skip': 'Finished with Jade',
      'command:skipTraining': 'Finished with Jade',
      'command:skipResearch': 'Finished with Jade',
      'command:topUp': 'Bought with Jade',
      'command:openDailyChest': 'Daily chest',
      'command:scout': 'Next opponent',
      'command:trialEnd': 'Shadow Trial',
      'command:buySkin': 'Look bought',
      'command:claimTask': 'Task reward',
      'command:claimTier': 'Pass reward',
      'command:claimAchievement': 'Achievement',
      'purchase:unverified': 'Purchase',
      'attack:loot': 'Raid loot',
      'attack:loot:uploaded-base': 'Raid loot',
      'attack:loot:generated-base': 'Raid loot',
      'defense:loss': 'Raided',
      'war:chest': 'Alliance War chest',
      'donation:sent': 'Warriors sent',
      'donation:received': 'Warriors received',
    };
    return words[code] ?? code;
  }

  /** Settings → Online play → Village on the server (beta, roadmap Phase 2). */
  private villageBlock(): HTMLElement {
    const conn = this.deps.connection;
    const sync = conn.village!;
    const box = h('div', { class: 'village-server' }, h('h3', {}, 'Village on the server (beta)'));
    if (sync.active) {
      box.append(
        h('p', { class: 'muted small' }, 'Your village is kept on the server: every change to its resources, buildings, army and research is checked there, so it cannot be lost with this device. What you do is sent as you play; while offline it waits and goes when you reconnect.'),
        h('p', { class: 'small' }, sync.pending ? `${sync.pending} action${sync.pending === 1 ? '' : 's'} waiting to send.` : 'Everything is sent.'),
      );
      const list = h('div', { class: 'events' }, 'Loading…');
      const ledger = h('details', {}, h('summary', {}, 'Recent changes'), list);
      ledger.addEventListener('toggle', () => {
        if (!ledger.open || !conn.port) return;
        void conn.port.ledger(30).then(
          ({ entries }) => {
            clear(list);
            if (!entries.length) list.append('Nothing yet.');
            for (const e of entries) list.append(h('div', { class: 'event' }, h('b', {}, `${e.delta > 0 ? '+' : ''}${formatNumber(e.delta)} ${RES_LABEL[e.resource as keyof typeof RES_LABEL] ?? e.resource}`), ` ${Hud.ledgerReason(e.reason)} · ${new Date(e.at).toLocaleString()}`));
          },
          (e: Error) => {
            list.textContent = e.message;
          },
        );
      });
      box.append(ledger);
      return box;
    }
    const go = (how: 'new' | 'move') => async () => {
      const ok = await this.confirm(
        how === 'move' ? 'Move this village to the server?' : 'Start a new village on the server?',
        how === 'move'
          ? 'Your village moves to the server as it is, if it is a village its Keep could really have. From then on every change is checked there, and you can play it on other devices by linking a sign-in.'
          : 'This starts a new village that is kept on the server. The village on this device stays as a backup you can restore in Settings.',
        how === 'move' ? 'Move it' : 'Start a new one',
        false,
        'Not now',
      );
      if (!ok) return;
      try {
        await sync.enable(how);
        this.toast(how === 'move' ? 'Your village is now kept on the server.' : 'Your new village is kept on the server.', 'success');
        this.closeAllModals();
      } catch (e) {
        this.toast((e as Error).message, 'error');
      }
    };
    const canMove = Boolean(conn.server?.features.includes('village-import'));
    const move = h('button', { class: 'btn primary', type: 'button' }, 'Move this village to the server');
    move.addEventListener('click', () => void go('move')());
    const start = h('button', { class: 'btn ghost', type: 'button' }, canMove ? 'Start a new one there' : 'Start a village on the server');
    start.addEventListener('click', () => void go('new')());
    const refused = conn.villageMoveRefused;
    box.append(h('p', { class: 'muted small' }, 'Keep your village on the server, so it cannot be lost with this device and every change is checked there.'));
    if (refused) box.append(h('p', { class: 'note' }, `The server could not take this village: ${refused}`));
    box.append(h('div', { class: 'actions' }, canMove && !refused ? move : null, start));
    return box;
  }

  /**
   * Settings → Online play → Account: the Player ID (for support and the web
   * deletion form) and in-game account deletion (Apple 5.1.1(v)).
   */
  private accountBlock(): HTMLElement {
    const conn = this.deps.connection;
    const id = conn.player?.id ?? '';
    const idBox = h('input', { class: 'text mono', type: 'text', readonly: true, value: id, 'aria-label': 'Player ID' }) as HTMLInputElement;
    idBox.addEventListener('focus', () => idBox.select());
    const copy = h('button', { class: 'btn ghost', type: 'button' }, 'Copy');
    copy.addEventListener('click', () => {
      idBox.select();
      const done = () => this.toast('Player ID copied.', 'success');
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(id).then(done, () => this.toast('Select the ID and copy it.', 'info'));
      else this.toast('Select the ID and copy it.', 'info');
    });
    const del = h('button', { class: 'btn danger', type: 'button' }, 'Delete online account');
    del.addEventListener('click', () => void this.deleteOnlineAccount());
    const webForm = `${conn.url}/account/delete`;
    // Re-audit: a one-time code proves a web deletion request is yours; other devices can be signed out.
    const codeBox = h('div', {});
    const getCode = h('button', { class: 'btn ghost', type: 'button' }, 'Get a deletion code');
    getCode.addEventListener('click', () => void conn.deletionCode().then((c) => this.showDeletionCode(codeBox, c, webForm), (e: Error) => this.toast(e.message, 'error')));
    const others = h('button', { class: 'btn ghost', type: 'button' }, 'Sign out other devices');
    others.addEventListener('click', () => void this.signOutOthers());
    const noticesBox = h('div', {});
    // Blocked players (blocked from Alliance chat or the member list), with Unblock.
    const blockedList = h('div', { class: 'events' });
    const blockedWrap = conn.server?.features.includes('blocks') ? h('div', {}, h('label', { class: 'muted small' }, 'Blocked players'), blockedList) : null;
    const loadBlocked = () => {
      const port = conn.port;
      if (!port || !blockedWrap) return;
      void port.blocks().then(
        ({ blocked }) => {
          clear(blockedList);
          if (!blocked.length) blockedList.append(h('p', { class: 'muted small' }, 'Nobody. To block a player, tap ⋯ next to their name in Alliance chat or the member list.'));
          for (const b of blocked) {
            const un = h('button', { class: 'btn ghost', type: 'button' }, 'Unblock');
            un.addEventListener('click', () => void port.unblock(b.id).then(loadBlocked, (e: Error) => this.toast(e.message, 'error')));
            blockedList.append(h('div', { class: 'log-row' }, h('b', {}, b.name), un));
          }
        },
        (e: Error) => {
          blockedList.textContent = e.message;
        },
      );
    };
    // Linked sign-ins: keep this account on other devices (cloud save), or switch this device to one.
    const signIns = h('div', {});
    const loadLinks = () => {
      const port = conn.port;
      const source = this.deps.signIn;
      if (!port || !source) return;
      void port.links().then(
        ({ providers, links }) => {
          clear(signIns);
          const here = source.available().filter((p) => providers.includes(p));
          if (!here.length) return;
          signIns.append(h('label', { class: 'muted small' }, 'Sign-ins (play this account on other devices)'));
          for (const p of here) {
            const linked = links.some((l) => l.provider === p);
            const name = PROVIDER_NAMES[p];
            const act = h('button', { class: 'btn ghost', type: 'button' }, linked ? 'Unlink' : `Link ${name}`);
            act.addEventListener('click', () => {
              const run = linked ? port.unlink(p) : source.obtain(p).then((cred) => conn.link(p, cred));
              void run.then(
                () => {
                  this.toast(linked ? `${name} unlinked.` : `${name} linked. Sign in with it on another device to play this account there.`, 'success');
                  loadLinks();
                },
                (e: Error) => this.toast(e.message, 'error'),
              );
            });
            signIns.append(h('div', { class: 'log-row' }, h('b', {}, `${name}${linked ? ' · linked' : ''}`), act));
          }
          const switchRow = h('div', { class: 'actions' });
          for (const p of here) {
            const b = h('button', { class: 'btn ghost', type: 'button' }, `Sign in with ${PROVIDER_NAMES[p]}`);
            b.addEventListener('click', () => void this.switchAccount(p));
            switchRow.append(b);
          }
          signIns.append(h('p', { class: 'muted small' }, 'Already linked an account on another device? Sign in with it here to play that account.'), switchRow);
        },
        () => clear(signIns),
      );
    };
    const details = h(
      'details',
      { class: 'account-settings' },
      h('summary', {}, 'Account'),
      h('label', { class: 'muted small' }, 'Player ID (for support, and for deletion requests)'),
      h('div', { class: 'chat-input-row' }, idBox, copy),
      signIns,
      blockedWrap,
      h('p', { class: 'muted small' }, 'Deleting your online account removes your player name, the base you share for raids, raids on you, your Alliance membership, chat messages and troop requests from the server. Raids you made stay in other players\' replays as "Deleted player". Your village on this device stays.'),
      h('div', { class: 'actions' }, del),
      h('p', { class: 'muted small' }, 'Deleting from another device or the web: get a one-time deletion code here, then enter it with your Player ID on ', h('a', { href: webForm, target: '_blank', rel: 'noopener' }, webForm), '. It works once, for 30 days.'),
      conn.server?.features.includes('deletion-codes') ? h('div', { class: 'actions' }, getCode) : null,
      codeBox,
      conn.server?.features.includes('sessions') ? h('div', {}, h('p', { class: 'muted small' }, 'Lost a phone, or signed in somewhere you no longer use? Sign every other device out of this account; only this one stays signed in.'), h('div', { class: 'actions' }, others)) : null,
      conn.server?.features.includes('notices') ? h('div', {}, h('label', { class: 'muted small' }, 'Messages from our moderators'), noticesBox) : null,
    );
    details.addEventListener('toggle', () => {
      if (!details.open) return;
      loadBlocked();
      loadLinks();
      void conn.refreshNotices().then((list) => this.drawNotices(noticesBox, list));
    });
    return details;
  }

  /** Switch this device to the account linked to a sign-in (cloud save). */
  private async switchAccount(provider: import('../../backend/net/protocol').LinkProvider): Promise<void> {
    const source = this.deps.signIn;
    if (!source) return;
    const ok = await this.confirm(
      `Sign in with ${PROVIDER_NAMES[provider]}?`,
      'This device will play the account linked to that sign-in. If its village is kept on the server, it replaces the village here, which stays as a backup in Settings. Your current online account is not deleted.',
      'Sign in',
      false,
      'Not now',
    );
    if (!ok) return;
    try {
      await this.deps.connection.signIn(provider, await source.obtain(provider));
      this.toast(`Signed in as ${this.deps.connection.player?.name ?? 'your account'}.`, 'success');
      this.closeAllModals();
    } catch (e) {
      this.toast((e as Error).message, 'error');
    }
  }

  /** Show a deletion code once, with Copy (re-audit: web deletion needs it). */
  private showDeletionCode(box: HTMLElement, c: { code: string; expiresAt: number }, webForm: string): void {
    clear(box);
    const field = h('input', { class: 'text mono', type: 'text', readonly: true, value: c.code, 'aria-label': 'Deletion code' }) as HTMLInputElement;
    field.addEventListener('focus', () => field.select());
    const copy = h('button', { class: 'btn ghost', type: 'button' }, 'Copy');
    copy.addEventListener('click', () => {
      field.select();
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(c.code).then(() => this.toast('Deletion code copied.', 'success'), () => this.toast('Select the code and copy it.', 'info'));
      else this.toast('Select the code and copy it.', 'info');
    });
    box.append(
      h('div', { class: 'chat-input-row' }, field, copy),
      h('p', { class: 'muted small' }, `Enter it with your Player ID on ${webForm} before ${new Date(c.expiresAt).toLocaleDateString()}. Keep it private: anyone with it and your Player ID can ask for this account to be deleted. Getting a new code cancels this one.`),
    );
  }

  private async signOutOthers(): Promise<void> {
    const ok = await this.confirm('Sign out other devices?', 'Every other phone, tablet or browser signed in to this account is signed out. They can sign in again with a linked sign-in. This device stays signed in.', 'Sign out others', false, 'Cancel');
    if (!ok) return;
    try {
      const n = await this.deps.connection.revokeOtherSessions();
      this.toast(n ? `Signed out ${n} other device${n === 1 ? '' : 's'}.` : 'No other device was signed in.', 'success');
    } catch (e) {
      this.toast((e as Error).message, 'error');
    }
  }

  /** Moderation notices (re-audit, EU DSA): what was decided, why, and how to appeal. */
  private drawNotices(box: HTMLElement, list: import('../../backend/net/protocol').NoticeView[]): void {
    clear(box);
    if (!list.length) {
      box.append(h('p', { class: 'muted small' }, 'None.'));
      return;
    }
    for (const n of list) box.append(h('div', { class: `log-row notice${n.read ? '' : ' unread'}` }, h('div', {}, h('div', { class: 'muted small' }, new Date(n.at).toLocaleString()), h('div', { dir: 'auto' }, n.text))));
    const unread = list.filter((n) => !n.read).map((n) => n.id);
    if (unread.length) void this.deps.connection.markNoticesRead(unread).catch(() => undefined);
  }

  private toldNotices = new Set<string>();
  /** A new moderation notice is shown once as a toast; all of them are in Settings → Online play → Account. */
  private showNewNotices(): void {
    for (const n of this.deps.connection.notices) {
      if (n.read || this.toldNotices.has(n.id)) continue;
      this.toldNotices.add(n.id);
      this.toast(`${n.kind === 'report_outcome' ? 'About your report' : 'From our moderators'}: ${n.text}`, 'info');
    }
  }

  /** "Play offline" left an online account on a server (re-audit): it can still be deleted, connecting just for that. */
  private storedAccountBlock(url: string, redraw: () => void): HTMLElement {
    const conn = this.deps.connection;
    const box = h('div', {});
    const del = h('button', { class: 'btn danger', type: 'button' }, 'Delete online account');
    del.addEventListener('click', () => {
      void this.confirm('Delete your online account?', `Your player name, shared base, Alliance and Gang membership, friends, chat messages and any village kept on ${url} are deleted from that server now. Online play stays off; your village on this device stays. This cannot be undone.`, 'Delete account', true).then(async (ok) => {
        if (!ok) return;
        try {
          await conn.deleteStoredAccount(url);
          this.toast('Your online account was deleted.', 'success');
          redraw();
        } catch (e) {
          this.toast(`Could not delete the account: ${(e as Error).message}`, 'error');
        }
      });
    });
    const code = h('button', { class: 'btn ghost', type: 'button' }, 'Get a deletion code');
    code.addEventListener('click', () => void conn.storedDeletionCode(url).then((c) => this.showDeletionCode(box, c, `${url}/account/delete`), (e: Error) => this.toast(e.message, 'error')));
    return h('div', { class: 'account-settings' }, h('p', {}, 'This device still holds your online account on ', h('span', { class: 'mono' }, url), '. Online play is off, but the account exists on the server.'), h('div', { class: 'actions' }, del, code), box);
  }

  private async deleteOnlineAccount(): Promise<void> {
    const conn = this.deps.connection;
    const ok = await this.confirm(
      'Delete your online account?',
      'Your player name, shared base, Alliance membership, chat messages and troop requests are deleted from the server now. Online attacks still waiting for the server become practice results. Online play turns off on this device; your village stays. This cannot be undone.',
      'Delete account',
      true,
    );
    if (!ok) return;
    try {
      await conn.deleteAccount();
    } catch (e) {
      this.toast(`Could not delete the account: ${(e as Error).message}`, 'error');
      return;
    }
    this.toast('Your online account was deleted. Restarting offline…', 'success');
    void this.c.save().then(() => window.setTimeout(() => location.reload(), 1200));
  }

  private updateShield(): void {
    const left = this.c.state.shieldUntil - this.c.now();
    this.shieldBox.hidden = left <= 0;
    if (left > 0) this.shieldEl.textContent = formatDuration(left);
  }

  private everySecond(): void {
    this.updateShield();
    this.eventChip.textContent = DailyUi.chipText(this.c.now(), this.c);
    this.updateBadges();
    const s = this.c.state;
    const bs = builderStatus(s, this.c.data, this.c.now());
    this.buildersEl.textContent = `${bs.free}/${bs.total}`;
    if (!this.selectedId || this.sheet.hidden) return;
    if (this.sheetSignature() !== this.sheetSig) this.renderSheet();
    else this.updateSheetLive();
  }

  /** Changes to these values need a full rebuild of the panel; everything else updates in place. */
  private sheetSignature(): string {
    const b = this.c.state.buildings.find((v) => v.id === this.selectedId);
    if (!b) return 'none';
    const now = this.c.now();
    const busy = Boolean(b.upgrade && now < b.upgrade.endsAt);
    const q = busy ? null : upgradeQuote(this.c.state, b.id, this.c.data, now);
    const missing = q && !q.ok && q.quote ? Object.keys(missingFor(this.c.state.resources, q.quote.cost)).join() : '';
    return JSON.stringify([b.id, effectiveLevel(b, now), busy, q ? (q.ok ? 'ok' : q.code) : '-', missing]);
  }

  /** Update timers and collector amounts without replacing any buttons. */
  private updateSheetLive(): void {
    const b = this.c.state.buildings.find((v) => v.id === this.selectedId);
    if (!b) return;
    const gd = this.c.data;
    const now = this.c.now();
    const up = this.sheet.querySelector<HTMLElement>('[data-live="upgrade"]');
    if (up && b.upgrade) {
      const u = b.upgrade;
      const pct = Math.min(100, ((now - u.startedAt) / Math.max(1, u.endsAt - u.startedAt)) * 100);
      (up.querySelector('i') as HTMLElement).style.width = `${pct}%`;
      up.querySelector('span')!.textContent = `${u.toLevel === 1 ? 'Building' : `Upgrading to Lv ${u.toLevel}`} · ${formatDuration(u.endsAt - now)} left`;
    }
    const col = this.sheet.querySelector<HTMLElement>('[data-live="collector"]');
    if (col) {
      const level = effectiveLevel(b, now);
      const amount = Math.floor(collectorAmount(b, now, gd));
      const cap = collectorCapacity(b, level, gd);
      (col.querySelector('i') as HTMLElement).style.width = `${Math.min(100, (amount / Math.max(1, cap)) * 100)}%`;
      col.querySelector('span')!.textContent = `Ready: ${formatNumber(amount)} / ${formatNumber(cap)}`;
    }
  }

  // ------------------------------------------------------------ unlock preview

  private unlockText(u: UnlockItem): string {
    const name = buildingDef(this.c.data, u.type).name;
    if (u.kind === 'new') return `New: ${name}${u.to > 1 ? ` ×${u.to}` : ''}`;
    if (u.kind === 'more') return `${name}: build up to ${u.to} (now ${u.from})`;
    return `${name}: up to level ${u.to} (now ${u.from})`;
  }

  /** One short line, e.g. "+1 Acorn Orchard, +1 Dewdrop Well, higher levels for 4 buildings". */
  private unlockSummary(items: UnlockItem[]): string {
    const gd = this.c.data;
    const parts: string[] = [];
    for (const u of items) {
      const name = buildingDef(gd, u.type).name;
      if (u.kind === 'new') parts.push(`new ${name}`);
      else if (u.kind === 'more') parts.push(`+${u.to - u.from} ${name}`);
    }
    const capped = new Set(items.filter((u) => u.kind === 'levelCap').map((u) => u.type)).size;
    const shown = parts.slice(0, 3);
    if (parts.length > 3) shown.push(`${parts.length - 3} more`);
    if (capped) shown.push(`higher levels for ${capped} building${capped > 1 ? 's' : ''}`);
    const troops = troopCapUnlock(hallLevel(this.c.state, gd), gd);
    if (troops) shown.push(`troop level ${troops.to}`);
    return shown.join(', ');
  }

  private renderUnlockChip(): void {
    const level = hallLevel(this.c.state, this.c.data);
    const items = hallUnlocks(level, this.c.data);
    clear(this.unlocksEl);
    this.unlocksEl.append(icon(icons.toadstool));
    if (!items.length) {
      this.unlocksEl.append(h('span', {}, h('b', {}, `Clan Keep Lv ${level}`), ' — top level for now'));
      return;
    }
    this.unlocksEl.append(h('span', { class: 'unlock-text' }, h('b', {}, `Clan Keep Lv ${level + 1} unlocks: `), this.unlockSummary(items)));
  }

  private openUnlocks(): void {
    const gd = this.c.data;
    const level = hallLevel(this.c.state, gd);
    const items = hallUnlocks(level, gd);
    const hall = this.c.state.buildings.find((b) => b.type === hallType(gd));
    const body = h('div', { class: 'unlock-list' });
    if (!items.length) body.append(h('p', {}, 'Your Clan Keep is at the highest level available right now.'));
    else {
      body.append(h('p', { class: 'muted' }, `Upgrading your Clan Keep to level ${level + 1} unlocks:`));
      const troops = troopCapUnlock(level, gd);
      body.append(h('ul', {}, ...items.map((u) => h('li', {}, this.unlockText(u))), troops ? h('li', {}, `Troop research: up to level ${troops.to} (now ${troops.from})`) : ''));
      const next = levelDef(gd, hallType(gd), level + 1);
      if (next) body.append(h('p', { class: 'row' }, 'Cost: ', costChips(next.cost, missingFor(this.c.state.resources, next.cost)), h('span', { class: 'chip' }, icon(icons.clock), formatDuration(next.buildSeconds * 1000))));
    }
    const close = this.modal('Clan Keep', body, [
      hall && {
        label: 'Go to Clan Keep',
        primary: true,
        onClick: () => {
          close();
          this.bus.emit('select', hall.id);
          this.bus.emit('camera:focus', { id: hall.id });
        },
      },
    ]);
  }

  // ------------------------------------------------------------ building sheet

  private renderSheet(): void {
    const b = this.c.state.buildings.find((v) => v.id === this.selectedId);
    if (!b || this.placementActive) {
      this.sheet.hidden = true;
      this.sheetSig = '';
      return;
    }
    if (this.sheetPressed && !this.sheet.hidden && this.sheet.dataset.id === b.id) {
      window.setTimeout(() => this.renderSheet(), 120);
      return;
    }
    this.sheetSig = this.sheetSignature();
    this.sheet.dataset.id = b.id;
    const gd = this.c.data;
    const now = this.c.now();
    const def = buildingDef(gd, b.type);
    const level = effectiveLevel(b, now);
    clear(this.sheet);
    this.sheet.hidden = false;
    if (def.category === 'obstacle' && def.clear) {
      this.renderObstacleSheet(b, def.name, def.description, def.clear);
      return;
    }

    const title = h('div', { class: 'sheet-title' }, h('h2', {}, def.name), h('span', { class: 'level' }, level >= 1 ? `Level ${level}` : 'Being built'));
    const closeBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: () => this.bus.emit('select', null) }, icon(icons.close));
    this.sheet.append(h('div', { class: 'sheet-head' }, title, closeBtn));
    this.sheet.append(h('p', { class: 'muted desc' }, def.description));

    // Stats
    const stats = h('div', { class: 'stats' });
    const ld = levelDef(gd, b.type, Math.max(1, level));
    if (def.category === 'collector' && def.produces && ld?.ratePerHour) {
      stats.append(h('span', { class: 'chip' }, icon(icons[def.produces as 'acorns' | 'dew']), `${formatNumber(ld.ratePerHour)}/hour`));
      stats.append(h('span', { class: 'chip' }, `Holds ${formatNumber(collectorCapacity(b, Math.max(1, level), gd))}`));
    }
    if (ld?.storage) {
      for (const k of RESOURCE_KINDS) {
        const v = ld.storage[k];
        if (v) stats.append(h('span', { class: 'chip' }, icon(icons[k as 'acorns' | 'dew']), `Stores ${formatNumber(v)}`));
      }
    }
    if (def.category === 'builder') stats.append(h('span', { class: 'chip' }, icon(icons.beaver), 'Home of 1 Village Artisan'));
    if (ld?.housing) stats.append(h('span', { class: 'chip' }, icon(icons.troops), `Houses ${ld.housing}`));
    if (def.combat && ld?.damage) {
      const dps = (ld.damage * gd.battle.ticksPerSecond) / def.combat.fireIntervalTicks;
      stats.append(h('span', { class: 'chip' }, `${Math.round(dps)} damage/sec`));
      stats.append(h('span', { class: 'chip' }, `Range ${def.combat.range}`));
      stats.append(h('span', { class: 'chip' }, def.combat.targets === 'both' ? 'Ground & air' : def.combat.targets === 'air' ? 'Air only' : 'Ground only'));
    }
    if (def.category === 'hedge' && ld) stats.append(h('span', { class: 'chip' }, `${formatNumber(ld.hp)} HP`));
    if (stats.childElementCount) this.sheet.append(stats);

    // Upgrade in progress
    if (b.upgrade && now < b.upgrade.endsAt) {
      const u = b.upgrade;
      const pct = Math.min(100, ((now - u.startedAt) / Math.max(1, u.endsAt - u.startedAt)) * 100);
      this.sheet.append(
        h(
          'div',
          { class: 'progress-row', 'data-live': 'upgrade' },
          h('div', { class: 'progress' }, h('i', { style: `width:${pct}%` })),
          h('span', {}, `${u.toLevel === 1 ? 'Building' : `Upgrading to Lv ${u.toLevel}`} · ${formatDuration(u.endsAt - now)} left`),
        ),
      );
    }

    // Collector contents
    if (def.produces && level >= 1) {
      const amount = Math.floor(collectorAmount(b, now, gd));
      const cap = collectorCapacity(b, level, gd);
      this.sheet.append(
        h(
          'div',
          { class: 'progress-row', 'data-live': 'collector' },
          h('div', { class: `progress ${def.produces}` }, h('i', { style: `width:${Math.min(100, (amount / Math.max(1, cap)) * 100)}%` })),
          h('span', {}, `Ready: ${formatNumber(amount)} / ${formatNumber(cap)}`),
        ),
      );
    }

    // Actions
    const actions = h('div', { class: 'actions' });
    if (def.produces && level >= 1) {
      actions.append(
        h('button', { class: 'btn', type: 'button', onclick: () => this.collect(b) }, icon(icons[def.produces as 'acorns' | 'dew']), 'Collect'),
      );
    }
    if (b.upgrade && now < b.upgrade.endsAt) {
      const sq = skipQuote(this.c.state, b.id, now, gd);
      if (sq) {
        actions.append(
          h(
            'button',
            { class: 'btn gold', type: 'button', onclick: () => void this.econ.spendMoonstones('Finish now', `Finish ${def.name} now`, skipQuote(this.c.state, b.id, this.c.now(), gd)?.moonstones ?? sq.moonstones, () => this.c.dispatch({ type: 'skip', id: b.id }).ok) },
            'Finish now ',
            h('span', { class: 'chip' }, icon(icons.moonstones), String(sq.moonstones)),
          ),
        );
      }
      actions.append(h('button', { class: 'btn ghost', type: 'button', onclick: () => this.cancelUpgrade(b) }, icon(icons.close), 'Cancel'));
    } else if (def.category !== 'decor') {
      const uq = upgradeQuote(this.c.state, b.id, gd, now);
      actions.append(this.upgradeButton(b, uq));
      if (!uq.ok && uq.code === 'NOT_ENOUGH_RESOURCES' && uq.quote) {
        const action = { type: 'upgrade', id: b.id } as const;
        const tq = topUpQuote(this.c.state, action, now, gd);
        if (tq) {
          const missing = Object.entries(tq.missing).map(([k, v]) => `${formatNumber(v as number)} ${RES_LABEL[k as ResourceKind]}`).join(' and ');
          actions.append(
            h(
              'button',
              {
                class: 'btn gold',
                type: 'button',
                onclick: () =>
                  void this.econ.spendMoonstones('Buy missing resources', `Buy the missing ${missing} and start the upgrade`, topUpQuote(this.c.state, action, this.c.now(), gd)?.moonstones ?? tq.moonstones, () => this.c.dispatch({ type: 'topUp', then: action }).ok),
              },
              'Buy missing ',
              h('span', { class: 'chip' }, icon(icons.moonstones), String(tq.moonstones)),
            ),
          );
        }
      }
    }
    if (def.category === 'military' && level >= 1) {
      actions.append(h('button', { class: 'btn sky', type: 'button', onclick: () => this.openTraining() }, icon(icons.troops), 'Train troops'));
    }
    actions.append(h('button', { class: 'btn ghost', type: 'button', onclick: () => this.bus.emit('placement:start', { kind: 'move', id: b.id }) }, icon(icons.move), 'Move'));
    this.sheet.append(actions);
  }

  private renderObstacleSheet(b: Building, name: string, description: string, clr: { cost: Cost; seconds: number; moonstones: number }): void {
    const now = this.c.now();
    const closeBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: () => this.bus.emit('select', null) }, icon(icons.close));
    this.sheet.append(h('div', { class: 'sheet-head' }, h('div', { class: 'sheet-title' }, h('h2', {}, name)), closeBtn), h('p', { class: 'muted desc' }, description));
    if (b.upgrade && now < b.upgrade.endsAt) {
      const u = b.upgrade;
      const pct = Math.min(100, ((now - u.startedAt) / Math.max(1, u.endsAt - u.startedAt)) * 100);
      this.sheet.append(h('div', { class: 'progress-row', 'data-live': 'upgrade' }, h('div', { class: 'progress' }, h('i', { style: `width:${pct}%` })), h('span', {}, `Clearing · ${formatDuration(u.endsAt - now)} left`)));
      return;
    }
    const btn = h(
      'button',
      { class: 'btn primary upgrade', type: 'button' },
      h('span', { class: 'btn-label' }, 'Clear it'),
      h('span', { class: 'btn-sub' }, costChips(clr.cost, missingFor(this.c.state.resources, clr.cost)), h('span', { class: 'chip' }, icon(icons.clock), formatDuration(clr.seconds * 1000)), h('span', { class: 'chip good' }, '+', icon(icons.moonstones), String(clr.moonstones))),
    );
    btn.addEventListener('click', () => {
      const r = this.c.dispatch({ type: 'clear', id: b.id });
      if (!r.ok) this.toast(r.message, 'error');
    });
    this.sheet.append(h('div', { class: 'actions' }, btn));
  }

  private upgradeButton(b: Building, q: QuoteResult): HTMLElement {
    if (!q.ok && !q.quote) return h('div', { class: 'note' }, q.message);
    const quote = q.ok ? q.quote : q.quote!;
    const missing = missingFor(this.c.state.resources, quote.cost);
    const btn = h(
      'button',
      {
        class: 'btn primary upgrade',
        type: 'button',
        disabled: !q.ok,
        onclick: () => {
          const r = this.c.dispatch({ type: 'upgrade', id: b.id });
          if (!r.ok) this.toast(r.message, 'error');
        },
      },
      h('span', { class: 'btn-label' }, icon(icons.up), `Upgrade to Lv ${quote.toLevel}`),
      h('span', { class: 'btn-sub' }, costChips(quote.cost, missing), h('span', { class: 'chip' }, icon(icons.clock), formatDuration(quote.seconds * 1000))),
    );
    if (q.ok) return btn;
    return h('div', { class: 'upgrade-wrap' }, btn, h('div', { class: 'note' }, q.message));
  }

  private collect(b: Building): void {
    const r = this.c.dispatch({ type: 'collect', id: b.id });
    if (!r.ok) this.toast(r.message, r.code === 'NOTHING_TO_COLLECT' ? 'info' : 'error');
    else for (const e of r.events) if (e.kind === 'collect') this.toast(`+${formatNumber(e.amount)} ${RES_LABEL[e.resource]}`, 'success');
  }

  private async cancelUpgrade(b: Building): Promise<void> {
    const pct = Math.round(this.c.data.economy.cancelRefundFraction * 100);
    const ok = await this.confirm('Cancel?', `You'll get back ${pct}% of what you paid.`, 'Cancel upgrade', true);
    if (!ok) return;
    const r = this.c.dispatch({ type: 'cancel', id: b.id });
    if (!r.ok) this.toast(r.message, 'error');
  }

  // ------------------------------------------------------------ shop

  private shopTab: 'resources' | 'army' | 'defense' | 'decor' = 'resources';

  private openShop(): void {
    const body = h('div', {});
    const tabs: [typeof this.shopTab, string, string[]][] = [
      ['resources', 'Resources', ['collector', 'storage', 'builder']],
      ['army', 'Army', ['military']],
      ['defense', 'Defense', ['defense', 'support', 'hedge', 'trap']],
      ['decor', 'Decor', ['decor']],
    ];
    const visible = tabs.filter(([, , cats]) => Object.values(this.c.data.buildings).some((d) => d.inShop && cats.includes(d.category)));
    const draw = () => {
      clear(body);
      body.append(
        h('div', { class: 'shop-tabs' }, ...visible.map(([id, label]) => {
          const b = h('button', { type: 'button', class: id === this.shopTab ? 'on' : '' }, label);
          b.addEventListener('click', () => {
            this.shopTab = id;
            draw();
          });
          return b;
        })),
      );
      const cats = (visible.find(([id]) => id === this.shopTab) ?? visible[0])[2];
      body.append(this.shopGrid(cats, () => close()));
    };
    draw();
    const close = this.modal('Build', body, [], 'wide');
  }

  /** Confirm the Jade, then buy what the building is missing and place it in one step. */
  private async buyAndPlace(type: string, x: number, y: number): Promise<void> {
    const gd = this.c.data;
    const action = { type: 'place', buildingType: type, x, y } as const;
    const placed = (r: ReturnType<typeof this.c.dispatch>) => {
      if (!r.ok) {
        this.toast(r.message, 'error');
        return false;
      }
      this.bus.emit('placement:cancel');
      this.bus.emit('select', r.state.buildings[r.state.buildings.length - 1].id);
      return true;
    };
    const tq = topUpQuote(this.c.state, action, this.c.now(), gd);
    // Collected enough meanwhile: no Jade needed.
    if (!tq) {
      placed(this.c.dispatch(action));
      return;
    }
    const missing = Object.entries(tq.missing).map(([k, v]) => `${formatNumber(v as number)} ${RES_LABEL[k as ResourceKind]}`).join(' and ');
    await this.econ.spendMoonstones('Buy missing resources', `Buy the missing ${missing} and build ${gd.buildings[type].name} here`, tq.moonstones, () => placed(this.c.dispatch({ type: 'topUp', then: action })));
  }

  private shopGrid(categories: string[], close: () => void): HTMLElement {
    const gd = this.c.data;
    const now = this.c.now();
    const grid = h('div', { class: 'shop-grid' });
    for (const [type, def] of Object.entries(gd.buildings)) {
      if (!def.inShop || !categories.includes(def.category)) continue;
      const q = placeQuote(this.c.state, gd, type, now);
      // Short only of resources: offer to buy them with Jade when the spot is confirmed.
      const tq = !q.ok && q.code === 'NOT_ENOUGH_RESOURCES' ? topUpQuote(this.c.state, { type: 'place', buildingType: type, x: 0, y: 0 }, now, gd) : null;
      const lim = limitFor(this.c.state, gd, type);
      const have = countOfType(this.c.state, type);
      const first = def.levels[0];
      const thumb = this.deps.thumbnail(type);
      const card = h(
        'button',
        {
          class: `shop-card${q.ok || tq ? '' : ' disabled'}`,
          type: 'button',
          'aria-disabled': !q.ok && !tq,
          onclick: () => {
            if (!q.ok && !tq) {
              this.toast(q.message, 'error');
              return;
            }
            close();
            this.bus.emit('placement:start', { kind: 'new', buildingType: type, buy: !q.ok });
          },
        },
        thumb ? h('img', { src: thumb, alt: '' }) : h('div', { class: 'thumb-ph' }),
        h('div', { class: 'shop-name' }, def.name),
        h('div', { class: 'shop-count' }, `Built ${have}/${lim.count}`),
        h('div', { class: 'shop-cost' }, costChips(first.cost, missingFor(this.c.state.resources, first.cost)), h('span', { class: 'chip' }, icon(icons.clock), formatDuration(first.buildSeconds * 1000))),
        tq
          ? h('div', { class: 'shop-buy' }, 'Buy missing ', h('span', { class: 'chip' }, icon(icons.moonstones), String(tq.moonstones)))
          : !q.ok
            ? h('div', { class: 'shop-why' }, q.message)
            : null,
      );
      grid.append(card);
    }
    return grid;
  }

  // ------------------------------------------------------------ army

  openTraining(): void {
    this.army.open();
  }

  /** The Build menu, on the tab with the Training Dojo and Squad Courtyard. */
  private openBuildArmy(): void {
    this.closeAllModals();
    this.shopTab = 'army';
    this.openShop();
  }

  private backupTitle(b: VillageBackup): string {
    return `Clan Keep ${b.keep} · ${b.warriors} warrior${b.warriors === 1 ? '' : 's'} · ${b.honor} honor`;
  }

  private async restoreVillage(key: string): Promise<void> {
    const ok = await this.c.restoreBackup(key);
    if (!ok) {
      this.toast('That village could not be restored.', 'error');
      return;
    }
    this.closeAllModals();
    this.bus.emit('select', null);
    this.toast('Your earlier village is back. The one you were playing is kept in Settings.', 'success');
  }

  /** At start-up: offer back a kept village that is further along than this one, once. */
  async offerRecovery(): Promise<void> {
    const gd = this.c.data;
    const s = this.c.state;
    const keep = hallLevel(s, gd);
    const buildings = s.buildings.filter((b) => gd.buildings[b.type]?.category !== 'obstacle').length;
    const better = (await this.c.backups()).find((b) => b.keep > keep || (b.keep === keep && b.buildings > buildings));
    if (!better) return;
    let seen: string | null = null;
    try {
      seen = localStorage.getItem(RECOVERY_SEEN_KEY);
      localStorage.setItem(RECOVERY_SEEN_KEY, better.key);
    } catch {
      /* storage blocked: the offer may appear again */
    }
    if (seen === better.key) return;
    const yes = await this.confirm('Your earlier village is safe', `A save problem started you on a new village, but your earlier one was kept: ${this.backupTitle(better)}, last saved ${new Date(better.savedAt).toLocaleString()}. Restore it now? The village you have now will be kept in Settings.`, 'Restore it', false, 'Not now');
    if (yes) await this.restoreVillage(better.key);
  }

  /** Another tab or window now owns this village. Stop here: nothing done in this one could be saved. */
  showTakenOver(): void {
    if (document.querySelector('.takeover')) return;
    document.body.append(
      h(
        'div',
        { class: 'takeover', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': 'Open somewhere else' },
        h(
          'div',
          { class: 'modal' },
          h('div', { class: 'modal-head' }, h('h2', {}, 'Open somewhere else')),
          h(
            'div',
            { class: 'modal-body' },
            h('p', {}, 'Your village was opened in another tab or window, and only one can save it. Your progress is safe there.'),
            h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => location.reload() }, 'Play here instead')),
          ),
        ),
      ),
    );
  }

  /**
   * Every warrior class in the roster, with its icon and ability. "Unlocked"
   * means trainable now: both the Clan Keep gate and the Training Dojo level
   * are met (the same check the Train button uses).
   */
  openCodex(): void {
    const gd = this.c.data;
    let tierFilter = 0;
    let roleFilter = '';
    let statusFilter: '' | 'unlocked' | 'locked' = '';
    const body = h('div', { class: 'codex' });
    const render = () => {
      const s = this.c.state;
      clear(body);
      const rows = WARRIORS.map((w) => {
        const u = w.liveTroop && gd.troops[w.liveTroop] ? troopUnlock(s, w.liveTroop, gd) : null;
        let status = 'Coming soon';
        if (u?.unlocked) status = 'Unlocked';
        else if (u) {
          const need: string[] = [];
          if (u.needsKeep) need.push(`Clan Keep ${u.keep}`);
          if (u.needsDojo) need.push(`Training Dojo ${u.dojo}`);
          status = `Needs ${need.join(' + ')}`;
        }
        return { w, u, status, keep: u ? u.earliestKeep : warriorUnlockKeep(w, gd) };
      });
      const unlockedCount = rows.filter((r) => r.u?.unlocked).length;
      const nextUp = rows.filter((r) => r.u && !r.u.unlocked).sort((a, b) => a.keep - b.keep || a.w.tier - b.w.tier)[0];
      body.append(h('p', { class: 'muted small' }, `${unlockedCount} of ${WARRIORS.length} classes unlocked. A class unlocks when your Clan Keep and Training Dojo both reach its level; the ring colour shows the tier.`));
      if (nextUp) body.append(h('p', { class: 'small' }, h('b', {}, 'Next: '), `${nextUp.w.name} (${nextUp.status.replace('Needs ', 'needs ')}).`));
      const tierSelect = h('select', { 'aria-label': 'Filter classes by tier' }, h('option', { value: '0' }, 'All tiers'), ...MODEL.tiers.map((tier) => h('option', { value: String(tier.tier) }, tier.name)));
      tierSelect.value = String(tierFilter);
      const roleSelect = h('select', { 'aria-label': 'Filter classes by role' }, h('option', { value: '' }, 'All roles'), ...Object.entries(MODEL.roles).map(([id, r]) => h('option', { value: id }, r.name)));
      roleSelect.value = roleFilter;
      const statusSelect = h('select', { 'aria-label': 'Filter classes by status' }, h('option', { value: '' }, 'All'), h('option', { value: 'unlocked' }, 'Unlocked'), h('option', { value: 'locked' }, 'Locked'));
      statusSelect.value = statusFilter;
      tierSelect.addEventListener('change', () => { tierFilter = Number(tierSelect.value); render(); });
      roleSelect.addEventListener('change', () => { roleFilter = roleSelect.value; render(); });
      statusSelect.addEventListener('change', () => { statusFilter = statusSelect.value as typeof statusFilter; render(); });
      body.append(h('div', { class: 'actions' }, tierSelect, roleSelect, statusSelect));
      const list = h('div', { class: 'codex-list' });
      const shown = rows
        .filter((r) => (!tierFilter || r.w.tier === tierFilter) && (!roleFilter || r.w.role === roleFilter))
        .filter((r) => !statusFilter || (statusFilter === 'unlocked') === Boolean(r.u?.unlocked))
        .sort((a, b) => Number(Boolean(b.u?.unlocked)) - Number(Boolean(a.u?.unlocked)) || a.keep - b.keep || a.w.tier - b.w.tier);
      for (const { w, u, status } of shown) {
        const src = this.deps.warriorIcon(w.id);
        const def = w.liveTroop ? gd.troops[w.liveTroop] : undefined;
        const lvl = w.liveTroop ? troopLevelOf(s, w.liveTroop) : 0;
        list.append(
          h(
            'div',
            { class: `codex-row${u ? (u.unlocked ? ' unlocked' : ' locked') : ' planned'}` },
            src ? h('img', { src, alt: '' }) : null,
            h(
              'div',
              {},
              h('b', {}, w.name),
              h('div', { class: 'muted small' }, `${roleDef(w.role).name} · tier ${w.tier}${u?.unlocked ? ` · Lv ${lvl}` : ''}`),
              h('div', { class: `small codex-status${u?.unlocked ? ' ok' : ''}` }, status),
              h('div', { class: 'small' }, h('b', {}, `${w.ability.name}: `), w.ability.text),
              def ? h('div', { class: 'muted small' }, `${def.air ? 'Flies' : 'Ground'} · range ${def.range} · ${def.housing} space`) : null,
            ),
          ),
        );
      }
      if (!shown.length) list.append(h('p', { class: 'muted' }, 'No classes match these filters.'));
      body.append(list);
    };
    render();
    const unsub = this.c.subscribe(() => render());
    this.modal('Warrior Codex', body, [], 'wide', () => unsub());
  }

  openLeague(): void {
    const s = this.c.state;
    const gd = this.c.data;
    const cur = leagueFor(s.trophies, gd);
    const nxt = nextLeague(s.trophies, gd);
    const body = h(
      'div',
      {},
      h('p', {}, h('b', {}, cur.name), ` · ${s.trophies} honor`),
      nxt ? h('p', { class: 'muted' }, `${nxt.min - s.trophies} more honor to reach ${nxt.name}.`) : h('p', { class: 'muted' }, 'You are in the top league!'),
      h('p', { class: 'muted' }, `Season ends in ${formatDuration(seasonEndsAt(this.c.now()) - this.c.now())}. At the end of each month you get your league's chest, and honor above ${gd.ranks.seasonResetFloor} are halved.`),
      h('h3', {}, 'League chests (fixed contents)'),
      h('p', { class: 'muted small' }, `Sized for your Clan Keep level ${hallLevel(s, gd)}. Won attacks also earn the league bonus (all of it at 3 stars, a third per star).`),
    );
    for (const l of gd.ranks.leagues) {
      const bonus = Object.keys(l.winBonus ?? {}).length ? h('div', { class: 'muted small' }, 'Win bonus ', costChips(l.winBonus)) : null;
      body.append(h('div', { class: `log-row${l.id === cur.id ? ' current' : ''}` }, h('div', {}, h('b', {}, l.name), h('div', { class: 'muted small' }, `${l.min}+ honor`), bonus), costChips(leagueChest(l, hallLevel(s, gd), gd))));
    }
    body.append(h('p', { class: 'muted small' }, 'Win raids to earn honor; lose it when your attacks fail or when raiders beat your village. More honor bring tougher opponents with more loot.'));
    this.modal('Honor', body, [], 'normal');
  }

  openLog(): void {
    const s = this.c.state;
    const body = h('div', {});
    const attacks = [...s.battleLog, ...s.defenseLog].sort((a, b) => b.at - a.at);
    if (!attacks.length) body.append(h('p', { class: 'muted' }, 'No battles yet. Tap Attack to raid a neighbouring village!'));
    for (const r of attacks) {
      const stars = h('span', { class: 'stars-mini' });
      for (let i = 0; i < 3; i++) stars.append(h('span', { class: i < r.result.stars ? '' : 'off' }, '★'));
      // A replay recorded under older battle rules would show a different fight, so it is not offered.
      const canReplay = replayable(r);
      const replay = canReplay
        ? h('button', { class: 'btn sky', type: 'button' }, 'Replay')
        : h('span', { class: 'muted small', title: 'Recorded under older battle rules: the result stands, but the replay would no longer match it.' }, 'Replay unavailable (older rules)');
      if (canReplay) replay.addEventListener('click', () => {
        this.closeAllModals();
        this.deps.onReplay(r);
      });
      // Attacks show what reached storage; old records stored that in result.loot.
      const loot = r.kind === 'attack' ? r.banked ?? r.result.loot : r.result.loot;
      body.append(
        h(
          'div',
          { class: 'log-row' },
          h('div', {}, h('b', {}, r.kind === 'attack' ? `You raided ${isolateName(r.opponentName)}${r.setup.base.practice ? ' (practice)' : ''}` : `${isolateName(r.opponentName)}${r.simulated ? ' (simulated raider)' : ''} raided you`), h('div', { class: 'row' }, stars, r.trophies !== undefined ? h('span', { class: `chip ${r.trophies >= 0 ? 'good' : 'short'}` }, icon(icons.leaf), `${r.trophies >= 0 ? '+' : ''}${r.trophies}`) : null, h('span', { class: 'muted small' }, `${r.result.destruction}% · ${formatDuration(this.c.now() - r.at)} ago`), Object.keys(loot).some((k) => (loot as Record<string, number>)[k] > 0) ? costChips(loot) : h('span', { class: 'chip' }, 'No loot'))),
          replay,
        ),
      );
    }
    this.modal('Battle log', body, [], 'wide');
  }

  // ------------------------------------------------------------ welcome back

  showWelcomeBack(s: OfflineSummary, onClose?: () => void): void {
    const gd = this.c.data;
    const body = h('div', { class: 'welcome' }, h('p', {}, `You were away for ${formatDuration(s.awayMs)}.`));
    const list = h('ul', {});
    for (const f of s.finished) {
      const name = buildingDef(gd, f.type).name;
      list.append(h('li', {}, f.level === 1 ? `${name} finished building.` : `${name} reached level ${f.level}.`));
    }
    const trained = Object.entries(s.trained).map(([t, n]) => `${n} ${gd.troops[t]?.name ?? t}`).join(', ');
    if (trained) list.append(h('li', {}, `Finished training: ${trained}.`));
    const gains = RESOURCE_KINDS.filter((k) => (s.collectorGains[k] ?? 0) > 0);
    if (gains.length) {
      list.append(
        h('li', {}, 'Your collectors gathered ', gains.map((k) => `${formatNumber(s.collectorGains[k]!)} ${RES_LABEL[k]}`).join(' and '), '. Tap the bubbles to collect.'),
      );
    }
    for (const r of s.raids) {
      const lost = RESOURCE_KINDS.filter((k) => (r.result.loot[k] ?? 0) > 0).map((k) => `${formatNumber(r.result.loot[k]!)} ${RES_LABEL[k]}`).join(' and ');
      list.append(h('li', {}, `${isolateName(r.opponentName)}${r.simulated ? ' (simulated raider)' : ''} raided you: ${'★'.repeat(r.result.stars)}${'☆'.repeat(3 - r.result.stars)} ${r.result.destruction}%`, lost ? `, took ${lost}` : ', took nothing', r.trophies ? ` (${r.trophies > 0 ? '+' : ''}${r.trophies} honor).` : '.'));
    }
    if (this.c.state.shieldUntil > this.c.now() && s.raids.some((r) => shieldHoursFor(r.result.destruction, this.c.data) > 0)) {
      list.append(h('li', {}, `You have a shield for ${formatDuration(this.c.state.shieldUntil - this.c.now())}.`));
    }
    for (const sr of s.seasons) {
      list.append(h('li', {}, `The season ended! Your ${this.c.data.ranks.leagues.find((l) => l.id === sr.league)?.name ?? sr.league} chest: `, costChips(sr.chest), sr.overflow ? h('span', { class: 'muted small' }, ' (did not fit in storage: ', costChips(sr.overflow), ')') : null));
    }
    if (!list.childElementCount) list.append(h('li', {}, 'All quiet in the village.'));
    body.append(list);
    if (s.raids.length) {
      const btn = h('button', { class: 'btn sky', type: 'button' }, 'See defense replays');
      btn.addEventListener('click', () => {
        this.closeAllModals();
        this.openLog();
      });
      body.append(h('div', { class: 'actions' }, btn));
    }
    const close = this.modal('Welcome back!', body, [{ label: 'Great!', primary: true, onClick: () => close() }], 'normal', onClose);
  }

  // ------------------------------------------------------------ settings

  private openSettings(online = false): void {
    const body = h('div', { class: 'settings' });
    const net = this.onlineSection();
    if (online) body.append(net);

    // Save transfer
    const codeBox = h('textarea', { class: 'code', rows: 4, spellcheck: 'false', autocapitalize: 'off', placeholder: 'Paste a save code here to load a village from another device' }) as HTMLTextAreaElement;
    body.append(
      h('h3', {}, 'Your village'),
      h('p', { class: 'muted' }, this.deps.store.persistent ? 'Your village saves automatically on this device. To move it to another device, copy a save code here and load it there.' : 'This browser mode cannot save. Your village will be lost when you close the page.'),
      codeBox,
      h(
        'div',
        { class: 'actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => this.exportSave(codeBox) }, 'Copy save code'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => this.importSave(codeBox.value) }, 'Load from code'),
      ),
    );

    // Villages kept after a save could not be read.
    const earlier = h('div', {});
    body.append(earlier);
    void this.c.backups().then((list) => {
      if (!list.length) return;
      earlier.append(
        h('h3', {}, 'Earlier villages'),
        h('p', { class: 'muted small' }, 'Kept when a save could not be read. Restoring one swaps it with your current village, which is kept here instead.'),
        ...list.map((b) => h('div', { class: 'log-row' }, h('div', {}, h('b', {}, this.backupTitle(b)), h('div', { class: 'muted small' }, new Date(b.savedAt).toLocaleString())), h('button', { class: 'btn ghost', type: 'button', onclick: () => void this.restoreVillage(b.key) }, 'Restore'))),
      );
    });

    if (!online) body.append(net);
    body.append(this.econ.spendSection());

    // Display
    const fpsToggle = h('input', { type: 'checkbox', checked: this.showFps }) as HTMLInputElement;
    fpsToggle.addEventListener('change', () => {
      this.showFps = fpsToggle.checked;
      this.fpsEl.hidden = !this.showFps;
      try {
        localStorage.setItem('tk.showFps', this.showFps ? '1' : '0');
      } catch {
        /* ignore */
      }
    });
    const sfxToggle = h('input', { type: 'checkbox', checked: sound.settings.sfx }) as HTMLInputElement;
    sfxToggle.addEventListener('change', () => sound.setSfx(sfxToggle.checked));
    const musicToggle = h('input', { type: 'checkbox', checked: sound.settings.music }) as HTMLInputElement;
    musicToggle.addEventListener('change', () => sound.setMusic(musicToggle.checked));
    const prefs = this.deps.prefs;
    const breakToggle = h('input', { type: 'checkbox', checked: prefs.get('sessionReminder') }) as HTMLInputElement;
    breakToggle.addEventListener('change', () => prefs.set('sessionReminder', breakToggle.checked));
    const remindToggle = h('input', { type: 'checkbox', checked: prefs.get('reminders') }) as HTMLInputElement;
    const nd = this.c.data.notifications;
    const typeBox = h('div', { class: 'notify-types' });
    const typeToggles: HTMLInputElement[] = [];
    for (const t of nd.types) {
      const tg = h('input', { type: 'checkbox', checked: this.deps.notifyPrefs.get(t.id, t.default), disabled: !prefs.get('reminders') }) as HTMLInputElement;
      tg.addEventListener('change', () => {
        this.deps.notifyPrefs.set(t.id, tg.checked);
        this.deps.onNotificationsChanged?.();
      });
      typeToggles.push(tg);
      typeBox.append(h('label', { class: 'toggle sub' }, tg, ` ${t.label}`));
    }
    const pad = (n: number) => `${String(n).padStart(2, '0')}:00`;
    typeBox.append(h('p', { class: 'muted small' }, `At most ${nd.maxPerDay} a day, and none between ${pad(nd.quietHours.start)} and ${pad(nd.quietHours.end)} (they wait until morning).`));
    remindToggle.addEventListener('change', () => {
      prefs.set('reminders', remindToggle.checked);
      for (const tg of typeToggles) tg.disabled = !remindToggle.checked;
      if (remindToggle.checked) void this.deps.onRemindersEnabled();
      else this.deps.onNotificationsChanged?.();
    });
    body.append(
      h('h3', {}, 'Sound'),
      h('label', { class: 'toggle' }, sfxToggle, ' Sound effects'),
      h('label', { class: 'toggle' }, musicToggle, ' Music'),
      h('h3', {}, 'Reminders and healthy play'),
      h('label', { class: 'toggle' }, remindToggle, ' Send me notifications (off until you turn it on)'),
      typeBox,
      h('label', { class: 'toggle' }, breakToggle, ' Suggest a break after an hour of play'),
      h('p', { class: 'muted small' }, this.deps.reminderNote),
      h('div', { class: 'actions' }, h('button', { class: 'btn ghost', type: 'button', onclick: () => { this.closeAllModals(); this.deps.onReplayTutorial(); } }, 'Replay the tutorial')),
      h('h3', {}, 'Display'),
      h('label', { class: 'toggle' }, fpsToggle, ' Show frame rate (fps)'),
      this.qualityRow(),
    );

    // Testing tools: only in the sandbox, which has its own village and never goes online.
    const offsetText = () => (this.deps.debugTime.offsetMs() ? `Sandbox clock is ${formatDuration(this.deps.debugTime.offsetMs())} ahead of real time.` : 'Sandbox clock matches real time.');
    const offsetEl = h('p', { class: 'muted' }, offsetText());
    const events = h('div', { class: 'events' }, 'Loading…');
    if (this.deps.sandbox) {
      body.append(
        h('h3', {}, 'Testing tools (sandbox)'),
        h('p', { class: 'muted' }, 'This is the testing sandbox: a separate practice village with online play off. Skipping time moves the sandbox clock ahead for good; your real village is never affected.'),
        offsetEl,
        h(
          'div',
          { class: 'actions' },
          h('button', { class: 'btn ghost', type: 'button', onclick: () => { this.deps.debugTime.skip(3_600_000); offsetEl.textContent = offsetText(); this.c.tick(); this.refresh(); } }, '+1 hour'),
          h('button', { class: 'btn ghost', type: 'button', onclick: () => this.simulateAway(8) }, 'Simulate 8 hours away'),
          h('button', { class: 'btn ghost', type: 'button', onclick: () => this.dropShield() }, 'Remove shield'),
        ),
        h('p', { class: 'muted small' }, 'New villages start with a 24-hour shield. Remove it, then simulate time away, to see raiders attack your village.'),
      );
    } else {
      body.append(
        h('h3', {}, 'Testing tools'),
        h('p', { class: 'muted small' }, 'Time skips and test purchases live in a separate testing sandbox, so they can never change your real village or online play.'),
        h('div', { class: 'actions' }, h('button', { class: 'btn ghost', type: 'button', onclick: () => { location.search = '?sandbox'; } }, 'Open the testing sandbox')),
      );
    }
    if (this.deps.crashReports) {
      // Opt-in (off until switched on): matches the privacy policy and store declarations (worldwide audit GLOBAL-019).
      const crashToggle = h('input', { type: 'checkbox', checked: prefs.get('crashReports') }) as HTMLInputElement;
      crashToggle.addEventListener('change', () => prefs.set('crashReports', crashToggle.checked));
      body.append(
        h('label', { class: 'toggle' }, crashToggle, ' Send crash reports (off until you turn it on)'),
        h('p', { class: 'muted small' }, 'When the game hits an error, it sends the error message, where in the code it happened, the game version and the platform, to help fix it. It does not add your name, Player ID, village or chat, but an error message can sometimes include text the game was working on.'),
      );
    }
    body.append(this.privacySection());
    body.append(h('details', {}, h('summary', {}, 'Analytics events (this device)'), events));
    void this.deps.analytics.recent(60).then((list) => {
      clear(events);
      if (!list.length) events.append('No events yet.');
      for (const e of list) {
        events.append(h('div', { class: 'event' }, h('b', {}, e.name), ` ${new Date(e.at).toLocaleTimeString()} `, h('code', {}, JSON.stringify(e.props))));
      }
    });

    // Reset
    body.append(
      h('h3', {}, 'Start over'),
      h('div', { class: 'actions' }, h('button', { class: 'btn danger', type: 'button', onclick: () => this.resetVillage() }, 'Start a new village')),
      h('p', { class: 'muted small' }, `Kagemura: Ninja Clans ${this.deps.build.version} · built ${this.deps.build.builtAt}`),
    );
    this.modal('Settings', body, [], 'wide');
  }

  /**
   * Settings → Privacy and help (worldwide audit GLOBAL-015, R06): the privacy policy, support, community rules and
   * account deletion. Each address comes from the build (VITE_PRIVACY_URL, VITE_SUPPORT_URL, VITE_COMMUNITY_URL,
   * VITE_SUPPORT_EMAIL), else the pages shipped with the game in public/, which work without a connection. On the
   * web they open in a new tab. Inside the iOS/Android app a shipped page is not on the open web (a system browser
   * could not load it), so it opens in a frame inside the game instead; a configured public address opens outside.
   */
  /** Settings → Display → Graphics (audit R03): Auto / Smooth on older phones (low) / Sharp (high); applies after a restart. */
  private qualityRow(): HTMLElement {
    const now = quality();
    const select = h(
      'select',
      { class: 'text', 'aria-label': 'Graphics quality' },
      ...(
        [
          ['auto', `Automatic (now: ${now.profile === 'low' ? 'lighter' : 'sharp'})`],
          ['low', 'Lighter: for older or low-memory phones, saves battery'],
          ['high', 'Sharp: full detail'],
        ] as [QualityChoice, string][]
      ).map(([v, label]) => h('option', { value: v, ...(getQualityChoice() === v ? { selected: true } : {}) }, label)),
    ) as HTMLSelectElement;
    const note = h('p', { class: 'muted small' }, `Graphics: ${now.profile === 'low' ? 'lighter' : 'sharp'} (${now.reason}).`);
    select.addEventListener('change', () => {
      if (setQualityChoice(select.value as QualityChoice)) {
        note.textContent = 'Restart the game to apply the new graphics setting.';
        const restart = h('button', { class: 'btn ghost', type: 'button', onclick: () => location.reload() }, 'Restart now');
        note.append(' ', restart);
      }
    });
    return h('div', {}, h('label', { class: 'toggle' }, 'Graphics ', select), note);
  }

  private privacySection(): HTMLElement {
    const env = import.meta.env as Record<string, string | undefined>;
    const native = Capacitor.isNativePlatform();
    const link = (label: string, configured: string | undefined, shipped: string) => {
      const url = configured?.trim() || shipped;
      if (native && !/^https?:/i.test(url)) {
        return h('button', { class: 'btn ghost', type: 'button', onclick: () => this.modal(label, h('iframe', { class: 'legal-frame', src: url, title: label }), [], 'wide') }, label);
      }
      return h('a', { class: 'btn ghost', href: url, target: '_blank', rel: 'noopener' }, label);
    };
    const email = env.VITE_SUPPORT_EMAIL?.trim();
    const serverUrl = this.deps.connection.url;
    const section = h(
      'div',
      { class: 'privacy-links' },
      h('h3', {}, 'Privacy and help'),
      h(
        'div',
        { class: 'actions' },
        link('Privacy policy', env.VITE_PRIVACY_URL, './privacy.html'),
        link('Support', env.VITE_SUPPORT_URL, './support.html'),
        link('Community rules', env.VITE_COMMUNITY_URL, './community.html'),
        ...(email ? [h('a', { class: 'btn ghost', href: `mailto:${email}?subject=${encodeURIComponent('Kagemura support')}` }, `Email ${email}`)] : []),
      ),
      serverUrl
        ? h('p', { class: 'muted small' }, 'Delete your online account: Settings → Online play → Account, or on the web: ', h('a', { href: `${serverUrl}/account/delete`, target: '_blank', rel: 'noopener' }, 'account deletion page'), '.')
        : this.deps.connection.storedAccounts().length
          ? h('p', { class: 'muted small' }, 'Online play is off on this device, but your online account still exists on the server: delete it under Settings → Online play. Your village on this device: "Start a new village" below erases it; uninstalling the app or clearing this site\'s data removes it completely.')
          : h('p', { class: 'muted small' }, 'There is no online account on this device: your village is kept only here. "Start a new village" below erases it; uninstalling the app or clearing this site\'s data removes it completely.'),
    );
    return section;
  }

  private exportSave(box: HTMLTextAreaElement): void {
    void this.c.save();
    const code = encodeExportCode(serialize(this.c.state, this.c.now()));
    box.value = code;
    box.select();
    this.deps.analytics.log('save_export', { length: code.length });
    const done = () => this.toast('Save code copied. Paste it on your other device.', 'success');
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(code).then(done, () => this.toast('Select the code and copy it.', 'info'));
    } else {
      try {
        document.execCommand('copy');
        done();
      } catch {
        this.toast('Select the code and copy it.', 'info');
      }
    }
  }

  private async importSave(code: string): Promise<void> {
    if (!code.trim()) {
      this.toast('Paste a save code first.', 'info');
      return;
    }
    let village;
    try {
      village = deserialize(decodeExportCode(code), this.c.data);
    } catch (e) {
      this.toast((e as Error).message, 'error');
      return;
    }
    const ok = await this.confirm('Load this village?', 'It will replace the village on this device. Copy a save code first if you want to keep this one.', 'Replace village', true);
    if (!ok) return;
    await this.c.replace(village);
    this.deps.analytics.log('save_import', {});
    this.closeAllModals();
    this.bus.emit('select', null);
    this.toast('Village loaded!', 'success');
  }

  private async simulateAway(hours: number): Promise<void> {
    await this.c.save();
    this.deps.debugTime.skip(hours * 3_600_000);
    location.reload();
  }

  private async dropShield(): Promise<void> {
    await this.c.replace({ ...this.c.state, shieldUntil: this.c.now() });
    this.toast('Shield removed. Raiders can now find your village while you are away.', 'info');
  }

  private async resetVillage(): Promise<void> {
    const ok = await this.confirm('Start a new village?', 'Your current village on this device will be deleted. This cannot be undone.', 'Delete and start over', true);
    if (!ok) return;
    await this.c.reset();
    this.closeAllModals();
    this.bus.emit('select', null);
    this.toast('A fresh village awaits.', 'success');
  }

  // ------------------------------------------------------------ toasts and modals

  toast(text: string, kind: 'info' | 'error' | 'success' = 'info'): void {
    if (kind === 'error') sound.play('error');
    const t = h('div', { class: `toast ${kind}` }, text);
    this.toasts.append(t);
    while (this.toasts.childElementCount > 3) this.toasts.firstElementChild?.remove();
    window.setTimeout(() => t.classList.add('out'), 2600);
    window.setTimeout(() => t.remove(), 3000);
  }

  /** Shadow Trials: the endless practice ladder. Clearly a practice mode, not other players. */
  openTrials(): void {
    const gd = this.c.data;
    const best = this.c.state.trials.best;
    const next = nextTrialTier(best);
    const info = trialInfo(next, gd, trialVariant(this.c.state.trials, next));
    const alternate = canTryAlternate(this.c.state.trials, gd);
    const body = h('div', {});
    body.append(
      h('p', {}, 'An endless ladder of practice fortresses guarded by the clan. Each tier is harder than the last, and there is no top.'),
      h('p', { class: 'muted small' }, `Practice mode: these are generated fortresses, not other players. Clear a tier with ${gd.trials.starsToClear} or more stars to open the next one. Each tier pays its reward once. Troops you use are spent, as in any raid.`),
      h(
        'div',
        { class: 'log-row current' },
        h(
          'div',
          {},
          h('b', {}, `Tier ${next} · ${info.layout.name}`),
          h('div', { class: 'muted small' }, `Clan Keep ${info.hall}${info.power > 1 ? ` · defenses ×${info.power < 100 ? info.power.toFixed(2) : formatCompact(Math.round(info.power))}` : ''}${info.modifiers.length ? ` · ${info.modifiers.map((m) => m.name).join(', ')}` : ''}`),
          h('div', { class: 'small' }, info.layout.tip),
          ...info.modifiers.map((m) => h('div', { class: 'small' }, `${m.name}: ${m.description}`)),
        ),
        h('div', { class: 'cost' }, ...Object.entries(trialReward(next, gd)).map(([k, v]) => h('span', { class: 'chip good' }, icon(icons[k as 'acorns' | 'dew' | 'moonstones']), formatNumber(v ?? 0)))),
      ),
      h('p', { class: 'muted small' }, best > 0 ? `Best: tier ${best}. You can replay any cleared tier for practice (no reward).` : 'You have not cleared a tier yet.'),
    );
    if (alternate) body.append(h('p', { class: 'note' }, `Stuck on tier ${next}? You can switch it to a different fortress of the same strength and reward (${gd.trials.maxAlternates - (this.c.state.trials.alternate ?? 0)} switches left for this tier, one after each failed attempt).`));
    const close = this.modal('Shadow Trials', body, [
      best > 0 && { label: `Replay tier ${best}`, onClick: () => { close(); this.deps.onTrial(best); } },
      alternate && { label: 'Try a different fortress', onClick: () => { const r = this.c.dispatch({ type: 'trialAlternate' }); close(); if (r.ok) this.openTrials(); else this.toast(r.message, 'error'); } },
      { label: `Scout tier ${next}`, primary: true, onClick: () => { close(); this.deps.onTrial(next); } },
    ]);
  }

  modal(
    title: string,
    body: HTMLElement,
    buttons: (false | undefined | null | { label: string; primary?: boolean; danger?: boolean; onClick: () => void })[] = [],
    size: 'normal' | 'wide' = 'normal',
    onClose?: () => void,
  ): () => void {
    const backdrop = h('div', { class: 'modal-backdrop' });
    let closed = false;
    sound.play('open');
    // Dialog accessibility (client re-audit item 15): named by its title, focus moves in, Tab
    // stays inside the top dialog, and focus goes back where it was when the dialog closes.
    const opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    const titleId = `modal-title-${++Hud.modalSeq}`;
    const close = () => {
      if (closed) return;
      closed = true;
      sound.play('close');
      backdrop.remove();
      document.removeEventListener('keydown', onKey);
      this.openModals.delete(close);
      onClose?.();
      // Back to the opener if it is still on screen, else into the dialog now on top.
      const below = this.modalRoot.querySelector<HTMLElement>('.modal-backdrop:last-child .modal');
      const target = opener && opener.isConnected && !opener.closest('[hidden]') ? opener : below;
      if (target && !document.querySelector('.modal-backdrop .modal:focus-within')) target.focus({ preventScroll: true });
    };
    this.openModals.add(close);
    const focusables = (): HTMLElement[] =>
      [...panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])')].filter(
        (el) => !el.closest('[hidden]') && el.getClientRects().length > 0,
      );
    const onKey = (e: KeyboardEvent) => {
      // Only the dialog on top answers (a confirm opened over Settings closes first).
      if (backdrop !== this.modalRoot.lastElementChild) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'Tab') {
        const items = focusables();
        if (!items.length) {
          e.preventDefault();
          panel.focus();
          return;
        }
        const first = items[0];
        const last = items[items.length - 1];
        const inside = panel.contains(document.activeElement);
        if (e.shiftKey && (document.activeElement === first || document.activeElement === panel || !inside)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    const footer = h('div', { class: 'modal-foot' });
    for (const b of buttons) {
      if (!b) continue;
      footer.append(h('button', { class: `btn${b.primary ? ' primary' : ''}${b.danger ? ' danger' : ''}`, type: 'button', onclick: b.onClick }, b.label));
    }
    const panel = h(
      'div',
      { class: `modal ${size}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, tabindex: '-1' },
      h('div', { class: 'modal-head' }, h('h2', { id: titleId }, title), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: close }, icon(icons.close))),
      h('div', { class: 'modal-body' }, body),
      footer.childElementCount ? footer : null,
    );
    backdrop.append(panel);
    backdrop.addEventListener('pointerdown', (e) => {
      if (e.target === backdrop) close();
    });
    document.addEventListener('keydown', onKey);
    this.modalRoot.append(backdrop);
    // The dialog itself takes focus (screen readers announce its title; no keyboard pops up for a text field).
    panel.focus({ preventScroll: true });
    return close;
  }

  private static modalSeq = 0;

  /**
   * Close whatever is on top (Android Back, client re-audit item 6): the top dialog (including the
   * in-game legal page frame), else the building sheet. Returns false when nothing was open.
   */
  closeTop(): boolean {
    const top = [...this.openModals].pop();
    if (top) {
      top();
      return true;
    }
    if (!this.sheet.hidden) {
      this.bus.emit('select', null);
      return true;
    }
    return false;
  }

  closeAllModals(): void {
    for (const close of [...this.openModals]) close();
  }

  confirm(title: string, message: string, confirmLabel: string, danger = false, cancelLabel = 'Keep it'): Promise<boolean> {
    return new Promise((resolve) => {
      let answer = false;
      const close = this.modal(
        title,
        h('p', {}, message),
        [
          { label: cancelLabel, onClick: () => close() },
          { label: confirmLabel, primary: !danger, danger, onClick: () => { answer = true; close(); } },
        ],
        'normal',
        // Closing with X, Escape or the backdrop counts as "no".
        () => resolve(answer),
      );
    });
  }
}
