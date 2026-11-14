/**
 * iOS Declared Age Range regulatory features and the significant-update acknowledgement (compliance switches
 * 2026-11-14, audit C02; US state app-store accountability laws such as Texas SB 2420). The TS side of two
 * methods the TkAge plugin gained in `ios/App/App/TkAgePlugin.swift` (UNCOMPILED there: no Xcode where it
 * was written). Kept beside `platform/auth.ts` (a contract file), registering the same "TkAge" plugin.
 *
 * - `regulatoryFeatures()`: whether Apple says this person is subject to the age-assurance rules
 *   (`AgeRangeService.isEligibleForAgeFeatures`) and which regulatory features apply.
 * - `acknowledgeSignificantUpdate(description)`: asks the parent or guardian (PermissionKit) to acknowledge a
 *   significant change to the app; `approved`, `declined` or `unavailable`.
 *
 * `significantUpdateDue` decides when to ask again: the newest of the server's `significantUpdateBuild`
 * (`SIGNIFICANT_UPDATE_BUILD`) and the build's `VITE_SIGNIFICANT_UPDATE_BUILD`, compared with the build last
 * acknowledged on this device (`tk.significantUpdate.ack`). Only for minors (a band other than adult) on
 * iOS with the regulatory features in effect; the web and Android ask nothing here.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { compareBuilds } from '../net/dataVersion';
import type { AgeBand } from '../../gameplay/sim/age';

export interface RegulatoryFeatures {
  /** Apple says the age-assurance rules apply to this person (iOS 26.2+); false everywhere else. */
  eligible: boolean;
  /** Regulatory features Apple lists for this person, as Apple names them (may be empty). */
  features: string[];
}

export type SignificantUpdateAnswer = 'approved' | 'declined' | 'unavailable';

interface TkAgeRegulatoryPlugin {
  regulatoryFeatures(): Promise<{ status: 'ok'; eligible: boolean; features?: string[] } | { status: 'unavailable'; reason?: string }>;
  acknowledgeSignificantUpdate(o: { description: string }): Promise<{ status: SignificantUpdateAnswer; reason?: string }>;
}

const TkAge = registerPlugin<TkAgeRegulatoryPlugin>('TkAge');

async function regulatoryFeatures(): Promise<RegulatoryFeatures> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') return { eligible: false, features: [] };
  try {
    const r = await TkAge.regulatoryFeatures();
    return r.status === 'ok' ? { eligible: r.eligible === true, features: Array.isArray(r.features) ? r.features.map(String) : [] } : { eligible: false, features: [] };
  } catch {
    return { eligible: false, features: [] };
  }
}

async function acknowledgeSignificantUpdate(description: string): Promise<SignificantUpdateAnswer> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') return 'unavailable';
  try {
    const r = await TkAge.acknowledgeSignificantUpdate({ description: description.slice(0, 500) });
    return r.status === 'approved' || r.status === 'declined' ? r.status : 'unavailable';
  } catch {
    return 'unavailable';
  }
}

const ACK_KEY = 'tk.significantUpdate.ack';
const valid = (b: string | null | undefined): b is string => typeof b === 'string' && /^\d+(\.\d+){0,3}$/.test(b.trim());

/** The build that must be acknowledged: the newest of the server's and the build's setting; null when neither is set. */
export function significantUpdateBuild(server: string | null | undefined, built: string | null | undefined): string | null {
  const list = [server, built].filter(valid).map((b) => b.trim());
  if (!list.length) return null;
  return list.reduce((a, b) => (compareBuilds(a, b) >= 0 ? a : b));
}

/** Whether to ask: a significant build is set, this build has reached it, and the last acknowledgement is older. */
export function significantUpdateDue(required: string | null, currentBuild: string, acknowledged: string | null, band: AgeBand | null): boolean {
  if (!required || band === 'adult' || band === null) return false;
  if (compareBuilds(currentBuild, required) < 0) return false;
  return !valid(acknowledged) || compareBuilds(acknowledged, required) < 0;
}

function acknowledgedBuild(kv: { get(k: string): string | null }): string | null {
  return kv.get(ACK_KEY);
}

function rememberAcknowledged(kv: { set(k: string, v: string | null): void }, build: string): void {
  kv.set(ACK_KEY, build);
}

/**
 * The whole check (main.ts, on native iOS after going online or at start): ask once per required build,
 * remember an approval; a decline or no answer is asked again next start. Returns what happened.
 */
export async function checkSignificantUpdate(o: { required: string | null; currentBuild: string; band: AgeBand | null; kv: { get(k: string): string | null; set(k: string, v: string | null): void }; description: string }): Promise<SignificantUpdateAnswer | 'not_needed'> {
  if (!significantUpdateDue(o.required, o.currentBuild, acknowledgedBuild(o.kv), o.band)) return 'not_needed';
  const reg = await regulatoryFeatures();
  if (!reg.eligible) return 'not_needed';
  const answer = await acknowledgeSignificantUpdate(o.description);
  if (answer === 'approved') rememberAcknowledged(o.kv, o.required!);
  return answer;
}
