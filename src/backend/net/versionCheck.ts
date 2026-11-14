/**
 * Does this game have to update before it plays online? (roadmap step 75)
 *
 * The server lists the battle-rule versions it can check (`supportedRules`)
 * and the oldest game build it serves (`minClientBuild`) in `/v1/hello`. A
 * game outside them pauses online play and says "Update Kagemura" instead of
 * getting battle results it would not recognise. The village keeps working
 * offline. Servers from before protocol 8 list neither: nothing to check.
 */
import { compareBuilds } from './dataVersion';
import type { HelloResponse } from './protocol';

/**
 * A server-held village saved by a newer build than this one (rolling deploy: another device updated first).
 * The same sentence as the HUD's update notice (`common.updateNeeded`), so it is already translated.
 */
export const NEWER_VILLAGE_MESSAGE = 'A new version of Kagemura is out, and online play needs it.';

export function updateNeeded(hello: Pick<HelloResponse, 'supportedRules' | 'minClientBuild'>, simRules: number, build: string | undefined): string | null {
  if (Array.isArray(hello.supportedRules) && hello.supportedRules.length && !hello.supportedRules.includes(simRules)) {
    return 'A new version of Kagemura is out, and online battles need it. Update the game to keep playing online. Your village is safe and still works offline.';
  }
  if (hello.minClientBuild && build && build !== 'unknown' && compareBuilds(build, hello.minClientBuild) < 0) {
    return `This version of Kagemura (${build.split('+')[0]}) is too old for online play. Update to ${hello.minClientBuild} or newer. Your village is safe and still works offline.`;
  }
  return null;
}
