/**
 * What the composition root (main.ts) gives the HUD. In its own file so the HUD's lazily loaded panels
 * (settingsUi.ts) can name it without importing hud.ts (quality 22: no import cycles).
 */
import type { Analytics } from '../../backend/analytics/events';
import type { Connection } from '../../backend/net/connection';
import type { SaveStore } from '../../backend/persist/saveStore';
import type { GroveSource } from '../../backend/social/groveSource';
import type { GameController } from '../../gameplay/control/controller';
import type { BattleRecord } from '../../gameplay/sim/battle/types';
import type { UiBus } from './bus';

export interface HudDeps {
  root: HTMLElement;
  controller: GameController;
  bus: UiBus;
  analytics: Analytics;
  store: SaveStore;
  /** Data URL of a building's art, for the Build menu. */
  thumbnail(type: string): string | null;
  /** Data URL of a building at a level (sheet head and next-level preview, art F26); without it the sheet uses `thumbnail`. */
  levelThumbnail?(type: string, level: number): string | null;
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
  /** Growth batch 2026-11-14: friend invites and shared replays (main.ts wraps `GrowthClient`). */
  growth?: import('./growthUi').GrowthDeps;
  /** Growth batch 2026-11-14 (G10): where the event schedule in force came from. */
  eventScheduleSource?(): 'built-in' | 'server';
  /** The build sends the UTC offset with shared statistics (VITE_STATS_TZ=1): Settings says so. */
  statsTzNote?: boolean;
}
