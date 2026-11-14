/**
 * Platform achievements (retention audit G31, growth batch 2026-11-14): each in-game achievement tier
 * the player claims is reported to Game Center (iOS) or Play Games (Android) under the id in
 * `achievementIds.json`. On the web, and in an app without the native plugin, reporting does nothing.
 *
 * The native side is NOT written yet: the reporter calls a Capacitor plugin `TkAchievements`
 * (`report({ id })`) only when `Capacitor.isPluginAvailable('TkAchievements')`, which is false until
 * the owner adds it (iOS: GameKit `GKAchievement.report`, registered in `TkViewController.swift`;
 * Android: the Play Games Services v2 SDK, which the app does not include today). Nothing here was
 * compiled for a device. The ids are reported once per tier per device (`tk.platformAchievements`);
 * a platform that already has one ignores a repeat.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import ids from './achievementIds.json';

export type AchievementPlatform = 'gameCenter' | 'playGames';

interface AchievementIds {
  gameCenter: Record<string, string[]>;
  playGames: Record<string, string[]>;
}

/** The port the game reports through (a no-op where there is no platform). */
export interface AchievementPort {
  readonly platform: AchievementPlatform | null;
  report(platformId: string): Promise<void>;
}

export const ACHIEVEMENT_IDS = ids as unknown as AchievementIds;

/** The platform ids for every tier claimed in `claimed` (achievement id → tiers claimed), skipping empty ids. */
export function platformIdsFor(claimed: Record<string, number>, platform: AchievementPlatform, table: AchievementIds = ACHIEVEMENT_IDS): string[] {
  const out: string[] = [];
  for (const [id, tiers] of Object.entries(claimed)) {
    const list = table[platform][id] ?? [];
    for (let i = 0; i < Math.min(tiers, list.length); i++) if (list[i]) out.push(list[i]);
  }
  return out;
}

/** Reports what is new since the last call (kept in local storage), never the same id twice per device. */
export class AchievementReporter {
  private sent: Set<string>;
  constructor(
    private readonly port: AchievementPort,
    private readonly kv: { get(k: string): string | null; set(k: string, v: string | null): void },
    private readonly table: AchievementIds = ACHIEVEMENT_IDS,
  ) {
    let list: unknown;
    try {
      list = JSON.parse(kv.get(KEY) ?? '[]');
    } catch {
      list = [];
    }
    this.sent = new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []);
  }

  /** Call with the village's `achievements` after load and after each claim. Returns the ids reported now. */
  async sync(claimed: Record<string, number>): Promise<string[]> {
    if (!this.port.platform) return [];
    const fresh = platformIdsFor(claimed, this.port.platform, this.table).filter((id) => !this.sent.has(id));
    const done: string[] = [];
    for (const id of fresh) {
      try {
        await this.port.report(id);
        this.sent.add(id);
        done.push(id);
      } catch {
        // Not signed in to Game Center / Play Games, or offline: tried again at the next sync.
      }
    }
    if (done.length) this.kv.set(KEY, JSON.stringify([...this.sent]));
    return done;
  }
}

const KEY = 'tk.platformAchievements';

interface TkAchievementsPlugin {
  report(o: { id: string }): Promise<void>;
}

/** The device's platform, through the (not yet written) native plugin; a no-op everywhere else. */
export function nativeAchievementPort(): AchievementPort {
  const os = Capacitor.getPlatform();
  const platform: AchievementPlatform | null = Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('TkAchievements') ? (os === 'ios' ? 'gameCenter' : os === 'android' ? 'playGames' : null) : null;
  const plugin = platform ? registerPlugin<TkAchievementsPlugin>('TkAchievements') : null;
  return { platform, report: async (id) => void (await plugin?.report({ id })) };
}
