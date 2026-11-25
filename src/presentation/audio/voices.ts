/**
 * The instruments sound effects and music share: Web Audio primitives on one context. The
 * `tone`, `burst`, `stringBuffer`, `pluck`, `taiko`, `clack` and `breath` voices are the original
 * sound-effect voices moved here unchanged; the music engine (`./music.ts`) adds a shakuhachi,
 * a pad, a rin bell, the shime-daiko and a small kane gong. Every voice schedules a handful of
 * nodes that stop on their own; nothing here keeps running.
 */

export type StringVoice = 'koto' | 'shamisen';

export const NOTE = (n: number): number => 440 * Math.pow(2, (n - 69) / 12); // MIDI note -> Hz

/** The string pitches the sound effects pluck (warmed ahead in `sound.ts`). */
export const SFX_STRINGS: [number, StringVoice][] = [
  ...[52, 53, 57, 59, 64, 65, 69, 71, 72, 76, 77, 81, 83, 84, 88, 89, 93, 95].map((n): [number, StringVoice] => [n, 'koto']),
  ...[50, 51, 53, 52, 76, 83, 88, 95].map((n): [number, StringVoice] => [n, 'shamisen']),
];

/** Most cached string buffers kept (each about 0.3 MB for a koto at 48 kHz; cheap phones). */
export const STRING_CACHE_MAX = 64;

export class Kit {
  readonly noise: AudioBuffer;
  /** Karplus-Strong string buffers by pitch and voice. */
  readonly strings = new Map<string, AudioBuffer>();

  constructor(readonly ctx: BaseAudioContext) {
    const len = ctx.sampleRate * 0.5;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let seed = 1;
    for (let i = 0; i < len; i++) {
      seed = (seed * 16807) % 2147483647;
      d[i] = (seed / 2147483647) * 2 - 1;
    }
  }

  tone(freq: number, start: number, dur: number, type: OscillatorType, vol: number, out: AudioNode, glideTo?: number): void {
    const ctx = this.ctx;
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

  burst(start: number, dur: number, vol: number, filter: BiquadFilterType, freq: number, out: AudioNode): void {
    const ctx = this.ctx;
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
  stringBuffer(freq: number, voice: 'koto' | 'shamisen'): AudioBuffer {
    const ctx = this.ctx;
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
    if (this.strings.size > STRING_CACHE_MAX) this.strings.clear();
    this.strings.set(key, buf);
    return buf;
  }

  /**
   * `rate` plays the buffer faster or slower (a transposed track reuses the cached pitches instead of
   * rendering new ones); `bend` > 0 presses the string up into the note from that many semitones
   * below (the koto's oshide), < 0 lets it fall after the attack.
   */
  pluck(freq: number, start: number, vol: number, out: AudioNode, voice: 'koto' | 'shamisen' = 'koto', rate = 1, bend = 0): void {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.stringBuffer(freq, voice);
    if (rate !== 1 || bend !== 0) {
      const p = src.playbackRate;
      if (bend > 0) {
        p.setValueAtTime(rate * Math.pow(2, -bend / 12), start);
        p.linearRampToValueAtTime(rate, start + 0.09);
      } else if (bend < 0) {
        p.setValueAtTime(rate, start);
        p.setValueAtTime(rate, start + 0.25);
        p.linearRampToValueAtTime(rate * Math.pow(2, bend / 12), start + 0.6);
      } else p.value = rate;
    }
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(g).connect(out);
    src.start(start);
  }

  /** Taiko: a pitched membrane that drops, a felt thump and the stick's click. `size` 1 is a mid drum, 2 the great drum. */
  taiko(start: number, vol: number, out: AudioNode, size = 1): void {
    const f0 = size >= 2 ? 72 : 118;
    const dur = size >= 2 ? 1.1 : 0.42;
    this.tone(f0, start, dur, 'sine', vol, out, f0 * 0.55);
    this.tone(f0 * 1.52, start, dur * 0.35, 'sine', vol * 0.35, out, f0 * 0.8);
    this.burst(start, size >= 2 ? 0.2 : 0.07, vol * 0.8, 'lowpass', size >= 2 ? 260 : 420, out);
    this.burst(start, 0.018, vol * 0.25, 'bandpass', 1800, out);
  }

  /** A hard-wood clack (hyoshigi): two short resonant noise knocks. */
  clack(start: number, vol: number, out: AudioNode, pitch = 1): void {
    const ctx = this.ctx;
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
  breath(start: number, dur: number, vol: number, out: AudioNode, freq = 587): void {
    const ctx = this.ctx;
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

  /**
   * Shakuhachi: a breathy bamboo flute. A sine and a soft triangle that start a little flat and
   * rise into the note (meri to kari), a vibrato that grows as the note is held, and band-passed air
   * that puffs at the attack (muraiki). `fall` drops the end of the note, as players do at a phrase end.
   */
  flute(freq: number, start: number, dur: number, vol: number, out: AudioNode, fall = false): void {
    const ctx = this.ctx;
    const end = start + dur;
    const o = ctx.createOscillator();
    o.type = 'sine';
    const o2 = ctx.createOscillator();
    o2.type = 'triangle';
    for (const osc of [o, o2]) {
      osc.frequency.setValueAtTime(freq * 0.965, start);
      osc.frequency.linearRampToValueAtTime(freq, start + Math.min(0.14, dur * 0.3));
      if (fall && dur > 0.5) {
        osc.frequency.setValueAtTime(freq, end - 0.28);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.88, end);
      }
    }
    // Vibrato: none at the attack, growing over a held note.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.1;
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(0, start);
    depth.gain.linearRampToValueAtTime(0, start + Math.min(0.35, dur * 0.4));
    depth.gain.linearRampToValueAtTime(freq * (dur > 1 ? 0.014 : 0.006), end);
    lfo.connect(depth);
    depth.connect(o.frequency);
    depth.connect(o2.frequency);
    const g = ctx.createGain();
    const rel = Math.min(0.22, dur * 0.35);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + 0.07);
    g.gain.linearRampToValueAtTime(vol * 0.82, start + 0.3);
    g.gain.linearRampToValueAtTime(vol * 0.95, end - rel);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    const g2 = ctx.createGain();
    g2.gain.value = 0.22;
    o.connect(g);
    o2.connect(g2).connect(g);
    g.connect(out);
    // Air: a strong puff at the attack, a thin breath under the tone.
    const air = ctx.createBufferSource();
    air.buffer = this.noise;
    air.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = Math.min(freq * 2.2, 5000);
    bp.Q.value = 1.1;
    const ag = ctx.createGain();
    ag.gain.setValueAtTime(0.0001, start);
    ag.gain.exponentialRampToValueAtTime(vol * 0.55, start + 0.03);
    ag.gain.exponentialRampToValueAtTime(vol * 0.12, start + 0.2);
    ag.gain.setValueAtTime(vol * 0.12, end - rel);
    ag.gain.exponentialRampToValueAtTime(0.0001, end);
    air.connect(bp).connect(ag).connect(out);
    for (const s of [o, o2, lfo]) {
      s.start(start);
      s.stop(end + 0.05);
    }
    air.start(start, (freq * 0.0137) % 0.4);
    air.stop(end + 0.05);
  }

  /**
   * A soft pad under the melody (a sho-like cloud of reeds): one slightly detuned oscillator per
   * chord tone through one low-pass that opens and closes, with a slow swell in and out.
   */
  pad(notes: number[], start: number, dur: number, vol: number, out: AudioNode, wave: OscillatorType = 'triangle', cutoff = 1200): void {
    const ctx = this.ctx;
    const end = start + dur;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(cutoff * 0.6, start);
    lp.frequency.linearRampToValueAtTime(cutoff, start + dur * 0.5);
    lp.frequency.linearRampToValueAtTime(cutoff * 0.7, end);
    lp.Q.value = 0.7;
    const g = ctx.createGain();
    const swell = Math.min(1.4, dur * 0.4);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + swell);
    g.gain.setValueAtTime(vol, end - swell);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    lp.connect(g).connect(out);
    // One oscillator per tone (they run for the whole chord, the costliest part of the music on a
    // cheap phone); alternate tones lean sharp and flat so the chord still beats gently.
    notes.forEach((n, i) => {
      const o = ctx.createOscillator();
      o.type = wave;
      o.frequency.value = NOTE(n);
      o.detune.value = i % 2 ? 7 : -7;
      o.connect(lp);
      o.start(start);
      o.stop(end + 0.05);
    });
  }

  /** Rin: a temple bowl bell. A pure tone with two inharmonic partials that die away faster. */
  bell(freq: number, start: number, vol: number, out: AudioNode, ring = 3): void {
    for (const [mult, v, d] of [[1, 1, ring], [2.76, 0.32, ring * 0.45], [5.4, 0.12, ring * 0.2]] as const) {
      this.tone(freq * mult, start, d, 'sine', vol * v, out);
    }
  }

  /** Shime-daiko: a small, tightly tuned drum. A quick high knock with the stick's crack. */
  shime(start: number, vol: number, out: AudioNode): void {
    this.tone(430, start, 0.09, 'sine', vol, out, 300);
    this.burst(start, 0.035, vol * 0.7, 'bandpass', 2600, out);
  }

  /** Kane (atarigane): a small hand gong struck with a horn beater; bright and short. */
  kane(start: number, vol: number, out: AudioNode): void {
    this.tone(1250, start, 0.32, 'sine', vol * 0.5, out);
    this.tone(1870, start, 0.22, 'sine', vol * 0.35, out);
    this.tone(3120, start, 0.12, 'sine', vol * 0.2, out);
    this.burst(start, 0.03, vol * 0.4, 'highpass', 5000, out);
  }

  /** A short, round sub note under the bass line. */
  sub(freq: number, start: number, dur: number, vol: number, out: AudioNode): void {
    this.tone(freq, start, dur, 'sine', vol, out);
  }
}
