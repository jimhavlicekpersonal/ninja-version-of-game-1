// @vitest-environment happy-dom
/** Beast Mode 2026-11-21 SEC-03: Settings → Advanced has no server address field unless the build allows one. */
import { describe, expect, it } from 'vitest';
import { buildHud } from './harness';

type Host = { serverAddressBlock(): HTMLElement; deps: { allowServerChoice?: boolean } };

describe('server address field (SEC-03)', () => {
  it('absent when the build does not allow a server choice', async () => {
    const { hud } = await buildHud();
    const block = (hud as unknown as Host).serverAddressBlock();
    expect(block.querySelector('input[type=url]')).toBeNull();
  });

  it('present in dev and VITE_ALLOW_SERVER_CHOICE builds', async () => {
    const { hud } = await buildHud();
    (hud as unknown as Host).deps.allowServerChoice = true;
    expect((hud as unknown as Host).serverAddressBlock().querySelector('input[type=url]')).not.toBeNull();
  });
});
