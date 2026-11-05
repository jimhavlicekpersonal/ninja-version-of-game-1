/**
 * Original sound effects and music, synthesized with the Web Audio API at
 * runtime (no audio files). The audio context starts on the first tap, which
 * iOS requires.
 *
 * The palette matches the look (art re-audit item 9): plucked koto and shamisen strings made by
 * Karplus-Strong synthesis (a short noise burst circulating in a filtered delay line, rendered
 * once per pitch into a cached buffer, so a pluck costs one buffer playback), taiko drums
 * (pitched membrane plus a felt thump), a wooden clack for taps, a shakuhachi-like breath for
 * smoke, and a short victory sting. No square-wave chiptune.
 */
export type Sfx =
  | 'tap' | 'open' | 'close' | 'build' | 'collect' | 'coin' | 'levelUp' | 'error' | 'magic'
  | 'deploy' | 'hit' | 'boom' | 'star' | 'victory' | 'defeat' | 'notify' | 'smoke' | 'jam' | 'recover'
  /** A star won during a battle: taiko slam under a bright chord. */
  | 'starSlam'
  /** The enemy Keep falls: a great drum and the rumble of the tower coming down. */
  | 'collapse'
  /** 100% destruction. */
  | 'perfect';

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
  /** Karplus-Strong string buffers by pitch and voice. */
  private strings = new Map<string, AudioBuffer>();

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

  /**
   * A plucked string buffer (Karplus-Strong). `koto`: soft pluck, long ring; `shamisen`: bright,
   * short, with a little buzz. Rendered once per pitch (about 0.2 ms per second of sound) and cached.
   */
  private stringBuffer(freq: number, voice: 'koto' | 'shamisen'): AudioBuffer {
    const ctx = this.ctx!;
    const key = `${voice}:${Math.round(freq)}`;
    const hit = this.strings.get(key);
    if (hit) return hit;
    const sr = ctx.sampleRate;
    const dur = voice === 'koto' ? 1.6 : 0.7;
    const n = Math.floor(sr * dur);
    const buf = ctx.createBuffer(1, n, sr);
    const d = buf.getChannelData(0);
    const period = Math.max(2, Math.round(sr / freq));
    const ring = new Float32Array(period);
    let seed = Math.round(freq * 97) || 1;
    let prev = 0;
    // Excitation: noise, low-passed for the soft koto pick, raw for the shamisen's bachi.
    const soft = voice === 'koto' ? 0.55 : 0.1;
    for (let i = 0; i < period; i++) {
      seed = (seed * 16807) % 2147483647;
      const r = (seed / 2147483647) * 2 - 1;
      prev = prev * soft + r * (1 - soft);
      ring[i] = prev;
    }
    // Decay per period sample: koto rings longer; higher notes die faster naturally.
    const loss = voice === 'koto' ? 0.9965 : 0.991;
    let idx = 0;
    for (let i = 0; i < n; i++) {
      const next = idx + 1 === period ? 0 : idx + 1;
      let v = loss * 0.5 * (ring[idx] + ring[next]);
      // Shamisen sawari: a gentle buzz from a soft clip.
      if (voice === 'shamisen') v = Math.tanh(v * 1.6) / 1.6;
      ring[idx] = v;
      d[i] = v;
      idx = next;
    }
    if (this.strings.size > 64) this.strings.clear();
    this.strings.set(key, buf);
    return buf;
  }

  private pluck(freq: number, start: number, vol: number, out: AudioNode, voice: 'koto' | 'shamisen' = 'koto'): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.stringBuffer(freq, voice);
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(g).connect(out);
    src.start(start);
  }

  /** Taiko: a pitched membrane that drops, a felt thump and the stick's click. `size` 1 is a mid drum, 2 the great drum. */
  private taiko(start: number, vol: number, out: AudioNode, size = 1): void {
    const f0 = size >= 2 ? 72 : 118;
    const dur = size >= 2 ? 1.1 : 0.42;
    this.tone(f0, start, dur, 'sine', vol, out, f0 * 0.55);
    this.tone(f0 * 1.52, start, dur * 0.35, 'sine', vol * 0.35, out, f0 * 0.8);
    this.burst(start, size >= 2 ? 0.2 : 0.07, vol * 0.8, 'lowpass', size >= 2 ? 260 : 420, out);
    this.burst(start, 0.018, vol * 0.25, 'bandpass', 1800, out);
  }

  /** A hard-wood clack (hyoshigi): two short resonant noise knocks. */
  private clack(start: number, vol: number, out: AudioNode, pitch = 1): void {
    const ctx = this.ctx!;
    if (!this.noise) return;
    for (const [f, dt] of [[2400 * pitch, 0], [1650 * pitch, 0.004]] as const) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = 9;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol * 3, start + dt);
      g.gain.exponentialRampToValueAtTime(0.0001, start + dt + 0.045);
      src.connect(bp).connect(g).connect(out);
      src.start(start + dt, Math.random() * 0.3);
      src.stop(start + dt + 0.06);
    }
  }

  /** Shakuhachi-like breath: band-passed air with a soft, slightly bending flute tone underneath. */
  private breath(start: number, dur: number, vol: number, out: AudioNode, freq = 587): void {
    const ctx = this.ctx!;
    if (!this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(700, start);
    bp.frequency.linearRampToValueAtTime(1300, start + dur * 0.4);
    bp.frequency.linearRampToValueAtTime(800, start + dur);
    bp.Q.value = 1.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + dur * 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(bp).connect(g).connect(out);
    src.start(start);
    src.stop(start + dur + 0.05);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq * 0.97, start);
    o.frequency.linearRampToValueAtTime(freq, start + dur * 0.3);
    o.frequency.linearRampToValueAtTime(freq * 0.94, start + dur);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, start);
    og.gain.exponentialRampToValueAtTime(vol * 0.5, start + dur * 0.3);
    og.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(og).connect(out);
    o.start(start);
    o.stop(start + dur + 0.05);
  }

  play(name: Sfx): void {
    if (!this.ctx || !this.settings.sfx) return;
    // Rate-limit busy sounds (battle hits) so they never become noise.
    const now = this.ctx.currentTime;
    const gap = name === 'hit' ? 0.06 : name === 'deploy' ? 0.05 : name === 'tap' ? 0.03 : name === 'boom' ? 0.08 : 0;
    if (gap && now - (this.lastPlayed.get(name) ?? -1) < gap) return;
    this.lastPlayed.set(name, now);
    const t = now + 0.005;
    const out = this.sfxGain;
    switch (name) {
      case 'tap':
        this.clack(t, 0.18, out);
        break;
      case 'open':
        this.clack(t, 0.14, out, 0.9);
        this.pluck(NOTE(76), t + 0.02, 0.35, out);
        break;
      case 'close':
        this.clack(t, 0.12, out, 0.8);
        this.pluck(NOTE(69), t + 0.02, 0.28, out);
        break;
      case 'build':
        // Mallet on timber, twice.
        this.clack(t, 0.3, out, 0.42);
        this.tone(160, t, 0.1, 'sine', 0.35, out, 90);
        this.clack(t + 0.15, 0.26, out, 0.46);
        this.tone(180, t + 0.15, 0.09, 'sine', 0.3, out, 100);
        break;
      case 'collect':
        [76, 81, 83, 88].forEach((n, i) => this.pluck(NOTE(n), t + i * 0.05, 0.32, out));
        break;
      case 'coin':
        this.pluck(NOTE(88), t, 0.34, out, 'shamisen');
        this.pluck(NOTE(95), t + 0.07, 0.3, out, 'shamisen');
        break;
      case 'levelUp':
        [64, 69, 71, 76, 81].forEach((n, i) => this.pluck(NOTE(n), t + i * 0.08, 0.36, out));
        this.taiko(t + 0.4, 0.4, out);
        break;
      case 'error':
        this.pluck(NOTE(53), t, 0.4, out, 'shamisen');
        this.pluck(NOTE(52), t + 0.09, 0.4, out, 'shamisen');
        break;
      case 'magic':
        [83, 88, 89, 93, 95].forEach((n, i) => this.pluck(NOTE(n), t + i * 0.035, 0.22, out));
        this.breath(t, 0.6, 0.08, out, NOTE(88));
        break;
      case 'deploy':
        // A soft whoosh and a light footfall.
        this.burst(t, 0.12, 0.18, 'bandpass', 1500, out);
        this.clack(t + 0.03, 0.06, out, 0.6);
        break;
      case 'hit':
        this.burst(t, 0.04, 0.18, 'highpass', 2200, out);
        break;
      case 'boom':
        this.taiko(t, 0.7, out);
        this.burst(t + 0.02, 0.4, 0.4, 'lowpass', 600, out);
        break;
      case 'star':
        this.pluck(NOTE(88), t, 0.4, out);
        this.tone(NOTE(100), t + 0.02, 0.5, 'sine', 0.06, out);
        break;
      case 'starSlam':
        this.taiko(t, 0.8, out);
        [76, 83, 88].forEach((n) => this.pluck(NOTE(n), t + 0.01, 0.24, out, 'shamisen'));
        this.tone(NOTE(100), t + 0.03, 0.6, 'sine', 0.07, out);
        break;
      case 'collapse':
        this.taiko(t, 0.95, out, 2);
        this.burst(t + 0.05, 1.3, 0.5, 'lowpass', 180, out);
        for (let i = 0; i < 5; i++) this.clack(t + 0.25 + i * 0.11 + Math.random() * 0.05, 0.08, out, 0.35 + Math.random() * 0.2);
        break;
      case 'perfect':
        this.taiko(t, 0.7, out);
        this.taiko(t + 0.12, 0.7, out);
        [64, 71, 76, 83, 88].forEach((n, i) => this.pluck(NOTE(n), t + 0.24 + i * 0.03, 0.26, out, i % 2 ? 'koto' : 'shamisen'));
        break;
      case 'victory':
        // Sting: a short taiko roll, a rising koto run and a held shamisen chord.
        [0, 0.11, 0.2].forEach((dt, i) => this.taiko(t + dt, 0.45 + i * 0.12, out));
        [64, 69, 71, 76, 81, 83].forEach((n, i) => this.pluck(NOTE(n), t + 0.28 + i * 0.06, 0.3, out));
        [76, 83, 88].forEach((n) => this.pluck(NOTE(n), t + 0.7, 0.26, out, 'shamisen'));
        this.taiko(t + 0.7, 0.7, out);
        break;
      case 'defeat':
        [76, 72, 69, 64].forEach((n, i) => this.pluck(NOTE(n), t + i * 0.22, 0.3, out));
        this.taiko(t + 0.9, 0.35, out);
        break;
      case 'notify':
        this.pluck(NOTE(81), t, 0.3, out);
        this.pluck(NOTE(88), t + 0.1, 0.3, out);
        break;
      case 'smoke':
        // A soft pop, then a long breath of air through bamboo.
        this.tone(220, t, 0.06, 'sine', 0.3, out, 120);
        this.breath(t + 0.02, 1.0, 0.16, out);
        break;
      case 'jam':
        // Metal on metal: a clank and a slack, buzzing string.
        this.burst(t, 0.05, 0.35, 'bandpass', 3200, out);
        this.pluck(NOTE(50), t + 0.01, 0.45, out, 'shamisen');
        this.pluck(NOTE(51), t + 0.05, 0.3, out, 'shamisen');
        break;
      case 'recover':
        this.pluck(NOTE(69), t, 0.25, out);
        this.pluck(NOTE(76), t + 0.07, 0.25, out);
        break;
    }
  }

  /** Background music: a calm koto-like loop on the Japanese in scale in the village, taiko-driven in battle. */
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
    const bpm = battle ? 128 : 84;
    const step = 60 / bpm / 2; // eighth notes
    // Drones and melody on the in (miyako-bushi) scale on E: E F A B C.
    const chords = [[52, 59, 64], [53, 57, 64], [57, 64, 69], [52, 59, 64]];
    const scale = [76, 77, 81, 83, 84, 88];
    while (this.nextBeat < this.ctx.currentTime + 0.3) {
      const t = this.nextBeat;
      const bar = Math.floor(this.beat / 8) % 4;
      const chord = chords[bar];
      const i = this.beat % 8;
      if (i === 0) for (const n of chord) this.tone(NOTE(n - 12), t, step * 7.5, 'sine', 0.12, this.musicGain);
      // A plucked, koto-like line: short attack, quick decay, gentle bend down.
      const pattern = battle ? [0, 2, 1, 2, 0, 2, 1, 3] : [0, 1, 2, 1, 3, 2, 1, 2];
      const rest = !battle && (i === 3 || i === 7) && bar % 2 === 1;
      const note = i % 2 === 0 ? chord[pattern[i] % 3] + 12 : scale[(this.beat * 3 + bar) % scale.length];
      if (!rest) this.pluck(NOTE(note), t, battle ? 0.55 : 0.6, this.musicGain, battle && i % 2 ? 'shamisen' : 'koto');
      // Taiko: deep hits on the beat in battle, a soft heartbeat at home; a wood clack on the off-beat.
      if (battle && i % 2 === 0) this.taiko(t, i % 4 === 0 ? 0.5 : 0.26, this.musicGain);
      if (battle && i === 7) this.clack(t, 0.1, this.musicGain);
      if (!battle && i === 0 && bar % 2 === 0) this.taiko(t, 0.2, this.musicGain);
      this.nextBeat += step;
      this.beat++;
    }
  }
}

export const sound = new SoundEngine();
