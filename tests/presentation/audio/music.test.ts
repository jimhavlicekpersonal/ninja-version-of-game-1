/**
 * Report section 5 step 3 (device F9): the music scheduler runs only while music can be heard.
 * Muting used to zero the gain and keep synthesising a note every eighth for the whole session.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

class FakeParam {
  value = 0;
  setValueAtTime() {}
  linearRampToValueAtTime() {}
  exponentialRampToValueAtTime() {}
  setTargetAtTime() {}
}
class FakeNode {
  gain = new FakeParam();
  frequency = new FakeParam();
  Q = new FakeParam();
  connect() {
    return this;
  }
  start() {}
  stop() {}
}
let contexts = 0;
let suspends = 0;
class FakeAudioContext {
  constructor() {
    contexts++;
  }
  state = 'running';
  currentTime = 0;
  sampleRate = 8000;
  destination = new FakeNode();
  createGain = () => new FakeNode();
  createOscillator = () => new FakeNode();
  createBiquadFilter = () => new FakeNode();
  createBufferSource = () => new FakeNode();
  createBuffer = (_c: number, len: number) => ({ getChannelData: () => new Float32Array(len) });
  resume = async () => undefined;
  suspend = async () => void suspends++;
}

let sound: typeof import('../../../src/presentation/audio/sound').sound;

beforeAll(async () => {
  vi.useFakeTimers();
  vi.stubGlobal('window', { AudioContext: FakeAudioContext, setInterval, clearInterval, setTimeout, clearTimeout });
  sound = (await import('../../../src/presentation/audio/sound')).sound;
});
afterAll(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('music scheduler', () => {
  it('runs while music plays, stops when muted or hidden, and comes back', () => {
    sound.setMusic(true);
    sound.unlock();
    sound.music('village');
    expect(sound.musicRunning).toBe(true);
    sound.setMusic(false);
    expect(sound.musicRunning).toBe(false);
    sound.music('battle'); // a new track while muted starts nothing
    expect(sound.musicRunning).toBe(false);
    sound.setMusic(true);
    expect(sound.musicRunning).toBe(true);
    sound.suspend(true);
    expect(sound.musicRunning).toBe(false);
    sound.suspend(false);
    expect(sound.musicRunning).toBe(true);
    sound.music(null);
    expect(sound.musicRunning).toBe(false);
  });
});

describe('audio context (device F9/F18)', () => {
  it('is not created while sound effects and music are both off; switching one on creates it', async () => {
    vi.resetModules();
    const fresh = (await import('../../../src/presentation/audio/sound')).sound;
    const before = contexts;
    fresh.setSfx(false);
    fresh.setMusic(false);
    fresh.unlock(); // the first tap
    fresh.music('village');
    fresh.play('tap');
    expect(fresh.started).toBe(false);
    expect(contexts).toBe(before);
    // Settings: music on (a tap) makes the context and starts the track.
    fresh.setMusic(true);
    expect(fresh.started).toBe(true);
    expect(contexts).toBe(before + 1);
    expect(fresh.musicRunning).toBe(true);
    // Both off again: the context is suspended, and a return from the background does not wake it.
    const s0 = suspends;
    fresh.setMusic(false);
    expect(suspends).toBe(s0 + 1);
    fresh.suspend(false);
    expect(suspends).toBe(s0 + 2);
    expect(fresh.musicRunning).toBe(false);
  });
});
