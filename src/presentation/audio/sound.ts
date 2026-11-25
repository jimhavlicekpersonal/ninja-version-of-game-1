/**
 * Original sound effects and music, synthesized with the Web Audio API at
 * runtime (no audio files). The audio context starts on the first tap, which
 * iOS requires, and only while sound effects or music are on (device F9/F18: with
 * both off no context is made, so the game never takes the phone's audio session
 * or runs the audio thread; switching one on in Settings, a tap, makes it then).
 * With both switched off later, the context is suspended.
 *
 * The palette matches the look (art re-audit item 9): plucked koto and shamisen strings made by
 * Karplus-Strong synthesis (a short noise burst circulating in a filtered delay line, rendered
 * once per pitch into a cached buffer, so a pluck costs one buffer playback), taiko drums
 * (pitched membrane plus a felt thump), a wooden clack for taps, a shakuhachi-like breath for
 * smoke, and a short victory sting. No square-wave chiptune. The voices live in `./voices.ts`;
 * the music is written in `./score.ts` and played by `./music.ts`.
 */
import { MusicPlayer, stringPitches } from './music';
import type { TrackName } from './score';
import { Kit, NOTE, SFX_STRINGS } from './voices';

/** Haptics live next to sound (`./haptics.ts`); re-exported here because this is the art compartment's contract file. */
export { haptic, hapticsEnabled, setHapticsEnabled, HAPTICS_STORAGE_KEY, type HapticKind } from './haptics';

export type Sfx =
  | 'tap' | 'open' | 'close' | 'build' | 'collect' | 'coin' | 'levelUp' | 'error' | 'magic'
  | 'deploy' | 'hit' | 'boom' | 'star' | 'victory' | 'defeat' | 'notify' | 'smoke' | 'jam' | 'recover'
  /** A star won during a battle: taiko slam under a bright chord. */
  | 'starSlam'
  /** The enemy Keep falls: a great drum and the rumble of the tower coming down. */
  | 'collapse'
  /** 100% destruction. */
  | 'perfect';

/** Background music tracks (`./score.ts`). */
export type MusicMode = TrackName;

interface Settings {
  sfx: boolean;
  music: boolean;
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem('tk.audio');
    if (raw) return { sfx: true, music: true, ...JSON.parse(raw) };
  } catch {
    /* storage blocked */
  }
  return { sfx: true, music: true };
}

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxGain!: GainNode;
  private musicGain!: GainNode;
  private kit: Kit | null = null;
  private player: MusicPlayer | null = null;
  settings: Settings = loadSettings();
  private musicTimer = 0;
  private musicMode: MusicMode | null = null;
  private lastPlayed = new Map<Sfx, number>();

  /** Sound effects or music are switched on. */
  private get wanted(): boolean {
    return this.settings.sfx || this.settings.music;
  }

  /** An audio context exists (tests, perf checks). */
  get started(): boolean {
    return this.ctx !== null;
  }

  /** Call from a user gesture. Safe to call many times. Does nothing while all sound is off. */
  unlock(): void {
    if (!this.wanted) return;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.8;
      this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.settings.sfx ? 0.55 : 0;
      this.sfxGain.connect(this.master);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.settings.music ? 0.14 : 0;
      this.musicGain.connect(this.master);
      this.kit = new Kit(this.ctx);
    }
    // Beast Mode STB-09 (UX-05): Safari leaves a context 'interrupted' after a call or Siri; a tap resumes it too.
    if (this.ctx.state !== 'running' && this.ctx.state !== 'closed' && !this.musicPaused) void this.ctx.resume();
    this.syncMusicLoop();
    this.prewarm();
  }

  private warmed = false;

  /**
   * Render the common string buffers ahead, one every 40 ms after the first tap, so no sound or
   * music note pays for its first render (a few ms each, more on a slow phone) in the middle of play.
   */
  private prewarm(): void {
    if (this.warmed || !this.ctx) return;
    this.warmed = true;
    // The sound effects' pitches, then every pitch the music plucks (the cache holds them all).
    const jobs = [...SFX_STRINGS, ...stringPitches()];
    const step = () => {
      const job = jobs.shift();
      if (!job || !this.kit) return;
      this.kit.stringBuffer(NOTE(job[0]), job[1]);
      window.setTimeout(step, 40);
    };
    window.setTimeout(step, 200);
  }

  setSfx(on: boolean): void {
    this.settings.sfx = on;
    if (this.ctx) this.sfxGain.gain.value = on ? 0.55 : 0;
    this.save();
    this.afterSwitch(on);
  }

  setMusic(on: boolean): void {
    this.settings.music = on;
    if (this.ctx) this.musicGain.gain.value = on ? 0.14 : 0;
    this.syncMusicLoop();
    this.save();
    this.afterSwitch(on);
  }

  /** A switch changed (from a tap in Settings): start the context now, or let it rest when all is off. */
  private afterSwitch(on: boolean): void {
    if (on) this.unlock();
    else if (this.ctx && this.ctx.state !== 'closed') void this.ctx.suspend();
  }

  private save(): void {
    try {
      localStorage.setItem('tk.audio', JSON.stringify(this.settings));
    } catch {
      /* ignore */
    }
  }

  /** Pause everything while the app is in the background. */
  suspend(hidden: boolean): void {
    this.musicPaused = hidden;
    this.syncMusicLoop();
    if (!this.ctx) return;
    if (hidden || !this.wanted) void this.ctx.suspend();
    else {
      void this.ctx.resume();
      // The beat clock stood still while suspended: start the next bar from now.
      if (this.musicTimer) this.player?.resync(this.ctx.currentTime);
    }
  }

  play(name: Sfx): void {
    if (!this.ctx || !this.kit) return;
    // The result sting ends the battle music with its coda (music on, whether or not effects are).
    if ((name === 'victory' || name === 'defeat') && this.player && this.settings.music && !this.musicPaused) this.player.coda(name);
    if (!this.settings.sfx) return;
    const k = this.kit;
    // Rate-limit busy sounds (battle hits) so they never become noise.
    const now = this.ctx.currentTime;
    const gap = name === 'hit' ? 0.06 : name === 'deploy' ? 0.05 : name === 'tap' ? 0.03 : name === 'boom' ? 0.08 : 0;
    if (gap && now - (this.lastPlayed.get(name) ?? -1) < gap) return;
    this.lastPlayed.set(name, now);
    const t = now + 0.005;
    const out = this.sfxGain;
    switch (name) {
      case 'tap':
        k.clack(t, 0.18, out);
        break;
      case 'open':
        k.clack(t, 0.14, out, 0.9);
        k.pluck(NOTE(76), t + 0.02, 0.35, out);
        break;
      case 'close':
        k.clack(t, 0.12, out, 0.8);
        k.pluck(NOTE(69), t + 0.02, 0.28, out);
        break;
      case 'build':
        // Mallet on timber, twice.
        k.clack(t, 0.3, out, 0.42);
        k.tone(160, t, 0.1, 'sine', 0.35, out, 90);
        k.clack(t + 0.15, 0.26, out, 0.46);
        k.tone(180, t + 0.15, 0.09, 'sine', 0.3, out, 100);
        break;
      case 'collect':
        [76, 81, 83, 88].forEach((n, i) => k.pluck(NOTE(n), t + i * 0.05, 0.32, out));
        break;
      case 'coin':
        k.pluck(NOTE(88), t, 0.34, out, 'shamisen');
        k.pluck(NOTE(95), t + 0.07, 0.3, out, 'shamisen');
        break;
      case 'levelUp':
        [64, 69, 71, 76, 81].forEach((n, i) => k.pluck(NOTE(n), t + i * 0.08, 0.36, out));
        k.taiko(t + 0.4, 0.4, out);
        break;
      case 'error':
        k.pluck(NOTE(53), t, 0.4, out, 'shamisen');
        k.pluck(NOTE(52), t + 0.09, 0.4, out, 'shamisen');
        break;
      case 'magic':
        [83, 88, 89, 93, 95].forEach((n, i) => k.pluck(NOTE(n), t + i * 0.035, 0.22, out));
        k.breath(t, 0.6, 0.08, out, NOTE(88));
        break;
      case 'deploy':
        // A soft whoosh and a light footfall.
        k.burst(t, 0.12, 0.18, 'bandpass', 1500, out);
        k.clack(t + 0.03, 0.06, out, 0.6);
        break;
      case 'hit':
        k.burst(t, 0.04, 0.18, 'highpass', 2200, out);
        break;
      case 'boom':
        k.taiko(t, 0.7, out);
        k.burst(t + 0.02, 0.4, 0.4, 'lowpass', 600, out);
        break;
      case 'star':
        k.pluck(NOTE(88), t, 0.4, out);
        k.tone(NOTE(100), t + 0.02, 0.5, 'sine', 0.06, out);
        break;
      case 'starSlam':
        k.taiko(t, 0.8, out);
        [76, 83, 88].forEach((n) => k.pluck(NOTE(n), t + 0.01, 0.24, out, 'shamisen'));
        k.tone(NOTE(100), t + 0.03, 0.6, 'sine', 0.07, out);
        break;
      case 'collapse':
        k.taiko(t, 0.95, out, 2);
        k.burst(t + 0.05, 1.3, 0.5, 'lowpass', 180, out);
        for (let i = 0; i < 5; i++) k.clack(t + 0.25 + i * 0.11 + Math.random() * 0.05, 0.08, out, 0.35 + Math.random() * 0.2);
        break;
      case 'perfect':
        k.taiko(t, 0.7, out);
        k.taiko(t + 0.12, 0.7, out);
        [64, 71, 76, 83, 88].forEach((n, i) => k.pluck(NOTE(n), t + 0.24 + i * 0.03, 0.26, out, i % 2 ? 'koto' : 'shamisen'));
        break;
      case 'victory':
        // Sting: a short taiko roll, a rising koto run and a held shamisen chord.
        [0, 0.11, 0.2].forEach((dt, i) => k.taiko(t + dt, 0.45 + i * 0.12, out));
        [64, 69, 71, 76, 81, 83].forEach((n, i) => k.pluck(NOTE(n), t + 0.28 + i * 0.06, 0.3, out));
        [76, 83, 88].forEach((n) => k.pluck(NOTE(n), t + 0.7, 0.26, out, 'shamisen'));
        k.taiko(t + 0.7, 0.7, out);
        break;
      case 'defeat':
        [76, 72, 69, 64].forEach((n, i) => k.pluck(NOTE(n), t + i * 0.22, 0.3, out));
        k.taiko(t + 0.9, 0.35, out);
        break;
      case 'notify':
        k.pluck(NOTE(81), t, 0.3, out);
        k.pluck(NOTE(88), t + 0.1, 0.3, out);
        break;
      case 'smoke':
        // A soft pop, then a long breath of air through bamboo.
        k.tone(220, t, 0.06, 'sine', 0.3, out, 120);
        k.breath(t + 0.02, 1.0, 0.16, out);
        break;
      case 'jam':
        // Metal on metal: a clank and a slack, buzzing string.
        k.burst(t, 0.05, 0.35, 'bandpass', 3200, out);
        k.pluck(NOTE(50), t + 0.01, 0.45, out, 'shamisen');
        k.pluck(NOTE(51), t + 0.05, 0.3, out, 'shamisen');
        break;
      case 'recover':
        k.pluck(NOTE(69), t, 0.25, out);
        k.pluck(NOTE(76), t + 0.07, 0.25, out);
        break;
    }
  }

  /**
   * Background music (`./music.ts`, tracks in `./score.ts`): the village theme at home, the battle
   * theme in raids (its scouting layer until the battle starts), the Shadow Trials theme in trials.
   * A new track crossfades over the old one.
   */
  music(mode: MusicMode | null): void {
    // The same battle again after its coda (a rematch) starts the track over.
    if (this.musicMode === mode && !(mode && this.player && this.player.playing === null)) return;
    this.musicMode = mode;
    if (this.musicTimer && mode) this.player?.play(mode);
    this.syncMusicLoop();
  }

  /**
   * Battle intensity for the music: 0 scouting, 1 fighting, 2 after the first star, 3 the last
   * stand. Cheap to call every frame; the music changes on its next bar line.
   */
  musicIntensity(level: number): void {
    this.intensity = level;
    this.player?.setIntensity(level);
  }

  private intensity = 0;

  /**
   * Report section 5 step 3 (device F9): the scheduler runs only while music can be heard. Muting
   * used to set the gain to 0 and keep building oscillators every eighth note for the whole session
   * (CPU and battery for silence on a cheap phone), and a hidden page kept scheduling too.
   */
  private musicPaused = false;

  private syncMusicLoop(): void {
    const wanted = Boolean(this.ctx && this.musicMode && this.settings.music && !this.musicPaused);
    if (wanted && !this.musicTimer) this.startMusicLoop();
    else if (!wanted) this.stopMusicLoop();
  }

  private stopMusicLoop(): void {
    window.clearInterval(this.musicTimer);
    this.musicTimer = 0;
    // Silence what was booked ahead; the track starts fresh when the loop comes back.
    this.player?.play(null);
  }

  /** Whether the music scheduler is running (tests, perf checks). */
  get musicRunning(): boolean {
    return this.musicTimer !== 0;
  }

  private startMusicLoop(): void {
    const ctx = this.ctx!;
    if (!this.player) this.player = new MusicPlayer(this.kit!, this.musicGain);
    this.player.play(this.musicMode, ctx.currentTime);
    this.player.setIntensity(this.intensity);
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 100);
    this.scheduleMusic();
  }

  private scheduleMusic(): void {
    if (!this.ctx || !this.player) return;
    // 0.4 s ahead: a busy main thread on a cheap phone can hold a 100 ms timer back that long.
    this.player.pump(this.ctx.currentTime + 0.4);
  }
}

export const sound = new SoundEngine();
