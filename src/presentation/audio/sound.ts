/**
 * Original sound effects and music, synthesized with the Web Audio API at
 * runtime (no audio files). The audio context starts on the first tap, which
 * iOS requires.
 */
export type Sfx =
  | 'tap' | 'open' | 'close' | 'build' | 'collect' | 'coin' | 'levelUp' | 'error' | 'magic'
  | 'deploy' | 'hit' | 'boom' | 'star' | 'victory' | 'defeat' | 'notify';

const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12); // MIDI note -> Hz

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
  private noise: AudioBuffer | null = null;
  settings: Settings = loadSettings();
  private musicTimer = 0;
  private musicMode: 'village' | 'battle' | null = null;
  private nextBeat = 0;
  private beat = 0;
  private lastPlayed = new Map<Sfx, number>();

  /** Call from a user gesture. Safe to call many times. */
  unlock(): void {
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
      const len = this.ctx.sampleRate * 0.5;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      let seed = 1;
      for (let i = 0; i < len; i++) {
        seed = (seed * 16807) % 2147483647;
        d[i] = (seed / 2147483647) * 2 - 1;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    if (this.musicMode && !this.musicTimer) this.startMusicLoop();
  }

  setSfx(on: boolean): void {
    this.settings.sfx = on;
    if (this.ctx) this.sfxGain.gain.value = on ? 0.55 : 0;
    this.save();
  }

  setMusic(on: boolean): void {
    this.settings.music = on;
    if (this.ctx) this.musicGain.gain.value = on ? 0.14 : 0;
    this.save();
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
    if (!this.ctx) return;
    if (hidden) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  private tone(freq: number, start: number, dur: number, type: OscillatorType, vol: number, out: AudioNode, glideTo?: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(out);
    o.start(start);
    o.stop(start + dur + 0.02);
  }

  private burst(start: number, dur: number, vol: number, filter: BiquadFilterType, freq: number, out: AudioNode): void {
    const ctx = this.ctx!;
    if (!this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(f).connect(g).connect(out);
    src.start(start);
    src.stop(start + dur + 0.02);
  }

  play(name: Sfx): void {
    if (!this.ctx || !this.settings.sfx) return;
    // Rate-limit busy sounds (battle hits) so they never become noise.
    const now = this.ctx.currentTime;
    const gap = name === 'hit' ? 0.06 : name === 'deploy' ? 0.05 : name === 'tap' ? 0.03 : 0;
    if (gap && now - (this.lastPlayed.get(name) ?? -1) < gap) return;
    this.lastPlayed.set(name, now);
    const t = now + 0.005;
    const out = this.sfxGain;
    switch (name) {
      case 'tap':
        this.tone(1320, t, 0.05, 'triangle', 0.25, out);
        break;
      case 'open':
        this.tone(NOTE(76), t, 0.08, 'triangle', 0.25, out);
        this.tone(NOTE(81), t + 0.06, 0.1, 'triangle', 0.25, out);
        break;
      case 'close':
        this.tone(NOTE(81), t, 0.07, 'triangle', 0.2, out);
        this.tone(NOTE(74), t + 0.05, 0.09, 'triangle', 0.2, out);
        break;
      case 'build':
        this.burst(t, 0.08, 0.5, 'lowpass', 900, out);
        this.tone(180, t, 0.12, 'sine', 0.5, out, 90);
        this.burst(t + 0.14, 0.07, 0.4, 'lowpass', 1100, out);
        this.tone(200, t + 0.14, 0.1, 'sine', 0.4, out, 100);
        break;
      case 'collect':
        [84, 88, 91, 96].forEach((n, i) => this.tone(NOTE(n), t + i * 0.045, 0.12, 'sine', 0.22, out));
        break;
      case 'coin':
        this.tone(NOTE(88), t, 0.09, 'square', 0.12, out);
        this.tone(NOTE(95), t + 0.08, 0.3, 'square', 0.12, out);
        break;
      case 'levelUp':
        [72, 76, 79, 84, 88].forEach((n, i) => this.tone(NOTE(n), t + i * 0.08, 0.22, 'triangle', 0.25, out));
        break;
      case 'error':
        this.tone(160, t, 0.12, 'square', 0.12, out);
        this.tone(130, t + 0.1, 0.14, 'square', 0.12, out);
        break;
      case 'magic':
        [79, 86, 91, 98, 103].forEach((n, i) => this.tone(NOTE(n), t + i * 0.035, 0.2, 'sine', 0.16, out));
        break;
      case 'deploy':
        this.tone(520, t, 0.09, 'sine', 0.3, out, 220);
        break;
      case 'hit':
        this.burst(t, 0.05, 0.25, 'highpass', 1800, out);
        break;
      case 'boom':
        this.burst(t, 0.45, 0.7, 'lowpass', 500, out);
        this.tone(90, t, 0.4, 'sine', 0.6, out, 40);
        break;
      case 'star':
        this.tone(NOTE(91), t, 0.25, 'triangle', 0.3, out);
        this.tone(NOTE(98), t + 0.08, 0.35, 'sine', 0.2, out);
        break;
      case 'victory':
        [72, 76, 79, 84, 79, 84, 88].forEach((n, i) => this.tone(NOTE(n), t + i * 0.12, i === 6 ? 0.6 : 0.16, 'triangle', 0.28, out));
        break;
      case 'defeat':
        [76, 72, 69, 64].forEach((n, i) => this.tone(NOTE(n), t + i * 0.16, 0.3, 'triangle', 0.22, out));
        break;
      case 'notify':
        this.tone(NOTE(84), t, 0.12, 'sine', 0.25, out);
        this.tone(NOTE(91), t + 0.1, 0.2, 'sine', 0.25, out);
        break;
    }
  }

  /** Background music: a gentle pentatonic loop in the village, a perkier one in battle. */
  music(mode: 'village' | 'battle' | null): void {
    if (this.musicMode === mode) return;
    this.musicMode = mode;
    window.clearInterval(this.musicTimer);
    this.musicTimer = 0;
    if (mode && this.ctx) this.startMusicLoop();
  }

  private startMusicLoop(): void {
    const ctx = this.ctx!;
    this.nextBeat = ctx.currentTime + 0.1;
    this.beat = 0;
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 100);
  }

  private scheduleMusic(): void {
    if (!this.ctx || !this.musicMode) return;
    const battle = this.musicMode === 'battle';
    const bpm = battle ? 132 : 92;
    const step = 60 / bpm / 2; // eighth notes
    // C - A minor - F - G, four bars each pattern.
    const chords = [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]];
    const scale = [72, 74, 76, 79, 81, 84];
    while (this.nextBeat < this.ctx.currentTime + 0.3) {
      const t = this.nextBeat;
      const bar = Math.floor(this.beat / 8) % 4;
      const chord = chords[bar];
      const i = this.beat % 8;
      if (i === 0) for (const n of chord) this.tone(NOTE(n - 12), t, step * 7.5, 'sine', 0.12, this.musicGain);
      // A soft marimba-like arpeggio with a gentle, repeatable melody.
      const pattern = battle ? [0, 2, 1, 2, 0, 2, 1, 3] : [0, 1, 2, 1, 3, 2, 1, 2];
      const note = i % 2 === 0 ? chord[pattern[i] % 3] + 12 : scale[(this.beat * 3 + bar) % scale.length];
      this.tone(NOTE(note), t, step * 0.9, 'triangle', battle ? 0.1 : 0.08, this.musicGain);
      if (battle && i % 2 === 0) this.burst(t, 0.04, 0.12, 'highpass', 6000, this.musicGain);
      if (battle && i % 4 === 0) this.tone(70, t, 0.12, 'sine', 0.25, this.musicGain, 45);
      this.nextBeat += step;
      this.beat++;
    }
  }
}

export const sound = new SoundEngine();
