import { messageText as i18nMessage, dateText as i18nDate, listText as i18nList } from './i18n';
import { displayData as localizedData, labelText as i18nLabel } from './i18n';
import { t as i18nText } from './i18n';
import { automaticLanguage, language, languageCoverage, languagePreference, languages, READY_COVERAGE, setLanguagePreference, useLanguage, t } from './i18n';
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
import { rematchable } from '../../gameplay/sim/rematch';
import { stipendStatus } from '../../gameplay/sim/stipend';
import { shieldHoursFor } from '../../gameplay/sim/defense';
import { leagueChest, leagueFor, nextLeague, seasonEndsAt } from '../../gameplay/sim/ranks';
import { achievementViews } from '../../gameplay/sim/achievements';
import { activeOffers } from '../../gameplay/sim/offers';
import { currentTasks, unlockedTier } from '../../gameplay/sim/pass';
import { ArmyUi } from './armyUi';
import { costChips, RES_LABEL } from './chips';
import { PROVIDER_NAMES, storeAgeSignal } from '../../backend/platform/auth';
import type { AgeBand } from '../../gameplay/sim/age';
import { askAgeBand } from './ageScreen';
import { bandFromProfile } from '../../gameplay/sim/age';
import { nextObjective } from '../../gameplay/sim/objective';
import { calendarView } from '../../gameplay/sim/calendar';
import { advance } from '../../gameplay/sim/village';
import { EconomyUi } from './economyUi';
import { DailyUi } from './dailyUi';
import { chestReady } from '../../gameplay/sim/daily';
import { sound } from '../audio/sound';
import { FriendsUi } from './friendsUi';
import { GangWarUi } from './gangWarUi';
import { GroveUi } from './groveUi';
import { WARRIORS as CANONICAL_WARRIORS, MODEL as CANONICAL_MODEL } from '../../gameplay/sim/progression';
import type { GroveSource } from '../../backend/social/groveSource';
import { Connection } from '../../backend/net/connection';
import { attacksLeft, raidPhase } from '../../gameplay/sim/social/groveRaid';
import { builderStatus, countOfType, hallLevel, limitFor, placeQuote, skipQuote, topUpQuote, upgradeQuote, type QuoteResult } from '../../gameplay/sim/village';
import { troopLevelOf } from '../../gameplay/sim/research';
import { role as canonicalRoleDef, warriorUnlockKeep } from '../../gameplay/sim/progression';
import { canTryAlternate, nextTrialTier, trialInfo, trialReward, trialVariant } from '../../gameplay/sim/trials';
import type { UiBus } from './bus';
import { clear, h, icon } from './dom';
import { formatCompact, formatDuration, formatNumber } from './format';
import { icons } from './icons';
import { getQualityChoice, quality, setQualityChoice, type QualityChoice } from '../render/quality';
import { uiArt } from './feedback';

const MODEL = localizedData(CANONICAL_MODEL, 'progression');
const WARRIORS = localizedData(CANONICAL_WARRIORS, 'roster.warriors');
const roleDef = (id: Parameters<typeof canonicalRoleDef>[0]) => localizedData(canonicalRoleDef(id), `progression.roles.${id}`);

/** What sharing play statistics means, in Settings and in the one-time question (main.ts). */
export const STATS_EXPLAINER =
  'Sends what you do in the game (sessions, tutorial steps, raids, upgrades, offers seen and purchases, with their numbers) under a random statistics id, never your name, Player ID, village, chat or IP address, so we can see where players get stuck. Turning it on also sends what this device recorded so far; turning it off deletes what was sent.';

export interface HudDeps {
  root: HTMLElement;
  controller: GameController;
  bus: UiBus;
  analytics: Analytics;
  store: SaveStore;
  /** Data URL of a building's art, for the Build menu. */
  thumbnail(type: string): string | null;
  /** Data URL of the Clan Keep at the player's level wearing a look (Store → Looks). */
  skinThumbnail?(skin: string): string | null;
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
  /**
   * Sharing play statistics (report section 5 step 5; backend `analytics/share.ts`): Settings shows the switch
   * while `available` (an adult, a server that takes them). Off until the player says yes.
   */
  stats?: { readonly available: boolean; readonly on: boolean; set(on: boolean): Promise<void> };
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
  /** Settle the score with a simulated raider (app.ts: a battle settled with `rematchEnd`). */
  onRematch?(defenseId: string): void;
  /** Attack a goal event's bounty fortress (app.ts: a battle settled with `bountyEnd`). */
  onBounty?(eventKey: string, base: import('../../gameplay/sim/battle/types').BaseLayout): void;
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
  readonly daily: DailyUi;
  private readonly army: ArmyUi;
  private armyPill = h('span', { class: 'army-pill' });
  private eventChip!: HTMLElement;
  private railBadges: Record<string, HTMLElement> = {};
  /** Rail buttons by label, shown as the player gets to them (re-audit design item 4). */
  private railBtns: Record<string, HTMLElement> = {};
  private railToggle!: HTMLButtonElement;
  private railCollapsed = false;
  private unlockChip!: HTMLElement;
  /** Report section 5 step 8 (growth 7): the one next thing to do, under the top bar. */
  private objectiveChip!: HTMLButtonElement;
  private objectiveAction: (() => void) | null = null;
  private objectiveAt = 0;
  private objectiveSig = '';
  /** True while a finger/mouse is pressed on the panel: never rebuild it mid-tap. */
  private sheetPressed = false;
  private sheetSig = '';

  constructor(private readonly deps: HudDeps) {
    this.c = deps.controller;
    this.bus = deps.bus;
    this.root = deps.root;
    // The low quality profile drops costly CSS (dialog blur) too (re-audit design item 10).
    document.documentElement.classList.toggle('q-low', quality().profile === 'low');
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
      skinThumb: (skin) => this.deps.skinThumbnail?.(skin) ?? null,
      askAge: (why) => this.askAge(why),
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
    this.daily = new DailyUi(
      { c: this.c, modal: (...a) => this.modal(...a), confirm: (...a) => this.confirm(...a), toast: (...a) => this.toast(...a), closeAllModals: () => this.closeAllModals() },
      { stipendCard: (redraw) => this.econ.stipendCard(redraw), onBounty: this.deps.onBounty ? (key, base) => this.deps.onBounty!(key, base) : undefined },
    );
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
    this.deps.connection.ageGate = () => this.askAge(i18nText("ui.online_play_connects_you_with_other_pl_b3fdd9a482"));
    // Report section 5 step 6 (economy E02): the age used to be asked only at a first purchase or before
    // going online, so an offline player never got the protections or offers for their age. Ask once,
    // with the same neutral screen, when the tutorial ends (or at the next start for a village past it).
    this.tutorialWasDone = this.c.state.tutorial.done;
    if (this.tutorialWasDone) window.setTimeout(() => this.askAgeAfterTutorial(), 8000);
    this.c.subscribe(() => {
      if (this.c.state.tutorial.done && !this.tutorialWasDone) window.setTimeout(() => this.askAgeAfterTutorial(), 1500);
      this.tutorialWasDone = this.c.state.tutorial.done;
    });
    this.deps.connection.subscribe(() => this.updateNet());
    this.deps.connection.subscribe(() => this.showNewNotices());
    this.updateNet();
    this.deps.groveSource.subscribe(() => this.refresh());
    this.c.onOffer((rule) => this.econ.showOffer(rule));
    // Report section 5 step 8 (growth 8): notifications stay off until the player says yes, but the
    // question is asked once at the moment it helps: right after the first long timer they start.
    this.c.onEvents((events) => {
      if (events.some((e) => e.kind === 'upgrade_start' && e.seconds > 3600)) window.setTimeout(() => void this.askNotificationsOnce(), 1200);
    });
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
      if (this.showFps) this.fpsEl.textContent = i18nText("ui.fps_1912a77d6b", { arg1: Math.round(this.deps.getFps()) });
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
    const moonBtn = h('div', { class: 'res res-moonstones', title: i18nText("ui.jade_tap_for_the_store_92edb2dd88"), role: 'button' }, icon(icons.moonstones, 'res-icon'), h('div', { class: 'res-body' }, moonAmt), h('span', { class: 'res-plus' }, '+'));
    moonBtn.addEventListener('click', () => this.econ.openStore());
    top.append(moonBtn);
    this.resEls.set('moonstones', { amt: moonAmt, bar: h('i'), cap: null });
    this.buildersEl = h('span', { class: 'res-amt' });
    top.append(h('div', { class: 'res res-builders', title: i18nText("ui.free_village_artisans_747cc3abe1") }, icon(icons.beaver, 'res-icon'), h('div', { class: 'res-body' }, this.buildersEl)));
    this.trophiesEl = h('span', { class: 'res-amt' });
    const trophyBtn = h('div', { class: 'res res-trophies', title: i18nText("ui.honor_22ea092e76"), role: 'button' }, icon(icons.leaf, 'res-icon'), h('div', { class: 'res-body' }, this.trophiesEl));
    trophyBtn.addEventListener('click', () => this.openLeague());
    top.append(trophyBtn);
    this.shieldEl = h('span', { class: 'res-amt' });
    this.shieldBox = h('div', { class: 'res res-shield', title: i18nText("ui.shield_no_raids_until_it_runs_out_66720696b4") }, icon(icons.shield, 'res-icon'), h('div', { class: 'res-body' }, this.shieldEl));
    top.append(this.shieldBox);
    this.netPill = h('button', { class: 'net-pill', type: 'button', title: i18nText("ui.online_play_17a5942b34"), onclick: () => this.openSettings(true) });
    this.netPill.hidden = !this.deps.connection.enabled;
    top.append(this.netPill);

    this.unlocksEl = h('button', { class: 'unlocks', type: 'button', onclick: () => this.openUnlocks() });
    // Events live in the rail (re-audit design item 4): its pill shows the countdown.
    this.eventChip = h('span', { class: 'rail-pill' });
    try {
      this.railCollapsed = localStorage.getItem('tk.railCollapsed') === '1';
    } catch {
      /* storage blocked: expanded */
    }
    // The Keep-unlock preview is a one-line chip the player can dismiss (until the next Keep level); the full list is
    // on the Keep's sheet.
    const unlockX = h('button', { class: 'unlock-x', type: 'button', 'aria-label': i18nText("ui.hide_the_keep_unlock_preview_0ba3672b67"), onclick: () => this.dismissUnlockChip() }, icon(icons.close));
    this.unlockChip = h('div', { class: 'unlock-chip' }, this.unlocksEl, unlockX);
    this.toasts = h('div', { class: 'toasts', 'aria-live': 'polite' });
    this.fpsEl = h('div', { class: 'fps' });
    this.fpsEl.hidden = !this.showFps;

    this.bottomBar = h(
      'div',
      { class: 'hud-bottom' },
      h(
        'div',
        { class: 'group' },
        h('button', { class: 'round-btn', type: 'button', 'data-id': 'settings', 'aria-label': t('hud.settings'), onclick: () => this.openSettings() }, icon(icons.gear)),
        h('button', { class: 'round-btn', type: 'button', 'data-id': 'log', 'aria-label': t('hud.battleLog'), onclick: () => this.openLog() }, icon(icons.scroll)),
        h('button', { class: 'round-btn', type: 'button', 'data-id': 'army', 'aria-label': t('hud.army'), onclick: () => this.openTraining() }, icon(icons.troops), this.armyPill),
      ),
      h(
        'div',
        { class: 'group' },
        h('button', { class: 'round-btn big attack', type: 'button', 'data-id': 'attack', 'aria-label': t('hud.attack'), onclick: () => this.deps.onAttack() }, icon(icons.swords), h('span', {}, t('hud.attack'))),
        h('button', { class: 'round-btn big build', type: 'button', 'data-id': 'build', 'aria-label': t('hud.build'), onclick: () => this.openShop() }, icon(icons.hammer), h('span', {}, t('hud.build'))),
      ),
    );

    this.placeOk = h('button', { class: 'round-btn ok', type: 'button', 'aria-label': i18nText("ui.place_here_6c8bd5460b"), onclick: () => this.bus.emit('placement:confirm') }, icon(icons.check));
    this.placeBar = h(
      'div',
      { class: 'place-bar' },
      h('button', { class: 'round-btn cancel', type: 'button', 'aria-label': i18nText("ui.cancel_19766ed6cc"), onclick: () => this.bus.emit('placement:cancel') }, icon(icons.close)),
      h('div', { class: 'place-hint' }, i18nText("ui.drag_the_building_or_tap_where_it_shou_d9096f4125")),
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

    this.objectiveChip = h('button', { class: 'objective-chip', type: 'button', hidden: true, onclick: () => this.objectiveAction?.() }) as HTMLButtonElement;
    const head = h('div', { class: 'hud-head' }, top, h('div', { class: 'head-row' }, this.objectiveChip, this.unlockChip), this.toasts);
    const railBtn = (label: 'Daily' | 'Store' | 'Events' | 'Pass' | 'Goals' | 'Alliance' | 'Friends' | 'Trials', ic: string, onClick: () => void, extra?: HTMLElement) => {
      const badge = h('span', { class: 'badge' });
      badge.hidden = true;
      this.railBadges[label] = badge;
      const b = h('button', { class: 'round-btn', type: 'button', 'data-id': label.toLowerCase(), 'aria-label': t(`rail.${label}`), title: t(`rail.${label}`), onclick: onClick }, icon(ic), badge, extra ?? null);
      this.railBtns[label] = b;
      return b;
    };
    // Collapsible (re-audit design item 4): folded, one button shows how many things are waiting.
    this.railToggle = h('button', { class: 'round-btn rail-toggle', type: 'button', onclick: () => this.toggleRail() }, h('span', { class: 'rail-caret', 'aria-hidden': 'true' }), h('span', { class: 'badge' })) as HTMLButtonElement;
    const rail = h(
      'div',
      { class: 'side-rail' },
      this.railToggle,
      railBtn("Daily", icons.chest, () => this.daily.openDaily()),
      railBtn("Store", icons.moonstones, () => this.econ.openStore(activeOffers(this.c.state, this.c.now()).length ? 'offers' : 'moonstones')),
      railBtn("Events", icons.clock, () => this.daily.openEvents(), this.eventChip),
      railBtn("Pass", icons.lantern, () => this.econ.openPass()),
      railBtn("Goals", icons.star, () => this.econ.openGoals()),
      railBtn("Alliance", icons.grove, () => this.grove.open()),
      railBtn("Friends", icons.friends, () => this.friends.open()),
      railBtn("Trials", icons.leaf, () => this.openTrials()),
    );
    this.rail = rail;
    this.root.append(head, rail, this.fpsEl, this.bottomBar, this.placeBar, this.sheet, this.modalRoot);
  }

  // ------------------------------------------------------------ refresh

  private tutorialWasDone = false;

  /**
   * Report section 5 step 9: the language, a device preference (never in the save). "Automatic" follows the
   * device. Only languages whose interface is mostly translated are offered; the rest arrive with the
   * translation sessions (locales/CLAUDE.md). A change reloads after saving, so nothing is lost.
   */
  private languageRow(): HTMLElement {
    const wrap = h('div', { class: 'language-row' });
    const select = h('select', { 'aria-label': t('settings.language') }) as HTMLSelectElement;
    const pref = languagePreference();
    select.append(h('option', { value: 'auto' }, t('settings.languageAuto', { name: language().native })));
    void (async () => {
      for (const l of languages()) {
        if ((await languageCoverage(l.code)) < READY_COVERAGE) continue;
        const o = h('option', { value: l.code, lang: l.code }, l.native) as HTMLOptionElement;
        if (pref === l.code) o.selected = true;
        select.append(o);
      }
    })();
    select.addEventListener('change', () => {
      const pref = select.value === 'auto' ? null : select.value;
      select.disabled = true;
      void useLanguage(pref ?? automaticLanguage()).then(() => {
        setLanguagePreference(pref);
        return this.c.persist().catch(() => false).finally(() => location.reload());
      }, () => { select.disabled = false; select.value = languagePreference() ?? 'auto'; this.toast(t('boot.languageError'), 'error'); });
    });
    wrap.append(h('h3', {}, t('settings.language')), select, h('p', { class: 'muted small' }, t('settings.languageNote')));
    return wrap;
  }

  /** The one contextual notifications question (never during the tutorial, never twice on a device). */
  private async askNotificationsOnce(): Promise<void> {
    const KEY = 'tk.notifyAsked';
    if (!this.c.state.tutorial.done || this.deps.prefs.get('reminders')) return;
    try {
      if (localStorage.getItem(KEY) || document.querySelector('.modal-root .modal')) return;
      localStorage.setItem(KEY, '1');
    } catch {
      return;
    }
    const yes = await this.confirm(
      i18nText("ui.a_nudge_when_it_finishes_e209c0825a"),
      i18nText("ui.kagemura_can_tell_you_when_the_timers__b8761751d2"),
      i18nText("ui.yes_remind_me_5c3b401d5b"),
      false,
      i18nText("ui.no_thanks_49780701dc"),
    );
    if (!yes) return;
    this.deps.prefs.set('reminders', true);
    await this.deps.onRemindersEnabled();
  }

  /**
   * The age band: the store's signal first, then the game's neutral screen. Report section 5 step 7 (compliance
   * C01): where the store requires the player to verify their age (Play in US states with an app-store age
   * law), the game says so and does not ask its own question instead.
   */
  async askAge(why: string): Promise<AgeBand | null> {
    const signal = await storeAgeSignal();
    if (signal.kind === 'band') return signal.band;
    if (signal.kind === 'verify') {
      this.modal(
        i18nText("ui.verify_your_age_5c126194cb"),
        h('p', {}, signal.store === 'play' ? i18nText("ui.where_you_live_google_play_confirms_ag_e48561a563") : i18nText("ui.where_you_live_the_app_store_confirms__a1a091a595")),
      );
      return null;
    }
    return askAgeBand({ c: this.c, modal: (...a) => this.modal(...a) }, why);
  }

  /** The one-time age question after the tutorial (economy E02). "Not now" is not asked again on this device. */
  private async askAgeAfterTutorial(): Promise<void> {
    const KEY = 'tk.ageAskedAfterTutorial';
    const s = this.c.state;
    if (!s.tutorial.done || bandFromProfile(s.profile) || s.profile.under18 !== null) return;
    try {
      if (localStorage.getItem(KEY)) return;
      // Never on top of another dialog (a result screen, the daily chest): try again shortly.
      if (document.querySelector('.modal-root .modal')) return void window.setTimeout(() => this.askAgeAfterTutorial(), 15000);
      localStorage.setItem(KEY, '1');
    } catch {
      return; // no storage: never nag on every start
    }
    const band = await this.askAge(i18nText("ui.you_finished_the_training_please_enter_77063a1caf"));
    if (band && !bandFromProfile(this.c.state.profile)) this.c.dispatch({ type: 'setProfile', under18: band !== 'adult', ageBand: band });
  }

  private refresh(): void {
    const s = this.c.state;
    const gd = localizedData(this.c.data);
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
    this.updateRail();
    this.updateBadges();
    this.renderUnlockChip();
    this.renderObjective();
    this.renderSheet();
  }

  /**
   * Progressive disclosure (re-audit design item 4): a new clan sees the free chest and the store; the rest of the
   * rail appears as the player gets to it (Pass, Goals, Events and Alliance after the tutorial or Keep 2, Trials after
   * the first raid, Friends only when online play offers them). Nothing is taken away from a player who has it.
   */
  private updateRail(): void {
    if (!this.railToggle) return;
    const s = this.c.state;
    const keep = hallLevel(s, localizedData(this.c.data));
    const settled = s.tutorial.done || keep >= 2;
    const raided = s.battleLog.some((r) => r.kind === 'attack') || s.trials.best > 0;
    const show: Record<string, boolean> = {
      Daily: true,
      Store: true,
      Events: settled,
      Pass: settled,
      Goals: settled,
      Alliance: settled || s.grove.joined,
      Friends: this.deps.connection.canFriends,
      Trials: raided,
    };
    for (const [label, b] of Object.entries(this.railBtns)) b.hidden = this.railCollapsed || !show[label];
    const shown = Object.entries(show).filter(([, v]) => v).length;
    // A rail of one or two buttons needs no fold.
    this.railToggle.hidden = shown <= 2;
    this.railToggle.classList.toggle('collapsed', this.railCollapsed);
    this.railToggle.setAttribute('aria-expanded', String(!this.railCollapsed));
    this.railToggle.setAttribute('aria-label', this.railCollapsed ? i18nText("ui.show_the_side_buttons_b065f035ed") : i18nText("ui.hide_the_side_buttons_9d1fa3c586"));
    if (this.railToggle.hidden && this.railCollapsed) {
      this.railCollapsed = false;
      this.updateRail();
    }
  }

  private toggleRail(): void {
    this.railCollapsed = !this.railCollapsed;
    try {
      localStorage.setItem('tk.railCollapsed', this.railCollapsed ? '1' : '0');
    } catch {
      /* storage blocked: this session only */
    }
    this.updateRail();
    this.updateBadges();
  }

  /** The Events button's pill: time left on the running event, else when the next starts. */
  private updateEventPill(): void {
    const text = DailyUi.chipText(this.c.now(), this.c);
    const live = !text.startsWith('Next') && text !== 'Events';
    const short = text.includes('·') ? text.split('·').pop()!.replace(' left', '').trim() : text.replace(/^Next: .* in /, '');
    this.eventChip.textContent = short;
    this.eventChip.classList.toggle('live', live);
    this.railBtns.Events?.setAttribute('aria-label', i18nText("ui.events_f1a48ff1d1", { arg1: text }));
    this.railBtns.Events?.setAttribute('title', text);
  }

  private updateBadges(): void {
    const s = this.c.state;
    const gd = localizedData(this.c.data);
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
    set('Daily', (chestReady(s, this.c.now(), gd) ? 1 : 0) + (stipendStatus(s, this.c.now(), gd).claimable ? 1 : 0) + (calendarView(s, this.c.now(), hl, gd)?.ready ? 1 : 0));
    const tier = unlockedTier(s, gd);
    const tiersReady = gd.pass.tiers.filter((t) => t.tier <= tier && (!s.pass.claimedFree.includes(t.tier) || (s.pass.premium && !s.pass.claimedPremium.includes(t.tier)))).length;
    const tasksReady = currentTasks(s, hl, gd).filter((t) => !t.claimed && t.progress >= t.target).length;
    set('Pass', tiersReady + tasksReady);
    set('Goals', achievementViews(s, hl, gd).filter((v) => v.claimable).length);
    set('Events', 0);
    const live = raidPhase(this.c.now(), gd);
    if (this.deps.groveSource.kind === 'online') {
      const g = this.deps.groveSource.snapshot();
      set('Alliance', g.joined ? (g.raid.phase === 'live' ? g.raid.attacksLeft : 0) + g.requests.length : g.loading ? 0 : 1);
    } else {
      set('Alliance', s.grove.joined ? (live.phase === 'live' ? attacksLeft(s, live.week, gd) : 0) + s.grove.requests.length : 1);
    }
    // Folded rail: the toggle carries the total of what its hidden buttons are waiting on.
    const tb = this.railToggle?.querySelector<HTMLElement>('.badge');
    if (tb) {
      const total = Object.entries(this.railBadges).filter(([k, b]) => !b.hidden && this.railBtns[k] && (this.railCollapsed || !this.railBtns[k].hidden)).reduce((a, [, b]) => a + Number(b.textContent || 0), 0);
      tb.hidden = !this.railCollapsed || total <= 0;
      tb.textContent = String(total);
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
      const store = Capacitor.getPlatform() === 'ios' ? i18nText("ui.the_app_store_8768b638e4") : i18nText("ui.google_play_027b168468");
      this.modal(i18nText("ui.update_kagemura_1a67e6e9e1"), h('p', {}, i18nText("ui.open_find_kagemura_and_tap_update_your_7be21c9d34", { arg1: store })), [{ label: i18nText("ui.ok_565339bc4d"), primary: true, onClick: () => this.closeAllModals() }]);
      return;
    }
    const status = h('p', { role: 'status' }, i18nText("ui.saving_your_village_bf9eb8b894"));
    let close = () => {};
    close = this.modal(i18nText("ui.update_kagemura_1a67e6e9e1"), status, []);
    const update = this.deps.updateWebApp ?? (async (before: () => Promise<unknown>) => (await before().catch(() => undefined), location.reload(), 'reloading' as const));
    void update(() => this.c.save(), (text) => (status.textContent = text)).then((r) => {
      if (r === 'reloading') return;
      status.textContent =
        r === 'current'
          ? i18nText("ui.no_newer_version_is_available_here_yet_d4be21c409")
          : i18nText("ui.the_new_version_could_not_be_downloade_beb938b462");
      const foot = h('div', { class: 'modal-foot' }, h('button', { class: 'btn primary', type: 'button', onclick: () => close() }, i18nText("ui.ok_565339bc4d")));
      status.after(foot);
    });
  }

  private showUpdateNeeded(): void {
    const conn = this.deps.connection;
    const body = h(
      'div',
      {},
      h('p', {}, i18nMessage(conn.lastError || 'A new version of Kagemura is out, and online play needs it.')),
      h('p', { class: 'muted' }, i18nText("ui.online_battles_raids_and_your_alliance_195d4f6719")),
    );
    let close = () => {};
    close = this.modal(i18nText("ui.update_kagemura_1a67e6e9e1"), body, [
      { label: i18nText("ui.later_73b6e48a1b"), onClick: () => close() },
      { label: conn.updateUrl ? i18nText("ui.update_c1c1009d3f") : i18nText("ui.reload_bdc090ec61"), primary: true, onClick: () => this.openUpdate() },
    ]);
  }

  /** Open Friends, looking up a name or code (a friend link). */
  openFriends(search?: string): void {
    this.friends.open(search);
  }

  private updateNet(): void {
    const conn = this.deps.connection;
    this.updateRail();
    if (conn.status === 'incompatible' && !this.updateNoticeShown) {
      this.updateNoticeShown = true;
      this.showUpdateNeeded();
    }
    this.netPill.hidden = !conn.enabled;
    this.netPill.className = `net-pill ${conn.status}`;
    this.netPill.textContent = i18nLabel(Hud.NET_LABEL[conn.status] ?? conn.status);
    const queued = conn.enabled ? conn.outbox().length : 0;
    if (queued) this.netPill.textContent += ` · ${queued} to send`;
    if (conn.newDefenses > 0) {
      const n = conn.newDefenses;
      conn.newDefenses = 0;
      this.toast(t('toast.raided', { n }), 'info');
    }
  }

  /** Settings section: server address, status, name and the leaderboard. */
  private onlineSection(): HTMLElement {
    const conn = this.deps.connection;
    const wrap = h('div', { class: 'online-settings' });
    const draw = () => {
      clear(wrap);
      const status = h('p', {}, h('span', { class: `net-pill inline ${conn.status}` }, i18nLabel(Hud.NET_LABEL[conn.status] ?? conn.status)), ' ', conn.enabled ? h('span', { class: 'muted small' }, conn.url) : '');
      wrap.append(h('h3', {}, i18nText("ui.online_play_17a5942b34")), status);
      // A test server says so (roadmap step 42): progress there is not the real game's.
      const env = conn.server?.environment;
      if (env && env !== 'production') wrap.append(h('p', { class: 'muted small' }, i18nText("ui.this_is_a_server_for_testing_villages__7c82ee8a8b", { arg1: env })));
      if (conn.server?.notice) wrap.append(h('p', { class: 'store-note' }, conn.server.notice));
      if (!conn.enabled) {
        wrap.append(h('p', { class: 'muted' }, i18nText("ui.you_are_playing_on_your_own_opponents__186479dcf6")));
        // Re-audit: "Play offline" keeps the online account; it can still be deleted from here.
        for (const url of conn.storedAccounts()) wrap.append(this.storedAccountBlock(url, draw));
      } else {
        wrap.append(h('p', { class: 'muted' }, i18nText("ui.real_players_raid_your_village_instead_fbdd011f6d")));
        if (conn.lastError && conn.status !== 'online') wrap.append(h('p', { class: 'note' }, conn.lastError));
        if (conn.status === 'incompatible') wrap.append(h('p', {}, h('button', { class: 'btn primary', type: 'button', onclick: () => this.openUpdate() }, conn.updateUrl ? i18nText("ui.update_kagemura_1a67e6e9e1") : i18nText("ui.reload_to_update_e53356925a"))));
        if (conn.player) {
          const name = h('input', { class: 'text', type: 'text', dir: 'auto', autocomplete: 'nickname', spellcheck: 'false', value: conn.player.name }) as HTMLInputElement;
          name.addEventListener('keydown', (e) => e.stopPropagation());
          const save = h('button', { class: 'btn ghost', type: 'button' }, i18nText("ui.rename_3064d79a29"));
          save.addEventListener('click', () => {
            // Any script works (names.ts); the server applies the same rules.
            const checked = checkName(name.value);
            if (checked.error) return this.toast(NAME_ERROR_TEXT[checked.error], 'error');
            name.value = checked.name;
            void conn.rename(checked.name).then(
              () => this.toast(i18nText("ui.name_saved_555c2551ec"), 'success'),
              (e: Error) => this.toast(i18nMessage(e.message, true), 'error'),
            );
          });
          wrap.append(h('label', { class: 'muted small' }, i18nText("ui.your_name_in_online_play_b1f7873e6c")), h('div', { class: 'chat-input-row' }, name, save));
          const board = h('div', { class: 'events' }, i18nText("ui.loading_ba3bbbe10d"));
          // Two ladders: Honor (leagues) and, when the server has it, the Power Ranking (skill plus Keep).
          let which: 'honor' | 'power' = 'honor';
          const hasPower = Boolean(conn.server?.features.includes('power-ranking'));
          const tabs = h('div', { class: 'shop-tabs' });
          const load = () => {
            const port = conn.port;
            if (!port) return;
            board.textContent = i18nText("ui.loading_ba3bbbe10d");
            clear(tabs);
            if (hasPower) {
              for (const [id, label] of [['honor', 'Honor'], ['power', 'Power']] as const) {
                const b = h('button', { type: 'button', class: id === which ? 'on' : '' }, i18nLabel(label));
                b.addEventListener('click', () => {
                  which = id;
                  load();
                });
                tabs.append(b);
              }
            }
            const row = (rank: number, name: string, sub: string, value: string, chip: Node | null) =>
              h('div', { class: `log-row${name === conn.player?.name ? ' current' : ''}` }, h('div', {}, h('b', {}, i18nText("ui.message_59480bd082", { arg1: rank, arg2: isolateName(name) })), h('div', { class: 'muted small' }, i18nLabel(sub))), h('span', { class: 'chip' }, chip, value));
            const fail = (e: Error) => {
              board.textContent = i18nMessage(e.message, true);
            };
            if (which === 'power') {
              void port.powerLeaderboard(30).then((lb) => {
                clear(board);
                board.append(h('p', { class: 'muted small' }, i18nText("ui.power_is_your_skill_as_an_attacker_plu_e58aae723f")));
                for (const p of lb.players) board.append(row(p.rank, p.name, i18nText("ui.clan_keep_67aaca3532", { arg1: p.hallLevel, arg2: p.grove ? i18nText("ui.message_c4f174b2a5", { arg1: isolateName(p.grove) }) : '' }), String(p.power), null));
                board.append(h('p', { class: 'muted small' }, lb.me ? i18nText("ui.you_are_number_with_power_3a4362c773", { arg1: lb.me.rank, arg2: lb.me.power }) : i18nText("ui.raid_real_players_a_few_times_to_get_o_398b18284f")));
                if (!lb.players.length) board.append(i18nText("ui.nobody_is_on_it_yet_c17b839b29"));
              }, fail);
              return;
            }
            void port.leaderboard(30).then((lb) => {
              clear(board);
              for (const p of lb.players) board.append(row(p.rank, p.name, i18nText("ui.clan_keep_67aaca3532", { arg1: p.hallLevel, arg2: p.grove ? i18nText("ui.message_c4f174b2a5", { arg1: isolateName(p.grove) }) : '' }), String(p.trophies), icon(icons.leaf)));
              if (lb.me) board.append(h('p', { class: 'muted small' }, i18nText("ui.you_are_number_9f4194bd6a", { arg1: lb.me.rank })));
              if (!lb.players.length) board.append(i18nText("ui.nobody_is_ranked_yet_be93671617"));
            }, fail);
          };
          const details = h('details', {}, h('summary', {}, i18nText("ui.leaderboard_31b4712158")), tabs, board);
          details.addEventListener('toggle', () => {
            if (details.open) load();
          });
          wrap.append(details);
          if (conn.canKeepVillage || conn.serverVillage) wrap.append(this.villageBlock());
          wrap.append(this.accountBlock());
        }
        const retry = h('button', { class: 'btn ghost', type: 'button' }, i18nText("ui.connect_now_f5e732583f"));
        retry.addEventListener('click', () => {
          conn.askAgeAgain();
          void conn.sync().then(draw);
        });
        if (conn.status !== 'online') wrap.append(h('div', { class: 'actions' }, retry));
      }
      if (conn.enabled) wrap.append(h('div', { class: 'actions' }, h('button', { class: 'btn ghost', type: 'button', onclick: () => this.chooseServer('off') }, i18nText("ui.play_offline_d0ebc166e0"))));
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
  /** Switch servers ('' = the built-in setting, 'off' = play offline): the game restarts. */
  private chooseServer(value: string): void {
    Connection.choose(value);
    this.toast(i18nText("ui.restarting_to_switch_servers_b01f958c4c"), 'info');
    void this.c.save().then(() => window.setTimeout(() => location.reload(), 600));
  }

  /** Settings → Advanced → Server address (moved out of the first screen of Settings, re-audit design item 8). */
  private serverAddressBlock(): HTMLElement {
    const conn = this.deps.connection;
    const chosen = Connection.chosen();
    const addr = h('input', { class: 'text', type: 'url', inputmode: 'url', autocapitalize: 'off', spellcheck: 'false', placeholder: 'https://your-server.example.com', value: chosen && chosen !== 'off' ? chosen : '' }) as HTMLInputElement;
    addr.addEventListener('keydown', (e) => e.stopPropagation());
    return h(
      'div',
      {},
      h('h4', {}, i18nText("ui.server_address_8be89710b2")),
      h('div', { class: 'chat-input-row' }, addr, h('button', { class: 'btn ghost', type: 'button', onclick: () => this.chooseServer(addr.value || '') }, i18nText("ui.use_c36d819e7b"))),
      h(
        'div',
        { class: 'actions' },
        conn.enabled ? h('button', { class: 'btn ghost', type: 'button', onclick: () => this.chooseServer('off') }, i18nText("ui.play_offline_d0ebc166e0")) : null,
        chosen ? h('button', { class: 'btn ghost', type: 'button', onclick: () => this.chooseServer('') }, i18nText("ui.use_the_built_in_setting_fa2e4b675f")) : null,
      ),
      h('p', { class: 'muted small' }, i18nText("ui.switching_servers_restarts_the_game_yo_f444e661d9")),
    );
  }

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
    return i18nLabel(words[code] ?? code);
  }

  /** Settings → Online play → Village on the server (beta, roadmap Phase 2). */
  private villageBlock(): HTMLElement {
    const conn = this.deps.connection;
    const sync = conn.village!;
    const box = h('div', { class: 'village-server' }, h('h3', {}, i18nText("ui.village_on_the_server_beta_b06787518d")));
    if (sync.active) {
      box.append(
        h('p', { class: 'muted small' }, i18nText("ui.your_village_is_kept_on_the_server_eve_b6cdd1303f")),
        h('p', { class: 'small' }, sync.pending ? t('sync.pending', { n: sync.pending }) : i18nText("ui.everything_is_sent_5d346762da")),
      );
      const list = h('div', { class: 'events' }, i18nText("ui.loading_ba3bbbe10d"));
      const ledger = h('details', {}, h('summary', {}, i18nText("ui.recent_changes_f66a12ef4f")), list);
      ledger.addEventListener('toggle', () => {
        if (!ledger.open || !conn.port) return;
        void conn.port.ledger(30).then(
          ({ entries }) => {
            clear(list);
            if (!entries.length) list.append(i18nText("ui.nothing_yet_e056734eff"));
            for (const e of entries) list.append(h('div', { class: 'event' }, h('b', {}, i18nText("ui.message_5b4e0f8bf8", { arg1: e.delta > 0 ? '+' : '', arg2: formatNumber(e.delta), arg3: RES_LABEL[e.resource as keyof typeof RES_LABEL] ?? e.resource })), i18nText("ui.message_cc812bb47e", { arg1: Hud.ledgerReason(e.reason), arg2: i18nDate(e.at) })));
          },
          (e: Error) => {
            list.textContent = i18nMessage(e.message, true);
          },
        );
      });
      box.append(ledger);
      return box;
    }
    const go = (how: 'new' | 'move') => async () => {
      const ok = await this.confirm(
        how === 'move' ? i18nText("ui.move_this_village_to_the_server_105025832f") : i18nText("ui.start_a_new_village_on_the_server_28dc01ebc3"),
        how === 'move'
          ? i18nText("ui.your_village_moves_to_the_server_as_it_2d77c66171")
          : i18nText("ui.this_starts_a_new_village_that_is_kept_b4547637b3"),
        how === 'move' ? i18nText("ui.move_it_71ae3bd488") : i18nText("ui.start_a_new_one_ff556273e1"),
        false,
        i18nText("ui.not_now_a0e63d7c71"),
      );
      if (!ok) return;
      try {
        await sync.enable(how);
        this.toast(how === 'move' ? i18nText("ui.your_village_is_now_kept_on_the_server_6d77528b70") : i18nText("ui.your_new_village_is_kept_on_the_server_1e22ec44a1"), 'success');
        this.closeAllModals();
      } catch (e) {
        this.toast(i18nMessage((e as Error).message, true), 'error');
      }
    };
    const canMove = Boolean(conn.server?.features.includes('village-import'));
    const move = h('button', { class: 'btn primary', type: 'button' }, i18nText("ui.move_this_village_to_the_server_900cbef735"));
    move.addEventListener('click', () => void go('move')());
    const start = h('button', { class: 'btn ghost', type: 'button' }, canMove ? i18nText("ui.start_a_new_one_there_77ff065ea4") : i18nText("ui.start_a_village_on_the_server_b47dac674d"));
    start.addEventListener('click', () => void go('new')());
    const refused = conn.villageMoveRefused;
    box.append(h('p', { class: 'muted small' }, i18nText("ui.keep_your_village_on_the_server_so_it__29cfb9c929")));
    if (refused) box.append(h('p', { class: 'note' }, i18nText("ui.the_server_could_not_take_this_village_a7da1f3a5b", { arg1: refused })));
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
    const idBox = h('input', { class: 'text mono', type: 'text', readonly: true, value: id, 'aria-label': i18nText("ui.player_id_c3e96fa625") }) as HTMLInputElement;
    idBox.addEventListener('focus', () => idBox.select());
    const copy = h('button', { class: 'btn ghost', type: 'button' }, i18nText("ui.copy_e21f935f11"));
    copy.addEventListener('click', () => {
      idBox.select();
      const done = () => this.toast(i18nText("ui.player_id_copied_a61174f878"), 'success');
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(id).then(done, () => this.toast(i18nText("ui.select_the_id_and_copy_it_67e7724e57"), 'info'));
      else this.toast(i18nText("ui.select_the_id_and_copy_it_67e7724e57"), 'info');
    });
    const del = h('button', { class: 'btn danger', type: 'button' }, i18nText("ui.delete_online_account_6dcd1e6d49"));
    del.addEventListener('click', () => void this.deleteOnlineAccount());
    const webForm = `${conn.url}/account/delete?lang=${language().code}`;
    // Re-audit: a one-time code proves a web deletion request is yours; other devices can be signed out.
    const codeBox = h('div', {});
    const getCode = h('button', { class: 'btn ghost', type: 'button' }, i18nText("ui.get_a_deletion_code_a28c696059"));
    getCode.addEventListener('click', () => void conn.deletionCode().then((c) => this.showDeletionCode(codeBox, c, webForm), (e: Error) => this.toast(i18nMessage(e.message, true), 'error')));
    const others = h('button', { class: 'btn ghost', type: 'button' }, i18nText("ui.sign_out_other_devices_2e75111bfa"));
    others.addEventListener('click', () => void this.signOutOthers());
    const noticesBox = h('div', {});
    // Blocked players (blocked from Alliance chat or the member list), with Unblock.
    const blockedList = h('div', { class: 'events' });
    const blockedWrap = conn.server?.features.includes('blocks') ? h('div', {}, h('label', { class: 'muted small' }, i18nText("ui.blocked_players_fe9b29c1d3")), blockedList) : null;
    const loadBlocked = () => {
      const port = conn.port;
      if (!port || !blockedWrap) return;
      void port.blocks().then(
        ({ blocked }) => {
          clear(blockedList);
          if (!blocked.length) blockedList.append(h('p', { class: 'muted small' }, i18nText("ui.nobody_to_block_a_player_tap_next_to_t_37d6c6c87e")));
          for (const b of blocked) {
            const un = h('button', { class: 'btn ghost', type: 'button' }, i18nText("ui.unblock_712da63171"));
            un.addEventListener('click', () => void port.unblock(b.id).then(loadBlocked, (e: Error) => this.toast(i18nMessage(e.message, true), 'error')));
            blockedList.append(h('div', { class: 'log-row' }, h('b', {}, b.name), un));
          }
        },
        (e: Error) => {
          blockedList.textContent = i18nMessage(e.message, true);
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
          signIns.append(h('label', { class: 'muted small' }, i18nText("ui.sign_ins_play_this_account_on_other_de_23318c3689")));
          for (const p of here) {
            const linked = links.some((l) => l.provider === p);
            const name = PROVIDER_NAMES[p];
            const act = h('button', { class: 'btn ghost', type: 'button' }, linked ? i18nText("ui.unlink_b90108da0b") : i18nText("ui.link_520c06d5d8", { arg1: name }));
            act.addEventListener('click', () => {
              const run = linked ? port.unlink(p) : source.obtain(p).then((cred) => conn.link(p, cred));
              void run.then(
                () => {
                  this.toast(linked ? i18nText("ui.unlinked_f820616007", { arg1: name }) : i18nText("ui.linked_sign_in_with_it_on_another_devi_b6d645bfe5", { arg1: name }), 'success');
                  loadLinks();
                },
                (e: Error) => this.toast(i18nMessage(e.message, true), 'error'),
              );
            });
            signIns.append(h('div', { class: 'log-row' }, h('b', {}, `${name}${linked ? i18nText("ui.linked_105bbb09b1") : ''}`), act));
          }
          const switchRow = h('div', { class: 'actions' });
          for (const p of here) {
            const b = h('button', { class: 'btn ghost', type: 'button' }, i18nText("ui.sign_in_with_b39a564eb7", { arg1: PROVIDER_NAMES[p] }));
            b.addEventListener('click', () => void this.switchAccount(p));
            switchRow.append(b);
          }
          signIns.append(h('p', { class: 'muted small' }, i18nText("ui.already_linked_an_account_on_another_d_c06434826d")), switchRow);
        },
        () => clear(signIns),
      );
    };
    const details = h(
      'details',
      { class: 'account-settings' },
      h('summary', {}, i18nText("ui.account_7e1b0d5641")),
      h('label', { class: 'muted small' }, i18nText("ui.player_id_for_support_and_for_deletion_209a9b611c")),
      h('div', { class: 'chat-input-row' }, idBox, copy),
      signIns,
      blockedWrap,
      h('p', { class: 'muted small' }, i18nText("ui.deleting_your_online_account_removes_y_9f80508479")),
      h('div', { class: 'actions' }, del),
      h('p', { class: 'muted small' }, i18nText("ui.deleting_from_another_device_or_the_we_2bf7af1665"), h('a', { href: webForm, target: '_blank', rel: 'noopener' }, webForm), i18nText("ui.it_works_once_for_30_days_e3dbd93a8a")),
      conn.server?.features.includes('deletion-codes') ? h('div', { class: 'actions' }, getCode) : null,
      codeBox,
      conn.server?.features.includes('sessions') ? h('div', {}, h('p', { class: 'muted small' }, i18nText("ui.lost_a_phone_or_signed_in_somewhere_yo_2e6f84a9c3")), h('div', { class: 'actions' }, others)) : null,
      conn.server?.features.includes('notices') ? h('div', {}, h('label', { class: 'muted small' }, i18nText("ui.messages_from_our_moderators_71bfb2b01a")), noticesBox) : null,
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
      i18nText("ui.sign_in_with_58d489b70f", { arg1: PROVIDER_NAMES[provider] }),
      i18nText("ui.this_device_will_play_the_account_link_94bfd0ad7e"),
      i18nText("ui.sign_in_bfd402b2f6"),
      false,
      i18nText("ui.not_now_a0e63d7c71"),
    );
    if (!ok) return;
    try {
      await this.deps.connection.signIn(provider, await source.obtain(provider));
      this.toast(i18nText("ui.signed_in_as_baa47e175d", { arg1: this.deps.connection.player?.name ?? 'your account' }), 'success');
      this.closeAllModals();
    } catch (e) {
      this.toast(i18nMessage((e as Error).message, true), 'error');
    }
  }

  /** Show a deletion code once, with Copy (re-audit: web deletion needs it). */
  private showDeletionCode(box: HTMLElement, c: { code: string; expiresAt: number }, webForm: string): void {
    clear(box);
    const field = h('input', { class: 'text mono', type: 'text', readonly: true, value: c.code, 'aria-label': i18nText("ui.deletion_code_83fff164f3") }) as HTMLInputElement;
    field.addEventListener('focus', () => field.select());
    const copy = h('button', { class: 'btn ghost', type: 'button' }, i18nText("ui.copy_e21f935f11"));
    copy.addEventListener('click', () => {
      field.select();
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(c.code).then(() => this.toast(i18nText("ui.deletion_code_copied_071e162788"), 'success'), () => this.toast(i18nText("ui.select_the_code_and_copy_it_3d218c0533"), 'info'));
      else this.toast(i18nText("ui.select_the_code_and_copy_it_3d218c0533"), 'info');
    });
    box.append(
      h('div', { class: 'chat-input-row' }, field, copy),
      h('p', { class: 'muted small' }, i18nText("ui.enter_it_with_your_player_id_on_before_9a8fb4c1c5", { arg1: webForm, arg2: i18nDate(c.expiresAt, {dateStyle: 'medium'}) })),
    );
  }

  private async signOutOthers(): Promise<void> {
    const ok = await this.confirm(i18nText("ui.sign_out_other_devices_0afb167de1"), i18nText("ui.every_other_phone_tablet_or_browser_si_cd0b426f2b"), i18nText("ui.sign_out_others_dd53370b3c"), false, i18nText("ui.cancel_19766ed6cc"));
    if (!ok) return;
    try {
      const n = await this.deps.connection.revokeOtherSessions();
      this.toast(n ? t('sessions.signedOut', { n }) : i18nText("ui.no_other_device_was_signed_in_435c3627cc"), 'success');
    } catch (e) {
      this.toast(i18nMessage((e as Error).message, true), 'error');
    }
  }

  /** Moderation notices (re-audit, EU DSA): what was decided, why, and how to appeal. */
  private drawNotices(box: HTMLElement, list: import('../../backend/net/protocol').NoticeView[]): void {
    clear(box);
    if (!list.length) {
      box.append(h('p', { class: 'muted small' }, i18nLabel('None.')));
      return;
    }
    for (const n of list) box.append(h('div', { class: `log-row notice${n.read ? '' : ' unread'}` }, h('div', {}, h('div', { class: 'muted small' }, i18nDate(n.at)), h('div', { dir: 'auto' }, i18nMessage(n.text)))));
    const unread = list.filter((n) => !n.read).map((n) => n.id);
    if (unread.length) void this.deps.connection.markNoticesRead(unread).catch(() => undefined);
  }

  private toldNotices = new Set<string>();
  /** A new moderation notice is shown once as a toast; all of them are in Settings → Online play → Account. */
  private showNewNotices(): void {
    for (const n of this.deps.connection.notices) {
      if (n.read || this.toldNotices.has(n.id)) continue;
      this.toldNotices.add(n.id);
      this.toast(i18nText("ui.message_d2599d42d8", { arg1: n.kind === 'report_outcome' ? i18nText("ui.about_your_report_40eecac507") : i18nText("ui.from_our_moderators_6bf6a30047"), arg2: i18nMessage(n.text) }), 'info');
    }
  }

  /** "Play offline" left an online account on a server (re-audit): it can still be deleted, connecting just for that. */
  private storedAccountBlock(url: string, redraw: () => void): HTMLElement {
    const conn = this.deps.connection;
    const box = h('div', {});
    const del = h('button', { class: 'btn danger', type: 'button' }, i18nText("ui.delete_online_account_6dcd1e6d49"));
    del.addEventListener('click', () => {
      void this.confirm(i18nText("ui.delete_your_online_account_e06b9e3bf8"), i18nText("ui.your_player_name_shared_base_alliance__b52c6061e4", { arg1: url }), i18nText("ui.delete_account_a2e20a3357"), true).then(async (ok) => {
        if (!ok) return;
        try {
          await conn.deleteStoredAccount(url);
          this.toast(i18nText("ui.your_online_account_was_deleted_a49f28bd02"), 'success');
          redraw();
        } catch (e) {
          this.toast(i18nText("ui.could_not_delete_the_account_77c3c167d5", { arg1: (e as Error).message }), 'error');
        }
      });
    });
    const code = h('button', { class: 'btn ghost', type: 'button' }, i18nText("ui.get_a_deletion_code_a28c696059"));
    code.addEventListener('click', () => void conn.storedDeletionCode(url).then((c) => this.showDeletionCode(box, c, `${url}/account/delete?lang=${language().code}`), (e: Error) => this.toast(i18nMessage(e.message, true), 'error')));
    return h('div', { class: 'account-settings' }, h('p', {}, i18nText("ui.this_device_still_holds_your_online_ac_8b04a785ce"), h('span', { class: 'mono' }, url), i18nText("ui.online_play_is_off_but_the_account_exi_583d9be7a8")), h('div', { class: 'actions' }, del, code), box);
  }

  private async deleteOnlineAccount(): Promise<void> {
    const conn = this.deps.connection;
    const ok = await this.confirm(
      i18nText("ui.delete_your_online_account_e06b9e3bf8"),
      i18nText("ui.your_player_name_shared_base_alliance__2ac437b2e4"),
      i18nText("ui.delete_account_a2e20a3357"),
      true,
    );
    if (!ok) return;
    try {
      await conn.deleteAccount();
    } catch (e) {
      this.toast(i18nText("ui.could_not_delete_the_account_77c3c167d5", { arg1: (e as Error).message }), 'error');
      return;
    }
    this.toast(i18nText("ui.your_online_account_was_deleted_restar_8d14231904"), 'success');
    void this.c.save().then(() => window.setTimeout(() => location.reload(), 1200));
  }

  private updateShield(): void {
    const left = this.c.state.shieldUntil - this.c.now();
    this.shieldBox.hidden = left <= 0;
    if (left > 0) this.shieldEl.textContent = formatDuration(left);
  }

  private everySecond(): void {
    this.updateShield();
    this.updateEventPill();
    this.updateBadges();
    const s = this.c.state;
    const bs = builderStatus(s, localizedData(this.c.data), this.c.now());
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
    const q = busy ? null : upgradeQuote(this.c.state, b.id, localizedData(this.c.data), now);
    const missing = q && !q.ok && q.quote ? Object.keys(missingFor(this.c.state.resources, q.quote.cost)).join() : '';
    return JSON.stringify([b.id, effectiveLevel(b, now), busy, q ? (q.ok ? 'ok' : q.code) : '-', missing]);
  }

  /** Update timers and collector amounts without replacing any buttons. */
  private updateSheetLive(): void {
    const b = this.c.state.buildings.find((v) => v.id === this.selectedId);
    if (!b) return;
    const gd = localizedData(this.c.data);
    const now = this.c.now();
    const up = this.sheet.querySelector<HTMLElement>('[data-live="upgrade"]');
    if (up && b.upgrade) {
      const u = b.upgrade;
      const pct = Math.min(100, ((now - u.startedAt) / Math.max(1, u.endsAt - u.startedAt)) * 100);
      (up.querySelector('i') as HTMLElement).style.width = `${pct}%`;
      up.querySelector('span')!.textContent = i18nText("ui.left_12f73d4584", { arg1: u.toLevel === 1 ? i18nText("ui.building_87c5912f2c") : i18nText("ui.upgrading_to_lv_98b4ee1616", { arg1: u.toLevel }), arg2: formatDuration(u.endsAt - now) });
    }
    const col = this.sheet.querySelector<HTMLElement>('[data-live="collector"]');
    if (col) {
      const level = effectiveLevel(b, now);
      const amount = Math.floor(collectorAmount(b, now, gd));
      const cap = collectorCapacity(b, level, gd);
      (col.querySelector('i') as HTMLElement).style.width = `${Math.min(100, (amount / Math.max(1, cap)) * 100)}%`;
      col.querySelector('span')!.textContent = i18nText("ui.ready_7e52cd80b5", { arg1: formatNumber(amount), arg2: formatNumber(cap) });
    }
  }

  // ------------------------------------------------------------ unlock preview

  private unlockText(u: UnlockItem): string {
    const name = buildingDef(localizedData(this.c.data), u.type).name;
    if (u.kind === 'new') return i18nText("ui.new_e0f84879f6", { arg1: name, arg2: u.to > 1 ? ` ×${u.to}` : '' });
    if (u.kind === 'more') return i18nText("ui.build_up_to_now_e9422097ce", { arg1: name, arg2: u.to, arg3: u.from });
    return i18nText("ui.up_to_level_now_60f87e0a6f", { arg1: name, arg2: u.to, arg3: u.from });
  }

  /** One short line, e.g. "+1 Acorn Orchard, +1 Dewdrop Well, higher levels for 4 buildings". */
  private unlockSummary(items: UnlockItem[]): string {
    const gd = localizedData(this.c.data);
    const parts: string[] = [];
    for (const u of items) {
      const name = buildingDef(gd, u.type).name;
      if (u.kind === 'new') parts.push(i18nText("ui.new_7b1eddb0fc", { arg1: name }));
      else if (u.kind === 'more') parts.push(i18nText("ui.message_308af0994c", { arg1: u.to - u.from, arg2: name }));
    }
    const capped = new Set(items.filter((u) => u.kind === 'levelCap').map((u) => u.type)).size;
    const shown = parts.slice(0, 3);
    if (parts.length > 3) shown.push(i18nText("ui.more_fac9b7b214", { arg1: parts.length - 3 }));
    if (capped) shown.push(t('unlocks.capped', { n: capped }));
    const troops = troopCapUnlock(hallLevel(this.c.state, gd), gd);
    if (troops) shown.push(i18nText("ui.troop_level_0526270e0b", { arg1: troops.to }));
    return shown.join(', ');
  }

  /** The Keep level whose unlock chip the player dismissed (the chip comes back for the next level). */
  private unlockDismissed(): number {
    try {
      return Number(localStorage.getItem('tk.unlockChipHidden') ?? 0);
    } catch {
      return 0;
    }
  }

  private dismissUnlockChip(): void {
    try {
      localStorage.setItem('tk.unlockChipHidden', String(hallLevel(this.c.state, localizedData(this.c.data))));
    } catch {
      /* storage blocked: hidden for this session */
    }
    this.unlockChip.hidden = true;
    this.toast(i18nText("ui.the_full_list_of_keep_unlocks_is_on_th_c00d4ce475"), 'info');
  }

  /**
   * One short line (re-audit design item 4: the old two-line banner was truncated mid-word): "Keep Lv 3 · 7 unlocks".
   * Hidden during the tutorial, at the top level and once dismissed for this Keep level.
   */
  private renderObjective(force = false): void {
    const now = this.c.now();
    if (!force && now - this.objectiveAt < 1000) return;
    this.objectiveAt = now;
    const s = this.c.state;
    if (!s.tutorial.done) {
      this.objectiveChip.hidden = true;
      return;
    }
    const data = localizedData(this.c.data);
    const o = nextObjective(advance(s, now, data).state, now, data);
    const name = (type: string) => data.buildings[type]?.name ?? type;
    let ic = icons.star;
    let text = '';
    let action: (() => void) | null = null;
    if (o.kind === 'chest') {
      [ic, text, action] = [icons.chest, t('objective.chest'), () => this.daily.openDaily()];
    } else if (o.kind === 'raid') {
      [ic, text, action] = [icons.swords, t('objective.raid'), () => this.deps.onAttack()];
    } else if (o.kind === 'upgrade') {
      [ic, text, action] = [icons.hammer, o.keep ? t('objective.keep', { level: o.toLevel }) : t('objective.upgrade', { building: name(o.type), level: o.toLevel }), () => this.bus.emit('select', o.buildingId)];
    } else if (o.kind === 'save') {
      const need = (Object.entries(o.missing) as [ResourceKind, number][]).filter(([, v]) => v > 0).map(([k, v]) => i18nText("ui.message_14677cb26f", { arg1: formatCompact(v), arg2: RES_LABEL[k] })).join(' + ');
      [ic, text, action] = [icons.acorns, t('objective.save', { need, building: name(o.type), level: o.toLevel }), () => this.bus.emit('select', o.buildingId)];
    } else if (o.kind === 'builders') {
      [ic, text] = [icons.clock, t('objective.builders', { time: formatDuration(o.freeAt - now) })];
    }
    const sig = `${o.kind}|${text}`;
    this.objectiveChip.hidden = o.kind === 'none';
    this.objectiveAction = action;
    if (sig === this.objectiveSig) return;
    this.objectiveSig = sig;
    clear(this.objectiveChip);
    this.objectiveChip.append(icon(ic), h('span', {}, text));
    if (action) this.objectiveChip.append(h('span', { 'aria-hidden': 'true' }, '▸'));
    this.objectiveChip.disabled = !action;
    this.objectiveChip.setAttribute('aria-label', t('objective.aria', { text }));
  }

  private renderUnlockChip(): void {
    const s = this.c.state;
    const level = hallLevel(s, localizedData(this.c.data));
    const items = hallUnlocks(level, localizedData(this.c.data));
    clear(this.unlocksEl);
    this.unlockChip.hidden = !s.tutorial.done || !items.length || this.unlockDismissed() >= level;
    if (this.unlockChip.hidden) return;
    const troops = troopCapUnlock(level, localizedData(this.c.data)) ? 1 : 0;
    const n = items.length + troops;
    this.unlocksEl.title = i18nText("ui.clan_keep_lv_unlocks_d1e66d048e", { arg1: level + 1, arg2: this.unlockSummary(items) });
    this.unlocksEl.setAttribute('aria-label', this.unlocksEl.title);
    this.unlocksEl.append(icon(icons.toadstool), h('span', { class: 'unlock-text' }, h('b', {}, i18nText("ui.keep_lv_78a2d3d210", { arg1: level + 1 })), i18nText("ui.message_c2bc2bb606", { arg1: t('unlocks.chip', { n }) }), h('span', { 'aria-hidden': 'true' }, '▸')));
  }

  private openUnlocks(): void {
    const gd = localizedData(this.c.data);
    const level = hallLevel(this.c.state, gd);
    const items = hallUnlocks(level, gd);
    const hall = this.c.state.buildings.find((b) => b.type === hallType(gd));
    const body = h('div', { class: 'unlock-list' });
    if (!items.length) body.append(h('p', {}, i18nText("ui.your_clan_keep_is_at_the_highest_level_18f107aa0d")));
    else {
      body.append(h('p', { class: 'muted' }, i18nText("ui.upgrading_your_clan_keep_to_level_unlo_635a5be9cb", { arg1: level + 1 })));
      const troops = troopCapUnlock(level, gd);
      body.append(h('ul', {}, ...items.map((u) => h('li', {}, this.unlockText(u))), troops ? h('li', {}, i18nText("ui.troop_research_up_to_level_now_fe9cb9e940", { arg1: troops.to, arg2: troops.from })) : ''));
      const next = levelDef(gd, hallType(gd), level + 1);
      if (next) body.append(h('p', { class: 'row' }, i18nLabel('Cost: '), costChips(next.cost, missingFor(this.c.state.resources, next.cost)), h('span', { class: 'chip' }, icon(icons.clock), formatDuration(next.buildSeconds * 1000))));
    }
    const close = this.modal(i18nText("ui.clan_keep_91ed01e772"), body, [
      hall && {
        label: i18nText("ui.go_to_clan_keep_4d567aa33e"),
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
    // The tutorial points only at the right building's buttons (re-audit design item 3).
    this.sheet.dataset.type = b.type;
    const gd = localizedData(this.c.data);
    const now = this.c.now();
    const def = buildingDef(gd, b.type);
    const level = effectiveLevel(b, now);
    clear(this.sheet);
    this.sheet.hidden = false;
    if (def.category === 'obstacle' && def.clear) {
      this.renderObstacleSheet(b, def.name, def.description, def.clear);
      return;
    }

    const title = h('div', { class: 'sheet-title' }, h('h2', {}, def.name), h('span', { class: 'level' }, level >= 1 ? i18nText("ui.level_846c9348a9", { arg1: level }) : i18nText("ui.being_built_cae1e757ba")));
    const closeBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': i18nText("ui.close_7d9eb7acb1"), onclick: () => this.bus.emit('select', null) }, icon(icons.close));
    this.sheet.append(h('div', { class: 'sheet-head' }, title, closeBtn));
    this.sheet.append(h('p', { class: 'muted desc' }, def.description));

    // Stats
    const stats = h('div', { class: 'stats' });
    const ld = levelDef(gd, b.type, Math.max(1, level));
    if (def.category === 'collector' && def.produces && ld?.ratePerHour) {
      stats.append(h('span', { class: 'chip' }, icon(icons[def.produces as 'acorns' | 'dew']), `${formatNumber(ld.ratePerHour)}/hour`));
      stats.append(h('span', { class: 'chip' }, i18nText("ui.holds_55b8fb769a", { arg1: formatNumber(collectorCapacity(b, Math.max(1, level), gd)) })));
    }
    if (ld?.storage) {
      for (const k of RESOURCE_KINDS) {
        const v = ld.storage[k];
        if (v) stats.append(h('span', { class: 'chip' }, icon(icons[k as 'acorns' | 'dew']), i18nText("ui.stores_62a5714eb2", { arg1: formatNumber(v) })));
      }
    }
    if (def.category === 'builder') stats.append(h('span', { class: 'chip' }, icon(icons.beaver), i18nText("ui.home_of_1_village_artisan_d098b4322c")));
    if (ld?.housing) stats.append(h('span', { class: 'chip' }, icon(icons.troops), i18nText("ui.houses_55ab67abd5", { arg1: ld.housing })));
    if (def.combat && ld?.damage) {
      const dps = (ld.damage * gd.battle.ticksPerSecond) / def.combat.fireIntervalTicks;
      stats.append(h('span', { class: 'chip' }, i18nText("ui.damage_sec_0418e5cdfb", { arg1: Math.round(dps) })));
      stats.append(h('span', { class: 'chip' }, i18nText("ui.range_830739db0a", { arg1: def.combat.range })));
      stats.append(h('span', { class: 'chip' }, def.combat.targets === 'both' ? i18nText("ui.ground_air_cbc4ca18ea") : def.combat.targets === 'air' ? i18nText("ui.air_only_7e595b9df5") : i18nText("ui.ground_only_9349857086")));
    }
    if (def.category === 'hedge' && ld) stats.append(h('span', { class: 'chip' }, i18nText("ui.hp_0c9cb32a1b", { arg1: formatNumber(ld.hp) })));
    if (stats.childElementCount) this.sheet.append(stats);
    // The Keep's sheet carries the unlock preview (the village screen only has a dismissible one-line chip).
    if (def.category === 'hall' && hallUnlocks(level, gd).length) {
      this.sheet.append(h('button', { class: 'btn ghost small-btn', type: 'button', onclick: () => this.openUnlocks() }, icon(icons.toadstool), i18nText("ui.what_keep_lv_unlocks_ced96de6b4", { arg1: level + 1 })));
    }

    // Upgrade in progress
    if (b.upgrade && now < b.upgrade.endsAt) {
      const u = b.upgrade;
      const pct = Math.min(100, ((now - u.startedAt) / Math.max(1, u.endsAt - u.startedAt)) * 100);
      this.sheet.append(
        h(
          'div',
          { class: 'progress-row', 'data-live': 'upgrade' },
          h('div', { class: 'progress' }, h('i', { style: `width:${pct}%` })),
          h('span', {}, i18nText("ui.left_12f73d4584", { arg1: u.toLevel === 1 ? i18nText("ui.building_87c5912f2c") : i18nText("ui.upgrading_to_lv_98b4ee1616", { arg1: u.toLevel }), arg2: formatDuration(u.endsAt - now) })),
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
          h('span', {}, i18nText("ui.ready_7e52cd80b5", { arg1: formatNumber(amount), arg2: formatNumber(cap) })),
        ),
      );
    }

    // Actions
    const actions = h('div', { class: 'actions' });
    if (def.produces && level >= 1) {
      actions.append(
        h('button', { class: 'btn collect', type: 'button', onclick: () => this.collect(b) }, icon(icons[def.produces as 'acorns' | 'dew']), i18nText("ui.collect_08a0c33f91")),
      );
    }
    if (b.upgrade && now < b.upgrade.endsAt) {
      const sq = skipQuote(this.c.state, b.id, now, gd);
      if (sq) {
        actions.append(
          h(
            'button',
            { class: 'btn gold', type: 'button', onclick: () => void this.econ.spendMoonstones(i18nText("ui.finish_now_1d29b1c493"), i18nText("ui.finish_now_a84a870c3f", { arg1: def.name }), skipQuote(this.c.state, b.id, this.c.now(), gd)?.moonstones ?? sq.moonstones, () => this.c.dispatch({ type: 'skip', id: b.id }).ok) },
            i18nText("ui.finish_now_3e2c46dd09"),
            h('span', { class: 'chip' }, icon(icons.moonstones), String(sq.moonstones)),
          ),
        );
      }
      actions.append(h('button', { class: 'btn ghost', type: 'button', onclick: () => this.cancelUpgrade(b) }, icon(icons.close), i18nText("ui.cancel_19766ed6cc")));
    } else if (def.category !== 'decor') {
      const uq = upgradeQuote(this.c.state, b.id, gd, now);
      actions.append(this.upgradeButton(b, uq));
      if (!uq.ok && uq.code === 'NOT_ENOUGH_RESOURCES' && uq.quote) {
        const action = { type: 'upgrade', id: b.id } as const;
        const tq = topUpQuote(this.c.state, action, now, gd);
        if (tq) {
          const missing = i18nList(Object.entries(tq.missing).map(([k, v]) => i18nText("ui.message_14677cb26f", { arg1: formatNumber(v as number), arg2: RES_LABEL[k as ResourceKind] })), 'conjunction');
          actions.append(
            h(
              'button',
              {
                class: 'btn gold',
                type: 'button',
                onclick: () =>
                  void this.econ.spendMoonstones(i18nText("ui.buy_missing_resources_7c77856aa0"), i18nText("ui.buy_the_missing_and_start_the_upgrade_68b76516be", { arg1: missing }), topUpQuote(this.c.state, action, this.c.now(), gd)?.moonstones ?? tq.moonstones, () => this.c.dispatch({ type: 'topUp', then: action }).ok),
              },
              i18nText("ui.buy_missing_60a848c106"),
              h('span', { class: 'chip' }, icon(icons.moonstones), String(tq.moonstones)),
            ),
          );
        }
      }
    }
    if (def.category === 'military' && level >= 1) {
      actions.append(h('button', { class: 'btn sky', type: 'button', onclick: () => this.openTraining() }, icon(icons.troops), i18nText("ui.train_troops_eedc07a428")));
    }
    actions.append(h('button', { class: 'btn ghost', type: 'button', onclick: () => this.bus.emit('placement:start', { kind: 'move', id: b.id }) }, icon(icons.move), i18nText("ui.move_6ecc3df6bf")));
    this.sheet.append(actions);
  }

  private renderObstacleSheet(b: Building, name: string, description: string, clr: { cost: Cost; seconds: number; moonstones: number }): void {
    const now = this.c.now();
    const closeBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': i18nText("ui.close_7d9eb7acb1"), onclick: () => this.bus.emit('select', null) }, icon(icons.close));
    this.sheet.append(h('div', { class: 'sheet-head' }, h('div', { class: 'sheet-title' }, h('h2', {}, name)), closeBtn), h('p', { class: 'muted desc' }, description));
    if (b.upgrade && now < b.upgrade.endsAt) {
      const u = b.upgrade;
      const pct = Math.min(100, ((now - u.startedAt) / Math.max(1, u.endsAt - u.startedAt)) * 100);
      this.sheet.append(h('div', { class: 'progress-row', 'data-live': 'upgrade' }, h('div', { class: 'progress' }, h('i', { style: `width:${pct}%` })), h('span', {}, i18nText("ui.clearing_left_dba12b0f3f", { arg1: formatDuration(u.endsAt - now) }))));
      return;
    }
    const btn = h(
      'button',
      { class: 'btn primary upgrade', type: 'button' },
      h('span', { class: 'btn-label' }, i18nText("ui.clear_it_a6cb14a6a7")),
      h('span', { class: 'btn-sub' }, costChips(clr.cost, missingFor(this.c.state.resources, clr.cost)), h('span', { class: 'chip' }, icon(icons.clock), formatDuration(clr.seconds * 1000)), h('span', { class: 'chip good' }, '+', icon(icons.moonstones), String(clr.moonstones))),
    );
    btn.addEventListener('click', () => {
      const r = this.c.dispatch({ type: 'clear', id: b.id });
      if (!r.ok) this.toast(i18nMessage(r.message, true), 'error');
    });
    this.sheet.append(h('div', { class: 'actions' }, btn));
  }

  private upgradeButton(b: Building, q: QuoteResult): HTMLElement {
    if (!q.ok && !q.quote) return h('div', { class: 'note' }, i18nMessage(q.message));
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
          if (!r.ok) this.toast(i18nMessage(r.message, true), 'error');
        },
      },
      h('span', { class: 'btn-label' }, icon(icons.up), i18nText("ui.upgrade_to_lv_f98c8c59a3", { arg1: quote.toLevel })),
      h('span', { class: 'btn-sub' }, costChips(quote.cost, missing), h('span', { class: 'chip' }, icon(icons.clock), formatDuration(quote.seconds * 1000))),
    );
    if (q.ok) return btn;
    return h('div', { class: 'upgrade-wrap' }, btn, h('div', { class: 'note' }, i18nMessage(q.message)));
  }

  private collect(b: Building): void {
    const r = this.c.dispatch({ type: 'collect', id: b.id });
    if (!r.ok) this.toast(r.message, r.code === 'NOTHING_TO_COLLECT' ? 'info' : 'error');
    else for (const e of r.events) if (e.kind === 'collect') this.toast(i18nText("ui.message_308af0994c", { arg1: formatNumber(e.amount), arg2: RES_LABEL[e.resource] }), 'success');
  }

  private async cancelUpgrade(b: Building): Promise<void> {
    const pct = Math.round(localizedData(this.c.data).economy.cancelRefundFraction * 100);
    const ok = await this.confirm(i18nText("ui.cancel_8bda56c90a"), i18nText("ui.you_ll_get_back_of_what_you_paid_59199c43a7", { arg1: pct }), i18nText("ui.cancel_upgrade_fd0250ef15"), true);
    if (!ok) return;
    const r = this.c.dispatch({ type: 'cancel', id: b.id });
    if (!r.ok) this.toast(i18nMessage(r.message, true), 'error');
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
    const visible = tabs.filter(([, , cats]) => Object.values(localizedData(this.c.data).buildings).some((d) => d.inShop && cats.includes(d.category)));
    const draw = () => {
      clear(body);
      body.append(
        h('div', { class: 'shop-tabs' }, ...visible.map(([id, label]) => {
          const b = h('button', { type: 'button', class: id === this.shopTab ? 'on' : '', 'data-tab': id }, i18nLabel(label));
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
    const close = this.modal(i18nText("ui.build_bdd254b65b"), body, [], 'wide');
  }

  /** Confirm the Jade, then buy what the building is missing and place it in one step. */
  private async buyAndPlace(type: string, x: number, y: number): Promise<void> {
    const gd = localizedData(this.c.data);
    const action = { type: 'place', buildingType: type, x, y } as const;
    const placed = (r: ReturnType<typeof this.c.dispatch>) => {
      if (!r.ok) {
        this.toast(i18nMessage(r.message, true), 'error');
        return false;
      }
      this.bus.emit('placement:cancel');
      this.bus.emit('select', r.state.buildings[r.state.buildings.length - 1].id);
      return true;
    };
    const tq = topUpQuote(this.c.state, action, this.c.now(), gd);
    if (!tq) {
      // A building priced in Jade (an Artisan's Hut): the same Jade confirm before anything is spent (re-audit design item 6).
      const pq = placeQuote(this.c.state, gd, type, this.c.now());
      const jade = pq.quote?.cost.moonstones ?? 0;
      if (jade > 0) {
        await this.econ.spendMoonstones(i18nText("ui.build_b4fd48fcd3", { arg1: gd.buildings[type].name }), i18nText("ui.build_here_f9878cee7f", { arg1: gd.buildings[type].name }), jade, () => placed(this.c.dispatch(action)));
        return;
      }
      // Collected enough meanwhile: no Jade needed.
      placed(this.c.dispatch(action));
      return;
    }
    const missing = i18nList(Object.entries(tq.missing).map(([k, v]) => i18nText("ui.message_14677cb26f", { arg1: formatNumber(v as number), arg2: RES_LABEL[k as ResourceKind] })), 'conjunction');
    await this.econ.spendMoonstones(i18nText("ui.buy_missing_resources_7c77856aa0"), i18nText("ui.buy_the_missing_and_build_here_c0521572b9", { arg1: missing, arg2: gd.buildings[type].name }), tq.moonstones, () => placed(this.c.dispatch({ type: 'topUp', then: action })));
  }

  private shopGrid(categories: string[], close: () => void): HTMLElement {
    const gd = localizedData(this.c.data);
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
      // The real price: an Artisan's Hut costs Jade (`builderHutCosts`), not its level-1 cost ("Free").
      const price = q.quote?.cost ?? first.cost;
      const thumb = this.deps.thumbnail(type);
      const card = h(
        'button',
        {
          class: `shop-card${q.ok || tq ? '' : ' disabled'}`,
          type: 'button',
          'data-type': type,
          'aria-disabled': !q.ok && !tq,
          onclick: () => {
            if (!q.ok && !tq) {
              this.toast(i18nMessage(q.message, true), 'error');
              return;
            }
            close();
            // Jade-priced buildings (Artisan's Hut) also go through the HUD's confirm when the spot is chosen.
            this.bus.emit('placement:start', { kind: 'new', buildingType: type, buy: !q.ok || Boolean(price.moonstones) });
          },
        },
        thumb ? h('img', { src: thumb, alt: '' }) : h('div', { class: 'thumb-ph' }),
        h('div', { class: 'shop-name' }, def.name),
        h('div', { class: 'shop-count' }, i18nText("ui.built_999a0a5aa8", { arg1: have, arg2: lim.count })),
        h(
          'div',
          { class: 'shop-cost' },
          def.category === 'builder' && !q.quote ? null : costChips(price, missingFor(this.c.state.resources, price)),
          first.buildSeconds ? h('span', { class: 'chip' }, icon(icons.clock), formatDuration(first.buildSeconds * 1000)) : null,
        ),
        tq
          ? h('div', { class: 'shop-buy' }, i18nText("ui.buy_missing_60a848c106"), h('span', { class: 'chip' }, icon(icons.moonstones), String(tq.moonstones)))
          : !q.ok
            ? h('div', { class: 'shop-why' }, i18nMessage(q.message))
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
    return t('player.summary', { n: b.warriors, keep: b.keep, honor: b.honor });
  }

  private async restoreVillage(key: string): Promise<void> {
    const ok = await this.c.restoreBackup(key);
    if (!ok) {
      this.toast(i18nText("ui.that_village_could_not_be_restored_da34653697"), 'error');
      return;
    }
    this.closeAllModals();
    this.bus.emit('select', null);
    this.toast(i18nText("ui.your_earlier_village_is_back_the_one_y_c247a3cdd4"), 'success');
  }

  /** At start-up: offer back a kept village that is further along than this one, once. */
  async offerRecovery(): Promise<void> {
    const gd = localizedData(this.c.data);
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
    const yes = await this.confirm(i18nText("ui.your_earlier_village_is_safe_f15d817e36"), i18nText("ui.a_save_problem_started_you_on_a_new_vi_230b159409", { arg1: this.backupTitle(better), arg2: i18nDate(better.savedAt) }), i18nText("ui.restore_it_2ff3b676c1"), false, i18nText("ui.not_now_a0e63d7c71"));
    if (yes) await this.restoreVillage(better.key);
  }

  /** Another tab or window now owns this village. Stop here: nothing done in this one could be saved. */
  showTakenOver(): void {
    if (document.querySelector('.takeover')) return;
    document.body.append(
      h(
        'div',
        { class: 'takeover', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': i18nText("ui.open_somewhere_else_953fe53c0a") },
        h(
          'div',
          { class: 'modal' },
          h('div', { class: 'modal-head' }, h('h2', {}, i18nText("ui.open_somewhere_else_953fe53c0a"))),
          h(
            'div',
            { class: 'modal-body' },
            h('p', {}, i18nText("ui.your_village_was_opened_in_another_tab_ed07714afd")),
            h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => location.reload() }, i18nText("ui.play_here_instead_ecaf1c7e2e"))),
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
    const gd = localizedData(this.c.data);
    let tierFilter = 0;
    let roleFilter = '';
    let statusFilter: '' | 'unlocked' | 'locked' = '';
    const body = h('div', { class: 'codex' });
    const render = () => {
      const s = this.c.state;
      clear(body);
      const rows = WARRIORS.map((w) => {
        const u = w.liveTroop && gd.troops[w.liveTroop] ? troopUnlock(s, w.liveTroop, gd) : null;
        let status = i18nText("ui.coming_soon_4f7d640176");
        if (u?.unlocked) status = i18nText("ui.unlocked_531c7b28ab");
        else if (u) {
          const need: string[] = [];
          if (u.needsKeep) need.push(i18nText("ui.clan_keep_2cf84349d4", { arg1: u.keep }));
          if (u.needsDojo) need.push(i18nText("ui.training_dojo_54441bc8cc", { arg1: u.dojo }));
          status = i18nText("ui.needs_5162618d8e", { arg1: need.join(' + ') });
        }
        return { w, u, status, keep: u ? u.earliestKeep : warriorUnlockKeep(w, gd) };
      });
      const unlockedCount = rows.filter((r) => r.u?.unlocked).length;
      const nextUp = rows.filter((r) => r.u && !r.u.unlocked).sort((a, b) => a.keep - b.keep || a.w.tier - b.w.tier)[0];
      body.append(h('p', { class: 'muted small' }, i18nText("ui.of_classes_unlocked_a_class_unlocks_wh_856ddcc6ae", { arg1: unlockedCount, arg2: WARRIORS.length })));
      if (nextUp) body.append(h('p', { class: 'small' }, h('b', {}, i18nLabel('Next: ')), i18nText("ui.message_6aa36c72d4", { arg1: nextUp.w.name, arg2: nextUp.status.replace('Needs ', 'needs ') })));
      const tierSelect = h('select', { 'aria-label': i18nText("ui.filter_classes_by_tier_93298ce75c") }, h('option', { value: '0' }, i18nText("ui.all_tiers_ab6bb77da4")), ...MODEL.tiers.map((tier) => h('option', { value: String(tier.tier) }, tier.name)));
      tierSelect.value = String(tierFilter);
      const roleSelect = h('select', { 'aria-label': i18nText("ui.filter_classes_by_role_ecf50793ab") }, h('option', { value: '' }, i18nText("ui.all_roles_78f133afd3")), ...Object.entries(MODEL.roles).map(([id, r]) => h('option', { value: id }, r.name)));
      roleSelect.value = roleFilter;
      const statusSelect = h('select', { 'aria-label': i18nText("ui.filter_classes_by_status_482f0d5b0b") }, h('option', { value: '' }, i18nText("ui.all_a52ace420f")), h('option', { value: 'unlocked' }, i18nText("ui.unlocked_531c7b28ab")), h('option', { value: 'locked' }, i18nText("ui.locked_a424e33d90")));
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
              h('div', { class: 'muted small' }, i18nText("ui.tier_3727d897fe", { arg1: roleDef(w.role).name, arg2: w.tier, arg3: u?.unlocked ? i18nText("ui.lv_6dd209682a", { arg1: lvl }) : '' })),
              h('div', { class: `small codex-status${u?.unlocked ? ' ok' : ''}` }, i18nLabel(status)),
              h('div', { class: 'small' }, h('b', {}, `${w.ability.name}: `), w.ability.text),
              def ? h('div', { class: 'muted small' }, i18nText("ui.range_space_cab15814a7", { arg1: def.air ? i18nText("ui.flies_3bbdc6c9fb") : i18nText("ui.ground_151bf49394"), arg2: def.range, arg3: def.housing })) : null,
            ),
          ),
        );
      }
      if (!shown.length) list.append(h('p', { class: 'muted' }, i18nText("ui.no_classes_match_these_filters_b1ef0c3097")));
      body.append(list);
    };
    render();
    const unsub = this.c.subscribe(() => render());
    this.modal(i18nText("ui.warrior_codex_931b3f69ae"), body, [], 'wide', () => unsub());
  }

  openLeague(): void {
    const s = this.c.state;
    const gd = localizedData(this.c.data);
    const cur = leagueFor(s.trophies, gd);
    const nxt = nextLeague(s.trophies, gd);
    const body = h(
      'div',
      {},
      h('p', {}, h('b', {}, cur.name), i18nText("ui.honor_0c29c8fc2d", { arg1: s.trophies })),
      nxt ? h('p', { class: 'muted' }, i18nText("ui.more_honor_to_reach_3b60f7cad1", { arg1: nxt.min - s.trophies, arg2: nxt.name })) : h('p', { class: 'muted' }, i18nText("ui.you_are_in_the_top_league_8b390ac669")),
      h('p', { class: 'muted' }, i18nText("ui.season_ends_in_at_the_end_of_each_mont_c60052cb71", { arg1: formatDuration(seasonEndsAt(this.c.now()) - this.c.now()), arg2: gd.ranks.seasonResetFloor })),
      h('h3', {}, i18nText("ui.league_chests_fixed_contents_82950a94cd")),
      h('p', { class: 'muted small' }, i18nText("ui.sized_for_your_clan_keep_level_won_att_efc90477c4", { arg1: hallLevel(s, gd) })),
    );
    for (const l of gd.ranks.leagues) {
      const bonus = Object.keys(l.winBonus ?? {}).length ? h('div', { class: 'muted small' }, i18nText("ui.win_bonus_76ff020d10"), costChips(l.winBonus)) : null;
      body.append(h('div', { class: `log-row${l.id === cur.id ? ' current' : ''}` }, h('div', {}, h('b', {}, l.name), h('div', { class: 'muted small' }, i18nText("ui.honor_47034117c2", { arg1: l.min })), bonus), costChips(leagueChest(l, hallLevel(s, gd), gd))));
    }
    body.append(h('p', { class: 'muted small' }, i18nText("ui.win_raids_to_earn_honor_lose_it_when_y_a98b0bc1b5")));
    this.modal(i18nText("ui.honor_22ea092e76"), body, [], 'normal');
  }

  openLog(): void {
    const s = this.c.state;
    const body = h('div', {});
    const attacks = [...s.battleLog, ...s.defenseLog].sort((a, b) => b.at - a.at);
    // Settle the score (sim/rematch.ts): a recent simulated raider's own base, once, labelled as generated.
    const answerable = new Set(this.deps.onRematch ? rematchable(s, this.c.now(), localizedData(this.c.data)).map((d) => d.id) : []);
    if (!attacks.length) body.append(h('p', { class: 'muted' }, i18nText("ui.no_battles_yet_tap_attack_to_raid_a_ne_5372be52a7")));
    for (const r of attacks) {
      const stars = h('span', { class: 'stars-mini' });
      for (let i = 0; i < 3; i++) stars.append(h('span', { class: i < r.result.stars ? '' : 'off' }, '★'));
      // A replay recorded under older battle rules would show a different fight, so it is not offered.
      const canReplay = replayable(r);
      const replay = canReplay
        ? h('button', { class: 'btn sky', type: 'button' }, i18nText("ui.replay_c8dae6371b"))
        : h('span', { class: 'muted small', title: i18nText("ui.recorded_under_older_battle_rules_the__739b854d33") }, i18nText("ui.replay_unavailable_older_rules_708e543064"));
      if (canReplay) replay.addEventListener('click', () => {
        this.closeAllModals();
        this.deps.onReplay(r);
      });
      // Attacks show what reached storage; old records stored that in result.loot.
      const loot = r.kind === 'attack' ? r.banked ?? r.result.loot : r.result.loot;
      // A held defense pays a small reward (`banked` on the defense record).
      const held = r.kind === 'defense' && r.banked && Object.values(r.banked).some((v) => (v ?? 0) > 0) ? h('span', { class: 'chip good held' }, i18nText("ui.held_f2e1e705b1"), costChips(r.banked)) : null;
      const settle = answerable.has(r.id)
        ? h('button', { class: 'btn danger', type: 'button', title: i18nText("ui.attack_s_own_base_a_simulated_raider_n_0be62cf5a4", { arg1: r.opponentName }), onclick: () => { this.closeAllModals(); this.deps.onRematch?.(r.id); } }, i18nText("ui.settle_the_score_819ad8b9c9"))
        : null;
      body.append(
        h(
          'div',
          { class: 'log-row' },
          h('div', {}, h('b', {}, r.kind === 'attack' ? i18nText("ui.you_raided_b4bf27bb8b", { arg1: isolateName(r.opponentName), arg2: r.setup.base.practice ? i18nLabel(' (practice)') : '' }) : i18nText("ui.raided_you_29f66d0636", { arg1: isolateName(r.opponentName), arg2: r.simulated ? i18nText("ui.simulated_raider_aaf83ad5d6") : '' })), h('div', { class: 'row' }, stars, r.trophies !== undefined ? h('span', { class: `chip ${r.trophies >= 0 ? 'good' : 'short'}` }, icon(icons.leaf), `${r.trophies >= 0 ? '+' : ''}${r.trophies}`) : null, h('span', { class: 'muted small' }, i18nText("ui.ago_ecf7d53ab9", { arg1: r.result.destruction, arg2: formatDuration(this.c.now() - r.at) })), Object.keys(loot).some((k) => (loot as Record<string, number>)[k] > 0) ? costChips(loot) : h('span', { class: 'chip' }, i18nText("ui.no_loot_bdac804bb2")), held)),
          h('div', { class: 'row' }, settle, replay),
        ),
      );
    }
    this.modal(i18nText("ui.battle_log_f618f95afb"), body, [], 'wide');
  }

  // ------------------------------------------------------------ welcome back

  showWelcomeBack(s: OfflineSummary, onClose?: () => void): void {
    const gd = localizedData(this.c.data);
    const body = h('div', { class: 'welcome' }, h('p', {}, i18nText("ui.you_were_away_for_5fad2a7ac4", { arg1: formatDuration(s.awayMs) })));
    const list = h('ul', {});
    for (const f of s.finished) {
      const name = buildingDef(gd, f.type).name;
      list.append(h('li', {}, f.level === 1 ? i18nText("ui.finished_building_c35f17b9de", { arg1: name }) : i18nText("ui.reached_level_643665f2d6", { arg1: name, arg2: f.level })));
    }
    const trained = Object.entries(s.trained).map(([t, n]) => i18nText("ui.message_14677cb26f", { arg1: n, arg2: gd.troops[t]?.name ?? t })).join(', ');
    if (trained) list.append(h('li', {}, i18nText("ui.finished_training_f0d9a0ead3", { arg1: trained })));
    const gains = RESOURCE_KINDS.filter((k) => (s.collectorGains[k] ?? 0) > 0);
    if (gains.length) {
      list.append(
        h('li', {}, i18nText("ui.your_collectors_gathered_55d534315d"), i18nList(gains.map((k) => i18nText("ui.message_14677cb26f", { arg1: formatNumber(s.collectorGains[k]!), arg2: RES_LABEL[k] })), 'conjunction'), i18nText("ui.tap_the_bubbles_to_collect_b67c21d0a9")),
      );
    }
    for (const r of s.raids) {
      const lost = i18nList(RESOURCE_KINDS.filter((k) => (r.result.loot[k] ?? 0) > 0).map((k) => i18nText("ui.message_14677cb26f", { arg1: formatNumber(r.result.loot[k]!), arg2: RES_LABEL[k] })), 'conjunction');
      list.append(h('li', {}, i18nText("ui.raided_you_d9e46d7bd1", { arg1: isolateName(r.opponentName), arg2: r.simulated ? i18nText("ui.simulated_raider_aaf83ad5d6") : '', arg3: '★'.repeat(r.result.stars), arg4: '☆'.repeat(3 - r.result.stars), arg5: r.result.destruction }), lost ? i18nText("ui.took_cc3b25b89b", { arg1: lost }) : i18nText("ui.took_nothing_14469bdaf6"), r.trophies ? i18nText("ui.honor_b338aaea42", { arg1: r.trophies > 0 ? '+' : '', arg2: r.trophies }) : '.'));
    }
    if (this.c.state.shieldUntil > this.c.now() && s.raids.some((r) => shieldHoursFor(r.result.destruction, localizedData(this.c.data)) > 0)) {
      list.append(h('li', {}, i18nText("ui.you_have_a_shield_for_3b6f18b25b", { arg1: formatDuration(this.c.state.shieldUntil - this.c.now()) })));
    }
    for (const sr of s.seasons) {
      list.append(h('li', {}, i18nText("ui.the_season_ended_your_chest_b601d5ff95", { arg1: localizedData(this.c.data).ranks.leagues.find((l) => l.id === sr.league)?.name ?? sr.league }), costChips(sr.chest), sr.overflow ? h('span', { class: 'muted small' }, i18nText("ui.did_not_fit_in_storage_2fd00242ff"), costChips(sr.overflow), ')') : null));
    }
    if (!list.childElementCount) list.append(h('li', {}, i18nText("ui.all_quiet_in_the_village_330fd36258")));
    body.append(list);
    if (s.raids.length) {
      const btn = h('button', { class: 'btn sky', type: 'button' }, i18nText("ui.see_defense_replays_db4b59b872"));
      btn.addEventListener('click', () => {
        this.closeAllModals();
        this.openLog();
      });
      body.append(h('div', { class: 'actions' }, btn));
    }
    const close = this.modal(i18nText("ui.welcome_back_346181d6c9"), body, [{ label: i18nText("ui.great_3765ea1603"), primary: true, onClick: () => close() }], 'normal', onClose);
  }

  // ------------------------------------------------------------ settings

  /**
   * Settings, in the order players look for things (re-audit design item 8): Sound, Notifications, Graphics, Privacy
   * and help, Account (online play, age group and spending); then Advanced (save code, earlier villages, server
   * address, testing tools, frame rate, analytics, start over). Opened from the net pill, online play comes first.
   */
  private openSettings(online = false): void {
    const body = h('div', { class: 'settings' });
    const net = this.onlineSection();
    if (online) body.append(net);

    // Sound
    const sfxToggle = h('input', { type: 'checkbox', checked: sound.settings.sfx }) as HTMLInputElement;
    sfxToggle.addEventListener('change', () => sound.setSfx(sfxToggle.checked));
    const musicToggle = h('input', { type: 'checkbox', checked: sound.settings.music }) as HTMLInputElement;
    musicToggle.addEventListener('change', () => sound.setMusic(musicToggle.checked));
    const hs = uiArt.hapticsSetting;
    const hapticToggle = hs ? (h('input', { type: 'checkbox', checked: hs.get() }) as HTMLInputElement) : null;
    hapticToggle?.addEventListener('change', () => {
      hs!.set(hapticToggle.checked);
      if (hapticToggle.checked) uiArt.haptic('selection');
    });
    body.append(
      h('h3', {}, i18nText("ui.sound_46124e0236")),
      h('label', { class: 'toggle' }, sfxToggle, i18nText("ui.sound_effects_8ccb83f059")),
      h('label', { class: 'toggle' }, musicToggle, i18nText("ui.music_93359f51a4")),
    );
    if (hapticToggle) body.append(h('label', { class: 'toggle' }, hapticToggle, i18nText("ui.vibration_on_phones_that_support_it_3461bfb1b5")));

    // Notifications
    const prefs = this.deps.prefs;
    const breakToggle = h('input', { type: 'checkbox', checked: prefs.get('sessionReminder') }) as HTMLInputElement;
    breakToggle.addEventListener('change', () => prefs.set('sessionReminder', breakToggle.checked));
    const remindToggle = h('input', { type: 'checkbox', checked: prefs.get('reminders') }) as HTMLInputElement;
    const nd = localizedData(this.c.data).notifications;
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
    typeBox.append(h('p', { class: 'muted small' }, i18nText("ui.at_most_a_day_and_none_between_and_the_8042e6ba31", { arg1: nd.maxPerDay, arg2: pad(nd.quietHours.start), arg3: pad(nd.quietHours.end) })));
    remindToggle.addEventListener('change', () => {
      prefs.set('reminders', remindToggle.checked);
      for (const tg of typeToggles) tg.disabled = !remindToggle.checked;
      if (remindToggle.checked) void this.deps.onRemindersEnabled();
      else this.deps.onNotificationsChanged?.();
    });
    body.append(
      h('h3', {}, i18nText("ui.notifications_and_healthy_play_a7de3df350")),
      h('label', { class: 'toggle' }, remindToggle, i18nText("ui.send_me_notifications_off_until_you_tu_aeadb5e927")),
      typeBox,
      h('label', { class: 'toggle' }, breakToggle, i18nText("ui.suggest_a_break_after_an_hour_of_play_7a4f7f2842")),
      h('p', { class: 'muted small' }, i18nMessage(this.deps.reminderNote)),
      h('div', { class: 'actions' }, h('button', { class: 'btn ghost', type: 'button', onclick: () => { this.closeAllModals(); this.deps.onReplayTutorial(); } }, i18nText("ui.replay_the_tutorial_fd4b665fc3"))),
    );

    // Graphics
    body.append(this.languageRow());
    body.append(h('h3', {}, i18nText("ui.graphics_a874fca87c")), this.qualityRow());

    // Privacy and help (crash reports are a privacy choice, so they sit here)
    body.append(this.privacySection());
    const prefsCrash = this.deps.crashReports;
    if (prefsCrash) {
      // Opt-in (off until switched on): matches the privacy policy and store declarations (worldwide audit GLOBAL-019).
      const crashToggle = h('input', { type: 'checkbox', checked: prefs.get('crashReports') }) as HTMLInputElement;
      crashToggle.addEventListener('change', () => prefs.set('crashReports', crashToggle.checked));
      body.append(
        h('label', { class: 'toggle' }, crashToggle, i18nText("ui.send_crash_reports_off_until_you_turn__1d05349b9a")),
        h('p', { class: 'muted small' }, i18nText("ui.when_the_game_hits_an_error_it_sends_t_3635ae942b")),
      );
    }

    // Play statistics (report section 5 step 5): opt-in, adults only, a random id instead of the account.
    const stats = this.deps.stats;
    if (stats && (stats.available || stats.on)) {
      const statsToggle = h('input', { type: 'checkbox', checked: stats.on }) as HTMLInputElement;
      statsToggle.addEventListener('change', () => void stats.set(statsToggle.checked));
      body.append(
        h('label', { class: 'toggle' }, statsToggle, i18nText("ui.share_play_statistics_off_until_you_tu_5b3ea7662c")),
        h('p', { class: 'muted small' }, i18nLabel(STATS_EXPLAINER)),
      );
    }

    // Account: online play, age group and spending
    body.append(h('h3', { class: 'settings-group' }, i18nText("ui.account_7e1b0d5641")));
    if (!online) body.append(net);
    body.append(this.econ.spendSection());

    // Advanced
    const adv = h('div', { class: 'settings-advanced' });
    body.append(h('h3', { class: 'settings-group' }, i18nText("ui.advanced_9f088dbebd")), adv);

    // Save transfer
    const codeBox = h('textarea', { class: 'code', rows: 4, spellcheck: 'false', autocapitalize: 'off', placeholder: i18nText("ui.paste_a_save_code_here_to_load_a_villa_214add2875") }) as HTMLTextAreaElement;
    adv.append(
      h('h4', {}, i18nText("ui.move_your_village_save_code_1bdb9c0a9e")),
      h('p', { class: 'muted' }, this.deps.store.persistent ? i18nText("ui.your_village_saves_automatically_on_th_ac56785b87") : i18nText("ui.this_browser_mode_cannot_save_your_vil_6256737850")),
      codeBox,
      h(
        'div',
        { class: 'actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => this.exportSave(codeBox) }, i18nText("ui.copy_save_code_3ac3ad4d9c")),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => this.importSave(codeBox.value) }, i18nText("ui.load_from_code_c70a0d2a2e")),
      ),
    );

    // Villages kept after a save could not be read.
    const earlier = h('div', {});
    adv.append(earlier);
    void this.c.backups().then((list) => {
      if (!list.length) return;
      earlier.append(
        h('h4', {}, i18nText("ui.earlier_villages_7e0bb77734")),
        h('p', { class: 'muted small' }, i18nText("ui.kept_when_a_save_could_not_be_read_res_6e9e245885")),
        ...list.map((b) => h('div', { class: 'log-row' }, h('div', {}, h('b', {}, this.backupTitle(b)), h('div', { class: 'muted small' }, i18nDate(b.savedAt))), h('button', { class: 'btn ghost', type: 'button', onclick: () => void this.restoreVillage(b.key) }, i18nText("ui.restore_a76e13b983")))),
      );
    });

    adv.append(this.serverAddressBlock());

    // Testing tools: only in the sandbox, which has its own village and never goes online.
    const offsetText = () => (this.deps.debugTime.offsetMs() ? i18nText("ui.sandbox_clock_is_ahead_of_real_time_c3954a0322", { arg1: formatDuration(this.deps.debugTime.offsetMs()) }) : i18nText("ui.sandbox_clock_matches_real_time_10a57b19e8"));
    const offsetEl = h('p', { class: 'muted' }, offsetText());
    const events = h('div', { class: 'events' }, i18nText("ui.loading_ba3bbbe10d"));
    if (this.deps.sandbox) {
      adv.append(
        h('h4', {}, i18nText("ui.testing_tools_sandbox_a72e2ec1a9")),
        h('p', { class: 'muted' }, i18nText("ui.this_is_the_testing_sandbox_a_separate_9299f41fbf")),
        offsetEl,
        h(
          'div',
          { class: 'actions' },
          h('button', { class: 'btn ghost', type: 'button', onclick: () => { this.deps.debugTime.skip(3_600_000); offsetEl.textContent = offsetText(); this.c.tick(); this.refresh(); } }, i18nText("ui.1_hour_dcc1d1ff10")),
          h('button', { class: 'btn ghost', type: 'button', onclick: () => this.simulateAway(8) }, i18nText("ui.simulate_8_hours_away_c4b7e8050b")),
          h('button', { class: 'btn ghost', type: 'button', onclick: () => this.dropShield() }, i18nText("ui.remove_shield_9d4fbf6deb")),
        ),
        h('p', { class: 'muted small' }, i18nText("ui.new_villages_start_with_a_24_hour_shie_dd66dd89b6")),
      );
    } else {
      adv.append(
        h('h4', {}, i18nText("ui.testing_tools_15681283cf")),
        h('p', { class: 'muted small' }, i18nText("ui.time_skips_and_test_purchases_live_in__32232028f9")),
        h('div', { class: 'actions' }, h('button', { class: 'btn ghost', type: 'button', onclick: () => { location.search = '?sandbox'; } }, i18nText("ui.open_the_testing_sandbox_d2d1de97c8"))),
      );
    }

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
    adv.append(h('label', { class: 'toggle' }, fpsToggle, i18nText("ui.show_frame_rate_fps_04c07d4b90")));
    adv.append(h('details', {}, h('summary', {}, i18nText("ui.analytics_events_this_device_4fe12a5b11")), events));
    void this.deps.analytics.recent(60).then((list) => {
      clear(events);
      if (!list.length) events.append(i18nText("ui.no_events_yet_80c652c4ee"));
      for (const e of list) {
        events.append(h('div', { class: 'event' }, h('b', {}, e.name), ` ${i18nDate(e.at, {timeStyle: 'short'})} `, h('code', {}, JSON.stringify(e.props))));
      }
    });

    // Reset
    adv.append(
      h('h4', {}, i18nText("ui.start_over_5eed7e9fc8")),
      h('div', { class: 'actions' }, h('button', { class: 'btn danger', type: 'button', onclick: () => this.resetVillage() }, i18nText("ui.start_a_new_village_a8dfe0c14d"))),
    );
    body.append(h('p', { class: 'muted small' }, i18nText("ui.kagemura_ninja_clans_built_647b18e769", { arg1: this.deps.build.version, arg2: this.deps.build.builtAt })));
    this.modal(i18nText("ui.settings_74a883a037"), body, [], 'wide');
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
      { class: 'text', 'aria-label': i18nText("ui.graphics_quality_da5eb63952") },
      ...(
        [
          ['auto', i18nText('ui.automatic_now_9549772afc', {arg1: i18nLabel(now.profile === 'low' ? 'Lighter' : 'Sharp')})],
          ['low', 'Lighter: for older or low-memory phones, saves battery'],
          ['high', 'Sharp: full detail'],
        ] as [QualityChoice, string][]
      ).map(([v, label]) => h('option', { value: v, ...(getQualityChoice() === v ? { selected: true } : {}) }, i18nLabel(label))),
    ) as HTMLSelectElement;
    const note = h('p', { class: 'muted small' }, i18nText('common.graphics', {profile: i18nLabel(now.profile === 'low' ? 'Lighter' : 'Sharp')}));
    select.addEventListener('change', () => {
      if (setQualityChoice(select.value as QualityChoice)) {
        note.textContent = i18nText("ui.restart_the_game_to_apply_the_new_grap_406b117ecf");
        const restart = h('button', { class: 'btn ghost', type: 'button', onclick: () => location.reload() }, i18nText("ui.restart_now_09af1002ab"));
        note.append(' ', restart);
      }
    });
    return h('div', {}, h('label', { class: 'toggle' }, i18nText("ui.graphics_8a3477b096"), select), note);
  }

  private privacySection(): HTMLElement {
    const env = import.meta.env as Record<string, string | undefined>;
    const native = Capacitor.isNativePlatform();
    const link = (label: string, configured: string | undefined, shipped: string) => {
      const url = configured?.trim() || (language().code === 'es' ? shipped.replace('./', './es/') : shipped);
      if (native && !/^https?:/i.test(url)) {
        return h('button', { class: 'btn ghost', type: 'button', onclick: () => this.modal(label, h('iframe', { class: 'legal-frame', src: url, title: label }), [], 'wide') }, i18nLabel(label));
      }
      return h('a', { class: 'btn ghost', href: url, target: '_blank', rel: 'noopener' }, i18nLabel(label));
    };
    const email = env.VITE_SUPPORT_EMAIL?.trim();
    const serverUrl = this.deps.connection.url;
    const section = h(
      'div',
      { class: 'privacy-links' },
      h('h3', {}, i18nText("ui.privacy_and_help_f79c2d44d4")),
      h(
        'div',
        { class: 'actions' },
        link(i18nText("ui.privacy_policy_ba445cff38"), env.VITE_PRIVACY_URL, './privacy.html'),
        link(i18nText("ui.support_be91940b79"), env.VITE_SUPPORT_URL, './support.html'),
        link(i18nText("ui.community_rules_1b43c15f41"), env.VITE_COMMUNITY_URL, './community.html'),
        link(i18nText("ui.terms_of_service_e69e061448"), env.VITE_TERMS_URL, './terms.html'),
        ...(email ? [h('a', { class: 'btn ghost', href: `mailto:${email}?subject=${encodeURIComponent(i18nText("ui.kagemura_support_af3c907500"))}` }, i18nText("ui.email_df85f7ae02", { arg1: email }))] : []),
      ),
      serverUrl
        ? h('p', { class: 'muted small' }, i18nText("ui.delete_your_online_account_settings_on_954d6fa1b3"), h('a', { href: `${serverUrl}/account/delete?lang=${language().code}`, target: '_blank', rel: 'noopener' }, i18nText("ui.account_deletion_page_be14847793")), '.')
        : this.deps.connection.storedAccounts().length
          ? h('p', { class: 'muted small' }, i18nText("ui.online_play_is_off_on_this_device_but__93e0d7c565"))
          : h('p', { class: 'muted small' }, i18nText("ui.there_is_no_online_account_on_this_dev_9a43b7dd10")),
    );
    return section;
  }

  private exportSave(box: HTMLTextAreaElement): void {
    void this.c.save();
    const code = encodeExportCode(serialize(this.c.state, this.c.now()));
    box.value = code;
    box.select();
    this.deps.analytics.log('save_export', { length: code.length });
    const done = () => this.toast(i18nText("ui.save_code_copied_paste_it_on_your_othe_ead6bb7099"), 'success');
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(code).then(done, () => this.toast(i18nText("ui.select_the_code_and_copy_it_3d218c0533"), 'info'));
    } else {
      try {
        document.execCommand('copy');
        done();
      } catch {
        this.toast(i18nText("ui.select_the_code_and_copy_it_3d218c0533"), 'info');
      }
    }
  }

  private async importSave(code: string): Promise<void> {
    if (!code.trim()) {
      this.toast(i18nText("ui.paste_a_save_code_first_6aab75d022"), 'info');
      return;
    }
    let village;
    try {
      village = deserialize(decodeExportCode(code), localizedData(this.c.data));
    } catch (e) {
      this.toast(i18nMessage((e as Error).message, true), 'error');
      return;
    }
    const ok = await this.confirm(i18nText("ui.load_this_village_efcca56459"), i18nText("ui.it_will_replace_the_village_on_this_de_52ab8857c9"), i18nText("ui.replace_village_89575e2f95"), true);
    if (!ok) return;
    await this.c.replace(village);
    this.deps.analytics.log('save_import', {});
    this.closeAllModals();
    this.bus.emit('select', null);
    this.toast(i18nText("ui.village_loaded_251aab2ab8"), 'success');
  }

  private async simulateAway(hours: number): Promise<void> {
    await this.c.save();
    this.deps.debugTime.skip(hours * 3_600_000);
    location.reload();
  }

  private async dropShield(): Promise<void> {
    await this.c.replace({ ...this.c.state, shieldUntil: this.c.now() });
    this.toast(i18nText("ui.shield_removed_raiders_can_now_find_yo_95e6f0db8e"), 'info');
  }

  private async resetVillage(): Promise<void> {
    const ok = await this.confirm(i18nText("ui.start_a_new_village_11b2d89b3e"), i18nText("ui.your_current_village_on_this_device_wi_65983b7caa"), i18nText("ui.delete_and_start_over_cf0f7ab70c"), true);
    if (!ok) return;
    await this.c.reset();
    this.closeAllModals();
    this.bus.emit('select', null);
    this.toast(i18nText("ui.a_fresh_village_awaits_08f7b7c683"), 'success');
  }

  // ------------------------------------------------------------ toasts and modals

  toast(text: string, kind: 'info' | 'error' | 'success' = 'info'): void {
    if (kind === 'error') sound.play('error');
    const t = h('div', { class: `toast ${kind}` }, i18nMessage(text));
    this.toasts.append(t);
    while (this.toasts.childElementCount > 3) this.toasts.firstElementChild?.remove();
    window.setTimeout(() => t.classList.add('out'), 2600);
    window.setTimeout(() => t.remove(), 3000);
  }

  /** Shadow Trials: the endless practice ladder. Clearly a practice mode, not other players. */
  openTrials(): void {
    const gd = localizedData(this.c.data);
    const best = this.c.state.trials.best;
    const next = nextTrialTier(best);
    const info = trialInfo(next, gd, trialVariant(this.c.state.trials, next));
    const alternate = canTryAlternate(this.c.state.trials, gd);
    const body = h('div', {});
    body.append(
      h('p', {}, i18nText("ui.an_endless_ladder_of_practice_fortress_5c41313067")),
      h('p', { class: 'muted small' }, i18nText("ui.practice_mode_these_are_generated_fort_420a3ab093", { arg1: gd.trials.starsToClear })),
      h(
        'div',
        { class: 'log-row current' },
        h(
          'div',
          {},
          h('b', {}, i18nText("ui.tier_e94add5d59", { arg1: next, arg2: info.layout.name })),
          h('div', { class: 'muted small' }, i18nText("ui.clan_keep_d38018fadb", { arg1: info.hall, arg2: info.power > 1 ? i18nText("ui.defenses_e685095619", { arg1: info.power < 100 ? info.power.toFixed(2) : formatCompact(Math.round(info.power)) }) : '', arg3: info.modifiers.length ? i18nText("ui.message_c4f174b2a5", { arg1: info.modifiers.map((m) => m.name).join(', ') }) : '' })),
          h('div', { class: 'small' }, i18nMessage(info.layout.tip)),
          ...info.modifiers.map((m) => h('div', { class: 'small' }, i18nText("ui.message_d2599d42d8", { arg1: m.name, arg2: m.description }))),
        ),
        h('div', { class: 'cost' }, ...Object.entries(trialReward(next, gd)).map(([k, v]) => h('span', { class: 'chip good' }, icon(icons[k as 'acorns' | 'dew' | 'moonstones']), formatNumber(v ?? 0)))),
      ),
      h('p', { class: 'muted small' }, best > 0 ? i18nText("ui.best_tier_you_can_replay_any_cleared_t_000ba0e5d5", { arg1: best }) : i18nText("ui.you_have_not_cleared_a_tier_yet_cb231a4e2d")),
    );
    if (alternate) body.append(h('p', { class: 'note' }, i18nText("ui.stuck_on_tier_you_can_switch_it_to_a_d_36ad80b724", { arg1: next, arg2: gd.trials.maxAlternates - (this.c.state.trials.alternate ?? 0) })));
    const close = this.modal(i18nText("ui.shadow_trials_340bccf3a7"), body, [
      best > 0 && { label: i18nText("ui.replay_tier_ba6a185124", { arg1: best }), onClick: () => { close(); this.deps.onTrial(best); } },
      alternate && { label: i18nText("ui.try_a_different_fortress_d0b3ff0e49"), onClick: () => { const r = this.c.dispatch({ type: 'trialAlternate' }); close(); if (r.ok) this.openTrials(); else this.toast(i18nMessage(r.message, true), 'error'); } },
      { label: i18nText("ui.scout_tier_8fde370df8", { arg1: next }), primary: true, onClick: () => { close(); this.deps.onTrial(next); } },
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
      h('div', { class: 'modal-head' }, h('h2', { id: titleId }, title), h('button', { class: 'icon-btn', type: 'button', 'aria-label': i18nText("ui.close_7d9eb7acb1"), onclick: close }, icon(icons.close))),
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

  confirm(title: string, message: string | HTMLElement, confirmLabel: string, danger = false, cancelLabel = i18nText("ui.keep_it_fdce5da2ce")): Promise<boolean> {
    return new Promise((resolve) => {
      let answer = false;
      const close = this.modal(
        title,
        typeof message === 'string' ? h('p', {}, message) : message,
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
