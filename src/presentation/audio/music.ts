/**
 * The music engine: plays the tracks written in `./score.ts` on the shared instruments
 * (`./voices.ts`). A small look-ahead scheduler (`pump`, called every 100 ms by `sound.ts`, or
 * once for the whole span when rendering offline) books each sixteenth's notes on the audio clock.
 *
 * Mix: every instrument has its own level, stereo place and reverb send; a track plays through
 * its own bus so a new track crossfades over the old one; a generated room reverb and a gentle
 * compressor sit at the end. Battle intensity (0 scouting … 3 last stand) changes on the next bar
 * line, with a drum hit on the way up; a victory or defeat ends the battle track with a coda.
 *
 * Cost on a cheap phone: one convolver and a compressor for the whole session; per note a buffer
 * playback (strings, cached Karplus-Strong) or two to eight short-lived nodes (flute, pad, drums).
 */
import { CHORDS, CODAS, STEPS_PER_BAR, TRACKS, parseLine, type Inst, type NoteEvent, type Part, type Track, type TrackName } from './score';
import { Kit, NOTE, type StringVoice } from './voices';

type Channel = Inst | 'pad';

/** Level, stereo position (−1 left … 1 right) and reverb send for each instrument. */
const MIX: Record<Channel, [number, number, number]> = {
  koto: [0.85, -0.22, 0.9],
  shamisen: [0.62, 0.3, 0.5],
  flute: [0.5, 0.14, 1.3],
  arp: [0.4, -0.08, 0.9],
  bass: [0.7, 0, 0.15],
  bell: [0.22, 0.38, 1.6],
  taiko: [0.62, 0.04, 0.35],
  odaiko: [0.8, 0, 0.45],
  shime: [0.3, 0.24, 0.3],
  clack: [0.32, -0.3, 0.4],
  kane: [0.2, 0.42, 0.5],
  pad: [0.11, 0, 1.1],
};

const HIT: Record<string, number> = { X: 1, x: 0.65, o: 0.35 };

interface ReadyPart extends Part {
  notes?: NoteEvent[][];
}
interface ReadySection {
  bars: number;
  chords: number[][];
  pad?: number;
  /** For each bar: how many bars the pad holds from here (0 = it continues from before). */
  padRun: number[];
  parts: ReadyPart[];
}

const ready = new Map<TrackName, ReadySection[]>();

/** The track's sections in form order, parsed once. */
export function prepare(name: TrackName): ReadySection[] {
  const hit = ready.get(name);
  if (hit) return hit;
  const track = TRACKS[name];
  const out = track.form.map((id) => {
    const s = track.sections[id];
    if (!s) throw new Error(`${name}: no section ${id}`);
    const chords = Array.from({ length: s.bars }, (_, b) => {
      const c = CHORDS[s.chords[b % s.chords.length]];
      if (!c) throw new Error(`${name}/${id}: no chord ${s.chords[b % s.chords.length]}`);
      return c;
    });
    const padRun = chords.map((c, b) => {
      if (b > 0 && chords[b - 1] === c) return 0;
      let n = 1;
      while (b + n < chords.length && chords[b + n] === c) n++;
      return n;
    });
    const parts = s.parts.map((p): ReadyPart => {
      if (p.inst === 'koto' || p.inst === 'shamisen' || p.inst === 'flute') {
        const notes = parseLine(p.line);
        if (notes.length !== s.bars) throw new Error(`${name}/${id}: ${p.inst} has ${notes.length} bars, not ${s.bars}`);
        return { ...p, notes };
      }
      if (p.line.length % STEPS_PER_BAR) throw new Error(`${name}/${id}: ${p.inst} pattern is not whole bars`);
      return p;
    });
    return { bars: s.bars, chords, pad: s.pad, padRun, parts };
  });
  ready.set(name, out);
  return out;
}

/** Every string pitch the music plucks (for warming the buffer cache before play). */
export function stringPitches(): [number, StringVoice][] {
  const seen = new Map<string, [number, StringVoice]>();
  const add = (midi: number, voice: StringVoice) => seen.set(`${voice}:${midi}`, [midi, voice]);
  for (const name of Object.keys(TRACKS) as TrackName[]) {
    for (const s of prepare(name)) {
      for (const p of s.parts) {
        if (p.notes && p.inst !== 'flute') for (const bar of p.notes) for (const e of bar) add(e.midi + (p.shift ?? 0), p.inst as StringVoice);
        if (p.inst === 'arp') for (const c of s.chords) for (const ch of p.line) if (ch !== '.') add(arpNote(c, Number(ch)), 'koto');
        if (p.inst === 'bass') for (const c of s.chords) for (const ch of p.line) if (ch !== '.') for (const v of ['koto', 'shamisen'] as const) add(bassNote(c, ch), v);
      }
    }
  }
  for (const coda of Object.values(CODAS)) for (const n of coda) if (n.inst === 'koto' || n.inst === 'shamisen') for (const m of n.notes) add(m, n.inst);
  return [...seen.values()];
}

/** A chord tone for the arpeggio (under the melody, around octave 3; `3` is the root's octave). */
function arpNote(chord: number[], i: number): number {
  return i >= chord.length ? chord[0] + 12 : chord[i];
}

/** A bass note around octave 3: the root, its octave, or (`5`) the chord's second tone above it, which stays on the scale. */
function bassNote(chord: number[], ch: string): number {
  const root = 48 + ((((chord[0] - 48) % 12) + 12) % 12);
  const up = (((chord[1] - chord[0]) % 12) + 12) % 12;
  return ch === '5' ? root + up : ch === 'O' ? root + 12 : root;
}

type Drum = 'taiko' | 'odaiko' | 'shime' | 'kane' | 'clack';

/**
 * Drum hits rendered once into buffers (with the same voices, in an OfflineAudioContext), so a
 * hit costs one buffer playback instead of five to ten live nodes: the battle's last stand books
 * about 25 drum hits a second. Until the buffers are ready, or where offline rendering is
 * missing, hits are played live.
 */
class DrumSamples {
  private readonly buffers = new Map<Drum, AudioBuffer>();
  readonly ready: Promise<void>;

  constructor(private readonly kit: Kit) {
    this.ready = this.render().catch(() => undefined);
  }

  private async render(): Promise<void> {
    const Offline = (globalThis as { OfflineAudioContext?: typeof OfflineAudioContext }).OfflineAudioContext;
    if (!Offline) return;
    const sr = this.kit.ctx.sampleRate;
    const drums: [Drum, number, (k: Kit, t: number, out: AudioNode) => void][] = [
      ['taiko', 0.5, (k, t, out) => k.taiko(t, 1, out)],
      ['odaiko', 1.2, (k, t, out) => k.taiko(t, 1, out, 2)],
      ['shime', 0.15, (k, t, out) => k.shime(t, 1, out)],
      ['kane', 0.4, (k, t, out) => k.kane(t, 1, out)],
      ['clack', 0.08, (k, t, out) => k.clack(t, 1, out, 0.85)],
    ];
    const total = drums.reduce((n, [, len]) => n + len + 0.05, 0);
    // One offline render for all five, laid end to end, then cut apart.
    const off = new Offline(1, Math.ceil(total * sr), sr);
    const k = new Kit(off);
    let at = 0;
    const spans: [Drum, number, number][] = [];
    for (const [name, len, play] of drums) {
      play(k, at, off.destination);
      spans.push([name, at, len]);
      at += len + 0.05;
    }
    const all = await off.startRendering();
    const src = all.getChannelData(0);
    for (const [name, start, len] of spans) {
      const n = Math.ceil(len * sr);
      const buf = this.kit.ctx.createBuffer(1, n, sr);
      buf.getChannelData(0).set(src.subarray(Math.floor(start * sr), Math.floor(start * sr) + n));
      this.buffers.set(name, buf);
    }
  }

  hit(name: Drum, start: number, vol: number, out: AudioNode): void {
    const buf = this.buffers.get(name);
    if (!buf) {
      if (name === 'taiko') this.kit.taiko(start, vol, out);
      else if (name === 'odaiko') this.kit.taiko(start, vol, out, 2);
      else if (name === 'shime') this.kit.shime(start, vol, out);
      else if (name === 'kane') this.kit.kane(start, vol, out);
      else this.kit.clack(start, vol, out, 0.85);
      return;
    }
    const ctx = this.kit.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(g).connect(out);
    src.start(start);
  }
}

/** One track playing through its own bus (faded out when the next one starts). */
class Playback {
  readonly bus: GainNode;
  private readonly send: GainNode;
  private readonly channels = new Map<Channel, AudioNode>();

  constructor(private readonly kit: Kit, out: AudioNode, reverbIn: AudioNode | null, space: number) {
    const ctx = kit.ctx;
    this.bus = ctx.createGain();
    this.bus.connect(out);
    this.send = ctx.createGain();
    this.send.gain.value = space;
    if (reverbIn) this.send.connect(reverbIn);
  }

  /** The input for an instrument: its level, then its place in the stereo field and its reverb send. */
  channel(c: Channel): AudioNode {
    const hit = this.channels.get(c);
    if (hit) return hit;
    const ctx = this.kit.ctx;
    const [level, pan, wet] = MIX[c];
    const g = ctx.createGain();
    g.gain.value = level;
    let tail: AudioNode = g;
    // StereoPanner is missing on Safari before 14.1: the instrument is then simply centred.
    if (typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      tail = g.connect(p);
    }
    tail.connect(this.bus);
    const s = ctx.createGain();
    s.gain.value = wet;
    tail.connect(s).connect(this.send);
    this.channels.set(c, g);
    return g;
  }

  fadeOut(at: number, seconds = 0.6): void {
    this.bus.gain.setValueAtTime(this.bus.gain.value, at);
    this.bus.gain.linearRampToValueAtTime(0.0001, at + seconds);
    this.send.gain.setValueAtTime(this.send.gain.value, at);
    this.send.gain.linearRampToValueAtTime(0.0001, at + seconds);
    const bus = this.bus;
    const send = this.send;
    globalThis.setTimeout(() => {
      bus.disconnect();
      send.disconnect();
    }, (seconds + 3) * 1000);
  }
}

export class MusicPlayer {
  private readonly input: AudioNode;
  private readonly reverbIn: AudioNode | null;
  private playback: Playback | null = null;
  private name: TrackName | null = null;
  private track: Track | null = null;
  private sections: ReadySection[] = [];
  private form = 0;
  private bar = 0;
  private step = 0;
  private nextStep = 0;
  private level = 0;
  private target = 0;
  /** The coda has played; `play` of the same track starts it again. */
  private ended = false;
  private seed = 7;
  private readonly drums: DrumSamples;

  constructor(private readonly kit: Kit, out: AudioNode) {
    const ctx = kit.ctx;
    this.drums = new DrumSamples(kit);
    // A gentle compressor keeps taiko peaks under the melody without pumping.
    if (typeof ctx.createDynamicsCompressor === 'function') {
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.knee.value = 10;
      comp.ratio.value = 3;
      comp.attack.value = 0.008;
      comp.release.value = 0.25;
      comp.connect(out);
      this.input = comp;
    } else this.input = out;
    this.reverbIn = typeof ctx.createConvolver === 'function' ? this.makeReverb() : null;
  }

  /**
   * A wooden hall: decaying stereo noise, darkened, with a short pre-delay. Built once. Fed in mono
   * (the dry sound carries the stereo placing) and 1.3 s long: measured offline in Chromium, the
   * convolver is the largest steady cost of the music, and this halves it against a stereo-fed 1.7 s
   * hall while keeping a wide tail.
   */
  private makeReverb(): AudioNode {
    const ctx = this.kit.ctx;
    const sr = ctx.sampleRate;
    const n = Math.floor(sr * 1.3);
    const pre = Math.floor(sr * 0.014);
    const ir = ctx.createBuffer(2, n, sr);
    let seed = 99991;
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = pre; i < n; i++) {
        seed = (seed * 16807) % 2147483647;
        const r = (seed / 2147483647) * 2 - 1;
        const k = (i - pre) / (n - pre);
        // Highs die first: the low-pass closes as the tail decays.
        const damp = 0.25 + 0.6 * k;
        lp = lp * damp + r * (1 - damp);
        d[i] = lp * Math.pow(1 - k, 2.2) * 0.9;
      }
    }
    const conv = ctx.createConvolver();
    conv.channelCount = 1;
    conv.channelCountMode = 'explicit';
    conv.buffer = ir;
    const ret = ctx.createGain();
    ret.gain.value = 0.6;
    conv.connect(ret).connect(this.input);
    return conv;
  }

  /** Resolves once the drum buffers are rendered (offline renders wait for it). */
  get ready(): Promise<void> {
    return this.drums.ready;
  }

  get playing(): TrackName | null {
    return this.ended ? null : this.name;
  }

  /** Switch tracks (null: silence). The old track fades out under the new one. */
  play(name: TrackName | null, at = this.kit.ctx.currentTime): void {
    if (name === this.name && !this.ended) return;
    this.playback?.fadeOut(at);
    this.playback = null;
    this.name = name;
    this.ended = false;
    this.track = name ? TRACKS[name] : null;
    if (!name || !this.track) return;
    this.sections = prepare(name);
    this.playback = new Playback(this.kit, this.input, this.reverbIn, this.track.space);
    this.playback.bus.gain.value = this.track.gain;
    this.form = 0;
    this.bar = 0;
    this.step = 0;
    this.level = this.target = 0;
    this.nextStep = at + 0.12;
  }

  /** 0 scouting, 1 fighting, 2 after the first star, 3 the last stand. Takes effect on the next bar. */
  setIntensity(level: number): void {
    this.target = Math.max(0, Math.min(3, Math.round(level)));
  }

  get intensity(): number {
    return this.level;
  }

  /** The clock stood still (the page was hidden): carry on from now instead of catching up. */
  resync(now: number): void {
    this.nextStep = Math.max(this.nextStep, now + 0.1);
  }

  /** Book every note that starts before `until` (audio-clock seconds). */
  pump(until: number): void {
    const track = this.track;
    if (!track || this.ended || !this.playback) return;
    const dt = 60 / track.bpm / 4;
    while (this.nextStep < until) {
      this.playStep(track, this.nextStep, dt);
      this.nextStep += dt;
      if (++this.step === STEPS_PER_BAR) {
        this.step = 0;
        if (++this.bar >= this.sections[this.form].bars) {
          this.bar = 0;
          this.form = (this.form + 1) % this.sections.length;
        }
      }
    }
  }

  /**
   * End a battle track with a short coda after the result sting (which plays as a sound effect).
   * Returns false (and does nothing) when no battle track is playing.
   */
  coda(kind: 'victory' | 'defeat', at = this.kit.ctx.currentTime): boolean {
    const track = this.track;
    if (!track || this.ended || this.name === 'village') return false;
    this.playback?.fadeOut(at, 0.5);
    this.ended = true;
    const pb = new Playback(this.kit, this.input, this.reverbIn, 0.6);
    this.playback = pb;
    const t0 = at + (kind === 'victory' ? 1.05 : 1.2);
    const tr = track.transpose;
    const rate = Math.pow(2, tr / 12);
    for (const n of CODAS[kind]) {
      const t = t0 + n.at;
      const vol = n.vol ?? 1;
      for (const m of n.notes) {
        if (n.inst === 'koto' || n.inst === 'shamisen') this.kit.pluck(NOTE(m), t, 0.6 * vol, pb.channel(n.inst), n.inst, rate);
        else if (n.inst === 'flute') this.kit.flute(NOTE(m + tr), t, n.dur ?? 1, 0.5 * vol, pb.channel('flute'), n.fall);
        else if (n.inst === 'bell') this.kit.bell(NOTE(m + tr), t, 0.5 * vol, pb.channel('bell'), 4);
        else if (n.inst === 'odaiko') this.drums.hit('odaiko', t, 0.8 * vol, pb.channel('odaiko'));
      }
      if (n.inst === 'pad') this.kit.pad(n.notes.map((m) => m + tr), t, n.dur ?? 3, 1, pb.channel('pad'), track.padWave, track.padCutoff);
    }
    return true;
  }

  private rand(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  private playStep(track: Track, t: number, dt: number): void {
    const sec = this.sections[this.form];
    const chord = sec.chords[this.bar];
    const pb = this.playback!;
    const tr = track.transpose;
    const rate = Math.pow(2, tr / 12);
    if (this.step === 0) {
      // Intensity moves on the bar line; rising, the great drum and a gong mark it.
      if (this.target !== this.level) {
        if (this.target > this.level && track !== TRACKS.village) {
          this.drums.hit('odaiko', t, 0.9, pb.channel('odaiko'));
          this.drums.hit('kane', t, 0.6, pb.channel('kane'));
        }
        this.level = this.target;
      }
      const run = sec.padRun[this.bar];
      if (run && sec.pad !== undefined && this.level >= sec.pad) {
        const notes = track.padWave === 'sawtooth' ? [chord[0] - 12, ...chord] : chord;
        this.kit.pad(notes.map((n) => n + tr), t, run * STEPS_PER_BAR * dt + 0.8, 1, pb.channel('pad'), track.padWave, track.padCutoff);
      }
    }
    for (const p of sec.parts) {
      if (this.level < (p.min ?? 0) || this.level > (p.max ?? 9)) continue;
      const vol = p.vol ?? 1;
      // A player's hands, not a machine: a few milliseconds early or late, a little softer or harder.
      const at = Math.max(t + (this.rand() - 0.5) * 0.012, this.kit.ctx.currentTime);
      const human = 0.88 + 0.12 * this.rand();
      if (p.notes) {
        for (const e of p.notes[this.bar]) {
          if (e.step !== this.step) continue;
          const m = e.midi + (p.shift ?? 0);
          if (p.inst === 'flute') this.kit.flute(NOTE(m + tr), at, e.len * dt * 0.96, 0.5 * vol * human, pb.channel('flute'), e.fall);
          else this.kit.pluck(NOTE(m), at, 0.6 * vol * human, pb.channel(p.inst), p.inst as StringVoice, rate, e.bend ? 1 : e.fall ? -1 : 0);
        }
        continue;
      }
      const ch = p.line[(this.bar * STEPS_PER_BAR + this.step) % p.line.length];
      if (ch === '.') continue;
      const v = (HIT[ch] ?? 1) * vol * human;
      switch (p.inst) {
        case 'arp':
          this.kit.pluck(NOTE(arpNote(chord, Number(ch))), at, 0.5 * vol * human, pb.channel('arp'), 'koto', rate);
          break;
        case 'bass': {
          const m = bassNote(chord, ch);
          const accent = ch === 'R' ? 1 : 0.7;
          if (this.level === 0) this.kit.pluck(NOTE(m), at, 0.6 * vol * accent, pb.channel('bass'), 'koto', rate);
          else {
            this.kit.pluck(NOTE(m), at, 0.55 * vol * accent, pb.channel('bass'), 'shamisen', rate);
            this.kit.sub(NOTE(m - 12 + tr), at, dt * 1.8, 0.45 * vol * accent, pb.channel('bass'));
          }
          break;
        }
        case 'bell':
          this.kit.bell(NOTE(arpNote(chord, Number(ch)) + 24 + tr), at, 0.5 * vol, pb.channel('bell'));
          break;
        case 'taiko':
          this.drums.hit('taiko', at, 0.6 * v, pb.channel('taiko'));
          break;
        case 'odaiko':
          this.drums.hit('odaiko', at, 0.8 * v, pb.channel('odaiko'));
          break;
        case 'shime':
          this.drums.hit('shime', at, 0.5 * v, pb.channel('shime'));
          break;
        case 'clack':
          this.drums.hit('clack', at, 0.25 * v, pb.channel('clack'));
          break;
        case 'kane':
          this.drums.hit('kane', at, 0.5 * v, pb.channel('kane'));
          break;
      }
    }
  }
}
