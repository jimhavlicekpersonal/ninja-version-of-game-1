/**
 * The music, written down: original tracks as note data the engine in `./music.ts` plays.
 * Pure data and a small parser, with no audio here, so the tests read it without a sound card.
 *
 * Everything is on the Japanese in scale (miyako-bushi) on E: E F A B C, rising through D (in-sen).
 * Harmony is open fifths and drones, as in gagaku and min'yo, not Western chord changes.
 *
 * Time is counted in sixteenth-note steps, 16 to a bar (4/4).
 * - Melody lines are written in eighth notes: `E5` is an eighth, `E5*3` three eighths, `.` an
 *   eighth's rest, `.*4` a half-bar rest, `|` separates bars. Suffix `^` presses the string up into
 *   the note, `~` lets the note fall at the end (shakuhachi) or after the attack (koto).
 * - Rhythm patterns are one character per sixteenth and repeat over the section: `X` accent, `x`
 *   normal, `o` ghost, `.` silent. Bass patterns use `R`/`r` root, `5` fifth, `O` octave; arpeggio
 *   and bell patterns use chord-tone indices `0`–`3`.
 * - A part plays only while the battle intensity is between its `min` and `max` (0 scouting,
 *   1 fighting, 2 after the first star, 3 the last 30 seconds or two stars). The village plays at 0.
 */

export const STEPS_PER_BAR = 16;

export type Inst =
  | 'koto' | 'shamisen' | 'flute'
  | 'arp' | 'bass' | 'bell'
  | 'taiko' | 'odaiko' | 'shime' | 'clack' | 'kane';

export interface Part {
  inst: Inst;
  /** Melody (koto, shamisen, flute) or a rhythm pattern (everything else). */
  line: string;
  min?: number;
  max?: number;
  /** Semitones added to every note. */
  shift?: number;
  vol?: number;
}

export interface Section {
  bars: number;
  /** One chord per bar (repeated if shorter). */
  chords: string[];
  /** The pad plays from this intensity up (omit for none). */
  pad?: number;
  parts: Part[];
}

export interface Track {
  bpm: number;
  /** Semitones the whole track sounds above its written notes. */
  transpose: number;
  form: string[];
  sections: Record<string, Section>;
  /** Mix: the track's level, its reverb amount and its pad's sound. */
  gain: number;
  space: number;
  padWave: OscillatorType;
  padCutoff: number;
}

/** Chord voicings (MIDI, around octave 3): open fifths and a few colours, all on the scale. */
export const CHORDS: Record<string, number[]> = {
  E: [52, 59, 64],
  F: [53, 60, 65],
  Fmaj7: [53, 60, 64],
  A: [45, 52, 57],
  Am: [57, 60, 64],
  D: [50, 57, 62],
  C: [48, 52, 59],
};

const NAMES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function midiOf(name: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`bad note ${name}`);
  return 12 * (Number(m[3]) + 1) + NAMES[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

export interface NoteEvent {
  /** Step within the bar. */
  step: number;
  /** Length in steps. */
  len: number;
  midi: number;
  bend: boolean;
  fall: boolean;
}

/** Parse a melody into bars of note events. Throws if a bar does not fill exactly. */
export function parseLine(line: string): NoteEvent[][] {
  return line.split('|').map((bar, b) => {
    const out: NoteEvent[] = [];
    let pos = 0;
    for (const tok of bar.trim().split(/\s+/).filter(Boolean)) {
      // The articulation may stand before or after the length: `E5~*6` or `E5*6~`.
      const m = /^([^*^~]+)([\^~]?)(?:\*(\d+))?([\^~]?)$/.exec(tok);
      if (!m) throw new Error(`bad token ${tok}`);
      const len = 2 * (m[3] ? Number(m[3]) : 1);
      const name = m[1];
      const mark = m[2] || m[4];
      const bend = mark === '^';
      const fall = mark === '~';
      if (name !== '.') out.push({ step: pos, len, midi: midiOf(name), bend, fall });
      pos += len;
    }
    if (pos !== STEPS_PER_BAR) throw new Error(`bar ${b + 1} of "${line}" has ${pos / 2} eighths, not 8`);
    return out;
  });
}

const fillBar = (bars: number, fill: string) => '.'.repeat(STEPS_PER_BAR * (bars - 1)) + fill;

// --- The Hidden Village (home): calm, spacious, koto with a shakuhachi answering. ---------------
const VILLAGE_A = 'E5*2 F5 E5 B4*3 . | A4 B4 C5*2 B4 A4 F4*2 | E4 F4 A4 B4 C5*2 B4^ A4 | B4*4 .*4';
const VILLAGE_A2 = 'E5*2 F5 A5 B5*3 A5 | C6 B5 A5*2 F5 E5 F5*2 | D5 E5 F5*2 E5 D5 B4*2 | E5*6 .*2';
const VILLAGE_B_FLUTE = 'A5*4 B5*2 C6*2 | B5*3 A5 F5*4 | E5*2 F5*2 E5 C5 B4*2 | E5*8~ | .*2 E5 F5 A5*4 | B5*2 D6*2 C6 B5 A5*2 | F5*3 E5 C5*2 B4*2 | E5*6~ .*2';
const VILLAGE_C = 'B5*2 .*2 E6*2 .*2 | C6*2 .*2 A5*4 | B5*2 .*2 F5 E5*3~ | .*8';

const VILLAGE: Track = {
  bpm: 72,
  transpose: 0,
  gain: 0.75,
  space: 0.55,
  padWave: 'triangle',
  padCutoff: 1100,
  form: ['intro', 'a', 'a2', 'b', 'a3', 'c', 'a2'],
  sections: {
    intro: {
      bars: 2,
      chords: ['E'],
      pad: 0,
      parts: [
        { inst: 'flute', line: '.*4 B4*4 | E5*6~ .*2' },
        { inst: 'bell', line: '3' + '.'.repeat(31) },
      ],
    },
    a: {
      bars: 4,
      chords: ['E', 'F', 'A', 'E'],
      pad: 0,
      parts: [
        { inst: 'koto', line: VILLAGE_A },
        { inst: 'arp', line: '0...2...1...2...' },
        { inst: 'odaiko', line: 'x' + '.'.repeat(31), vol: 0.6 },
      ],
    },
    a2: {
      bars: 4,
      chords: ['E', 'F', 'D', 'E'],
      pad: 0,
      parts: [
        { inst: 'koto', line: VILLAGE_A2 },
        { inst: 'arp', line: '0...2...1...3...' },
        { inst: 'odaiko', line: 'x' + '.'.repeat(31), vol: 0.6 },
        { inst: 'bell', line: '.'.repeat(48) + '2' + '.'.repeat(15) },
      ],
    },
    b: {
      bars: 8,
      chords: ['A', 'F', 'C', 'E', 'A', 'D', 'F', 'E'],
      pad: 0,
      parts: [
        { inst: 'flute', line: VILLAGE_B_FLUTE },
        { inst: 'arp', line: '0.1.2.1.3.2.1.2.', vol: 0.8 },
        { inst: 'taiko', line: 'x.......o.......', vol: 0.5 },
      ],
    },
    a3: {
      bars: 4,
      chords: ['E', 'F', 'A', 'E'],
      pad: 0,
      parts: [
        { inst: 'koto', line: VILLAGE_A, shift: 12, vol: 0.8 },
        { inst: 'flute', line: 'B4*8 | C5*8 | E5*4 F5*4 | E5*6~ .*2', vol: 0.55 },
        { inst: 'arp', line: '0...2...1...2...' },
        { inst: 'odaiko', line: 'x..o............', vol: 0.6 },
      ],
    },
    c: {
      bars: 4,
      chords: ['E', 'Fmaj7', 'E', 'E'],
      pad: 0,
      parts: [
        { inst: 'koto', line: VILLAGE_C, vol: 0.8 },
        { inst: 'bell', line: '0.......' + '.'.repeat(24) + '..........2.....' + '.'.repeat(16) },
      ],
    },
  },
};

// --- Smoke and Steel (battle): taiko-driven, layered by intensity. --------------------------------
const BATTLE_A = 'E5 E5 F5 E5 B4*2 A4 B4 | C5*2 B4 A4 F4*2 A4 B4 | E5 F5 A5 F5 E5*2 B4*2 | D5*2 E5 D5 B4 A4 B4*2';
const BATTLE_A_FLUTE = 'B5*4 C6*4 | A5*8 | B5*4 A5*4 | F5*4 E5*4~';
const BATTLE_B = 'A5*2 B5 C6 B5*2 A5 F5 | E5*2 F5 A5 B5*3 . | C6 B5 A5 F5 E5 F5 A5 B5 | E6*4 .*2 B5 E6';
const BATTLE_B_FLUTE = 'E6*8 | C6*8 | E6*4 F6*4 | E6*8~';
const BATTLE_D = 'D5*2 E5 F5 A5*2 F5 E5 | F5 E5 C5 B4 C5*2 A4*2 | A4 B4 C5 E5 F5*2 E5 C5 | B4*6~ .*2';

/** What every battle section shares: the scouting layer and the drum kit by intensity. */
function battleKit(bars: number, taiko = 'X...x...X..xx...'): Part[] {
  return [
    // Scouting (0): a heartbeat, a low koto ostinato and a dry wood knock.
    { inst: 'odaiko', line: 'X.......x.......', max: 0, vol: 0.8 },
    { inst: 'bass', line: 'R.......5.......', max: 0, vol: 0.7 },
    { inst: 'clack', line: '............o...', max: 0 },
    // Fighting (1+).
    { inst: 'odaiko', line: 'X...............', min: 1 },
    { inst: 'taiko', line: taiko, min: 1 },
    { inst: 'bass', line: 'R.rR..5.R.rR..O.', min: 1 },
    { inst: 'clack', line: '..............x.', min: 1, max: 1 },
    // First star (2+).
    { inst: 'shime', line: 'x.o.x.o.x.o.x.oo', min: 2, max: 2 },
    // Last stand (3).
    { inst: 'shime', line: 'x.xox.xox.xox.xx', min: 3 },
    { inst: 'kane', line: 'x...x...x...x...', min: 3, vol: 0.7 },
    { inst: 'taiko', line: fillBar(bars, 'x.x.xxxxX.X.XXXX'), min: 3, vol: 0.8 },
  ];
}

const BATTLE: Track = {
  bpm: 132,
  transpose: 0,
  gain: 0.8,
  space: 0.25,
  padWave: 'sawtooth',
  padCutoff: 700,
  form: ['a', 'b', 'a2', 'c', 'd', 'b'],
  sections: {
    a: {
      bars: 4,
      chords: ['E', 'F', 'E', 'D'],
      pad: 0,
      parts: [...battleKit(4), { inst: 'koto', line: BATTLE_A, min: 1 }, { inst: 'flute', line: BATTLE_A_FLUTE, min: 2, vol: 0.7 }],
    },
    b: {
      bars: 4,
      chords: ['A', 'F', 'C', 'E'],
      pad: 0,
      parts: [
        ...battleKit(4),
        { inst: 'koto', line: BATTLE_B, min: 1 },
        { inst: 'flute', line: BATTLE_B_FLUTE, min: 2, vol: 0.6 },
        { inst: 'shamisen', line: BATTLE_B, min: 3, shift: -12, vol: 0.5 },
      ],
    },
    a2: {
      bars: 4,
      chords: ['E', 'F', 'E', 'D'],
      pad: 0,
      parts: [
        ...battleKit(4),
        { inst: 'shamisen', line: BATTLE_A, min: 1 },
        { inst: 'koto', line: BATTLE_A, min: 3, shift: 12, vol: 0.5 },
        { inst: 'flute', line: 'E5*8 | F5*8 | E5*4 B5*4 | A5*6~ .*2', min: 2, vol: 0.7 },
      ],
    },
    c: {
      // The breakdown: a 3-3-2 taiko figure, the melody drops out, and the last bar always fills.
      bars: 4,
      chords: ['A', 'A', 'F', 'E'],
      pad: 0,
      parts: [
        ...battleKit(4, 'X..X..X.X..X..X.'),
        { inst: 'taiko', line: fillBar(4, '....x.x.xxxxXXXX'), min: 1, max: 2, vol: 0.7 },
        { inst: 'shamisen', line: 'E6 .*3 E6 .*3 | F6 .*3 E6 .*3 | C6 .*3 B5 .*3 | B5*2 .*2 E6 .*3', min: 1, vol: 0.7 },
        { inst: 'flute', line: 'A5*8 | B5*8 | C6*8 | B5*6~ .*2', min: 2, vol: 0.6 },
      ],
    },
    d: {
      bars: 4,
      chords: ['D', 'F', 'A', 'E'],
      pad: 0,
      parts: [...battleKit(4), { inst: 'koto', line: BATTLE_D, min: 1 }, { inst: 'flute', line: BATTLE_D, min: 2, shift: 12, vol: 0.45 }],
    },
  },
};

/** The Shadow Trials: the battle music a whole tone lower and faster, starting in the breakdown. */
const TRIAL: Track = {
  ...BATTLE,
  bpm: 140,
  transpose: -2,
  padCutoff: 560,
  form: ['c', 'a2', 'd', 'b', 'c', 'a'],
};

export const TRACKS = { village: VILLAGE, battle: BATTLE, trial: TRIAL } as const;
export type TrackName = keyof typeof TRACKS;

/** One-shot endings after a battle's result sting. Times in seconds from the coda's start. */
export interface CodaNote {
  at: number;
  inst: 'koto' | 'shamisen' | 'flute' | 'bell' | 'odaiko' | 'pad';
  notes: number[];
  dur?: number;
  vol?: number;
  fall?: boolean;
}

export const CODAS: Record<'victory' | 'defeat', CodaNote[]> = {
  victory: [
    { at: 0, inst: 'odaiko', notes: [0], vol: 0.9 },
    { at: 0, inst: 'pad', notes: CHORDS.E, dur: 5 },
    { at: 0.05, inst: 'flute', notes: [midiOf('B5')], dur: 0.6 },
    { at: 0.7, inst: 'flute', notes: [midiOf('E6')], dur: 2.6, fall: true },
    { at: 0.7, inst: 'koto', notes: [midiOf('E4'), midiOf('B4'), midiOf('E5')] },
    { at: 0.7, inst: 'bell', notes: [midiOf('E6')], vol: 0.6 },
    { at: 2.2, inst: 'bell', notes: [midiOf('B6')], vol: 0.4 },
  ],
  defeat: [
    { at: 0, inst: 'pad', notes: CHORDS.F, dur: 2.4 },
    { at: 0, inst: 'flute', notes: [midiOf('C5')], dur: 1.1 },
    { at: 1.1, inst: 'flute', notes: [midiOf('B4')], dur: 0.6 },
    { at: 1.7, inst: 'flute', notes: [midiOf('A4')], dur: 0.6 },
    { at: 2.2, inst: 'pad', notes: CHORDS.E, dur: 4 },
    { at: 2.3, inst: 'flute', notes: [midiOf('E4')], dur: 2.8, fall: true },
    { at: 2.3, inst: 'koto', notes: [midiOf('E3')], vol: 0.8 },
    { at: 3.4, inst: 'odaiko', notes: [0], vol: 0.5 },
  ],
};
