// Background music, written as data in a small tracker-style notation.
//
// A song has channels (lead, harmony, bass, drums...). Each channel is a list
// of bars, and each bar is a string of space-separated steps (16 per 4/4 bar):
//
//   D5   start a note (name + octave; sharps like C#5, flats like Bb4)
//   -    hold the previous note for another step
//   .    rest
//   k s h  drum hits on a 'noise' channel: kick, snare, hi-hat
//   a t b  forge sounds on a 'noise' channel: anvil strike, hammer tap, bellows
//
// Helpers below (arp, bass, repeat) build the repetitive parts so the
// melodies stay readable. compileSong() validates everything and turns a song
// into timed note events; it has no browser dependency, so tests can run it.

const NOTE_INDEX = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

export function noteToMidi(name) {
  const m = /^([A-G](?:#|b)?)(-?\d)$/.exec(name);
  if (!m || !(m[1] in NOTE_INDEX)) return null;
  return (Number(m[2]) + 1) * 12 + NOTE_INDEX[m[1]];
}
const midiToNote = midi => NAMES[midi % 12] + (Math.floor(midi / 12) - 1);
export const midiToFreq = midi => 440 * 2 ** ((midi - 69) / 12);

const CHORD_SHAPES = { '': [0, 4, 7], m: [0, 3, 7], sus: [0, 5, 7] };

/** Chord tones from a name like 'Dm', 'Bb', 'A', 'Gsus' at a given octave. */
export function chord(name, octave = 4) {
  const m = /^([A-G](?:#|b)?)(m|sus)?$/.exec(name);
  if (!m) throw new Error(`Unknown chord ${name}`);
  const root = noteToMidi(m[1] + octave);
  return CHORD_SHAPES[m[2] ?? ''].map(i => midiToNote(root + i));
}

/**
 * An arpeggio filling one bar. `order` indexes into the chord tones (an index
 * of 3 means the root an octave up); `every` spaces the notes out, holding each.
 */
export function arp(name, { octave = 4, order = [0, 1, 2, 1], every = 1, steps = 16 } = {}) {
  const tones = chord(name, octave);
  const up = midiToNote(noteToMidi(tones[0]) + 12);
  const pool = [...tones, up];
  const out = [];
  for (let i = 0; out.length < steps; i++) {
    out.push(pool[order[i % order.length]]);
    for (let h = 1; h < every && out.length < steps; h++) out.push('-');
  }
  return out.join(' ');
}

/** Bass for one bar from a chord root. Styles: pump (octave eighths), whole, halves (root then fifth). */
export function bass(name, style = 'pump', octave = 2) {
  const root = noteToMidi(/^([A-G](?:#|b)?)/.exec(name)[1] + octave);
  const r = midiToNote(root), o = midiToNote(root + 12), f = midiToNote(root + 7);
  if (style === 'pump') return `${r} - ${o} - ${r} - ${o} - ${r} - ${o} - ${r} - ${o} -`;
  if (style === 'whole') return `${r} ${'- '.repeat(15).trim()}`;
  if (style === 'halves') return `${r} - - - - - - - ${f} - - - - - - -`;
  throw new Error(`Unknown bass style ${style}`);
}

export const repeat = (bar, n) => Array(n).fill(bar);
const REST = '. . . . . . . . . . . . . . . .';

// ---------------------------------------------------------------- songs

const MENU_CHORDS = ['Cm', 'Ab', 'Bb', 'Cm', 'Cm', 'Ab', 'Bb', 'G', 'Fm', 'Cm', 'Ab', 'G', 'Cm', 'Ab', 'G', 'Cm'];
const BATTLE_CHORDS = ['Am', 'F', 'G', 'Em', 'Am', 'Dm', 'Em', 'Am', 'F', 'C', 'G', 'Em', 'F', 'Dm', 'Em', 'Am'];
const LIBRARY_CHORDS = ['C', 'Am', 'F', 'G', 'C', 'Em', 'F', 'G', 'F', 'G', 'Em', 'Am', 'Dm', 'G', 'C', 'C'];
const QUEST_CHORDS = ['G', 'D', 'Em', 'C', 'G', 'D', 'C', 'D', 'Em', 'C', 'G', 'D', 'C', 'D', 'G', 'G'];
// The Riftkin: E minor with its dark neighbours, F (the flat second) and B major (the harmonic-minor dominant).
const RIFTKIN_CHORDS = ['Em', 'F', 'Em', 'Em', 'Am', 'F', 'B', 'Em', 'C', 'F', 'Em', 'Em', 'Am', 'F', 'B', 'Em'];
// Grun: C minor, leaning on Db (the flat second) and G major for a darker, grander pull home.
const GRUN_CHORDS = ['Cm', 'Db', 'Cm', 'Bb', 'Ab', 'Fm', 'G', 'G', 'Cm', 'Ab', 'Bb', 'Gm', 'Ab', 'Db', 'G', 'Cm'];
// Battle boards (each board in backgrounds.js names its track).
const HIGHKEEP_CHORDS = ['Dm', 'G', 'Dm', 'C', 'Dm', 'G', 'Am', 'Am', 'F', 'C', 'G', 'Dm', 'F', 'G', 'C', 'Dm'];
const FROZEN_CHORDS = ['Em', 'Csus', 'G', 'Dsus', 'Em', 'C', 'Am', 'B', 'Em', 'Csus', 'G', 'D', 'Am', 'C', 'B', 'Em'];
const MOONWOOD_CHORDS = ['F#m', 'E', 'F#m', 'C#m', 'F#m', 'E', 'D', 'E', 'F#m', 'A', 'E', 'C#m', 'D', 'E', 'C#m', 'F#m'];
const SANCTUM_CHORDS = ['Bm', 'Gm', 'Bm', 'F', 'Bm', 'Gm', 'Em', 'F#', 'Bm', 'D', 'Gm', 'F', 'Em', 'Gm', 'F#', 'Bm'];
const FORGE_CHORDS = ['Dm', 'Dm', 'Bb', 'C', 'Dm', 'Dm', 'Gm', 'A', 'Dm', 'F', 'C', 'Gm', 'Bb', 'C', 'A', 'Dm'];
const CRYPT_CHORDS = ['Bm', 'G', 'A', 'Em', 'F#m', 'Gm', 'A', 'F#m', 'Bm', 'G', 'A', 'Em', 'F#m', 'Gm', 'A', 'F#m'];

export const SONGS = {
  // Main menu: a marching battle theme in C minor. Heavier and a touch slower than
  // it once was, so it sits with the calmer music of the rest of the game: the
  // middle climbs through Fm, Cm, Ab and G rather than breaking into a bright major.
  menu: {
    title: 'Banners of the Rift',
    bpm: 124,
    volume: 0.9,
    channels: {
      lead: {
        wave: 'pulse25', volume: 0.17, filter: 2800, env: { a: 0.005, d: 0.1, s: 0.55, r: 0.05 }, vibrato: { rate: 6, depth: 4, delay: 0.12 },
        bars: [
          'C5 - - - G4 - C5 - Eb5 - - - D5 - C5 -',
          'Bb4 - - - Ab4 - - - G4 - Ab4 - Bb4 - - -',
          'D5 - - - C5 - Bb4 - F5 - - - D5 - Bb4 -',
          'C5 - - - - - - - G4 - C5 - Eb5 - G5 -',
          'C6 - - - Bb5 - G5 - Eb5 - - - F5 - G5 -',
          'Ab5 - - - G5 - F5 - Eb5 - - - C5 - Eb5 -',
          'F5 - - - Eb5 - D5 - Bb4 - - - D5 - F5 -',
          'G5 - - - - - F5 - Eb5 - D5 - B4 - - -',
          'Ab5 - - - - - C6 - Ab5 - - - F5 - - -',
          'G5 - - - - - Eb5 - C5 - - - Eb5 - G5 -',
          'F5 - - - - - Eb5 - C5 - - - Eb5 - Ab5 -',
          'G5 - - - - - B4 - D5 - - - F5 - G5 -',
          'G5 - - - Eb5 - G5 - C6 - - - Bb5 - G5 -',
          'Ab5 - - - G5 - F5 - Eb5 - F5 - G5 - - -',
          'D5 - - - B4 - D5 - G5 - - - F5 - D5 -',
          'C5 - - - - - - - - - - - . . . .',
        ],
      },
      harmony: {
        wave: 'pulse12', volume: 0.07, filter: 2400, env: { a: 0.002, d: 0.06, s: 0.3, r: 0.03 },
        bars: MENU_CHORDS.map(c => arp(c, { octave: 4, order: [0, 1, 2, 1] })),
      },
      bass: {
        wave: 'triangle', volume: 0.32, env: { a: 0.002, d: 0.05, s: 0.8, r: 0.02 },
        bars: MENU_CHORDS.map(c => bass(c, 'pump')),
      },
      drums: {
        wave: 'noise', volume: 0.16,
        bars: MENU_CHORDS.map((_, i) => (i % 8 === 7
          ? 'k . h . s . h . s s s . s s s s'
          : 'k . h . s . h . k . k . s . h h')),
      },
    },
  },

  // Battle: slow and spacious so it can loop for a whole game without wearing thin.
  battle: {
    title: 'Embers Between Turns',
    bpm: 72,
    volume: 0.7,
    channels: {
      pad: {
        wave: 'pulse50', volume: 0.05, filter: 900, env: { a: 0.08, d: 0.4, s: 0.5, r: 0.6 },
        bars: BATTLE_CHORDS.map(c => arp(c, { octave: 3, order: [0, 1, 2, 3, 2, 1], every: 2 })),
      },
      lead: {
        wave: 'pulse25', volume: 0.075, filter: 1800, env: { a: 0.06, d: 0.3, s: 0.6, r: 0.8 }, vibrato: { rate: 4.5, depth: 5, delay: 0.3 },
        bars: [
          REST, REST,
          'B4 - - - - - - - D5 - - - - - - -',
          'E5 - - - - - - - - - - - . . . .',
          REST, REST,
          'G4 - - - - - - - B4 - - - A4 - - -',
          'A4 - - - - - - - - - - - . . . .',
          REST, REST,
          'D5 - - - C5 - - - B4 - - - - - - -',
          'G4 - - - - - - - - - - - . . . .',
          REST, REST,
          'E5 - - - D5 - - - B4 - - - G4 - - -',
          'A4 - - - - - - - - - - - . . . .',
        ],
      },
      bass: {
        wave: 'triangle', volume: 0.26, env: { a: 0.05, d: 0.3, s: 0.7, r: 0.5 },
        bars: BATTLE_CHORDS.map(c => bass(c, 'whole')),
      },
      drums: {
        wave: 'noise', volume: 0.05,
        bars: BATTLE_CHORDS.map(() => 'k . . . . . . . k . . . . . . .'),
      },
    },
  },

  // Riftkin battles: the battle theme's slow, spacious shape, made menacing. The
  // lead leans on the flat second and the tritone, over a heartbeat kick.
  riftkin: {
    title: 'The Riftkin Wake',
    bpm: 76,
    volume: 0.72,
    channels: {
      pad: {
        wave: 'pulse50', volume: 0.05, filter: 800, env: { a: 0.1, d: 0.4, s: 0.55, r: 0.7 },
        bars: RIFTKIN_CHORDS.map(c => arp(c, { octave: 3, order: [0, 2, 1, 3, 1, 2], every: 2 })),
      },
      lead: {
        wave: 'pulse25', volume: 0.07, filter: 1500, env: { a: 0.08, d: 0.3, s: 0.65, r: 0.9 }, vibrato: { rate: 4, depth: 7, delay: 0.35 },
        bars: [
          REST, REST,
          'E4 - - - - - - - F4 - - - - - - -',
          'E4 - - - - - - - - - - - . . . .',
          REST, REST,
          'B4 - - - - - - - D#5 - - - C5 - - -',
          'B4 - - - - - - - - - - - . . . .',
          REST, REST,
          'G5 - - - F5 - - - E5 - - - - - - -',
          'B4 - - - - - - - - - - - . . . .',
          REST, REST,
          'D#5 - - - E5 - - - F5 - - - D#5 - - -',
          'E5 - - - - - - - - - - - . . . .',
        ],
      },
      bass: {
        wave: 'triangle', volume: 0.28, env: { a: 0.08, d: 0.3, s: 0.75, r: 0.6 },
        bars: RIFTKIN_CHORDS.map(c => bass(c, 'halves', 2)),
      },
      drums: {
        wave: 'noise', volume: 0.055,
        bars: RIFTKIN_CHORDS.map((_, i) => (i % 4 === 3 ? 'k . . k . . . . k . . . s . . .' : 'k . . k . . . . . . . . . . . .')),
      },
    },
  },

  // Grun's battle: the fate of the cosmos. Faster and fuller than the other
  // battles, with a driving bass and a soaring lead, but still under the menu.
  grun: {
    title: 'Wrath of the Endless Night',
    bpm: 104,
    volume: 0.82,
    channels: {
      pad: {
        wave: 'pulse50', volume: 0.05, filter: 1100, env: { a: 0.04, d: 0.3, s: 0.5, r: 0.4 },
        bars: GRUN_CHORDS.map(c => arp(c, { octave: 3, order: [0, 1, 2, 3, 2, 1], every: 2 })),
      },
      lead: {
        wave: 'pulse25', volume: 0.09, filter: 2200, env: { a: 0.02, d: 0.2, s: 0.65, r: 0.4 }, vibrato: { rate: 5, depth: 6, delay: 0.2 },
        bars: [
          'C5 - - - - - G4 - C5 - Eb5 - D5 - C5 -',
          'Db5 - - - - - - - F5 - - - Ab5 - - -',
          'G5 - - - - - F5 - Eb5 - - - D5 - C5 -',
          'D5 - - - - - - - Bb4 - - - - - - -',
          'C5 - - - Eb5 - - - Ab5 - - - G5 - F5 -',
          'F5 - - - - - Eb5 - C5 - - - Ab4 - - -',
          'B4 - - - D5 - - - G5 - - - F5 - D5 -',
          'B4 - - - - - - - - - - - . . . .',
          'G5 - - - - - - - C6 - - - Bb5 - G5 -',
          'Ab5 - - - - - - - G5 - F5 - Eb5 - - -',
          'F5 - - - - - D5 - Bb4 - D5 - F5 - Bb5 -',
          'G5 - - - - - - - D5 - - - - - - -',
          'Eb5 - - - F5 - - - Ab5 - - - C6 - - -',
          'Db6 - - - - - C6 - Ab5 - - - F5 - - -',
          'D5 - - - F5 - - - B5 - - - D6 - - -',
          'C6 - - - - - - - - - - - . . . .',
        ],
      },
      bass: {
        wave: 'triangle', volume: 0.3, env: { a: 0.004, d: 0.08, s: 0.75, r: 0.05 },
        bars: GRUN_CHORDS.map(c => bass(c, 'pump')),
      },
      drums: {
        wave: 'noise', volume: 0.1,
        bars: GRUN_CHORDS.map((_, i) => (i % 8 === 7
          ? 'k . h . s . h . s . s . s s s s'
          : 'k . h . s . h . k . k . s . h .')),
      },
    },
  },

  // ---- Stingers: short one-shots for the end of a battle (`loop: false`), then silence.

  // Victory: a quick, bright fanfare in A major, the battle theme's A minor turned to the light.
  victory: {
    title: 'Victory',
    bpm: 132,
    volume: 0.8,
    loop: false,
    channels: {
      lead: {
        wave: 'pulse25', volume: 0.16, env: { a: 0.005, d: 0.1, s: 0.6, r: 0.5 }, vibrato: { rate: 6, depth: 5, delay: 0.25 },
        bars: [
          'A4 . C#5 . E5 . A5 - - - E5 - A5 - - -',
          'B5 - - - G#5 - - - A5 - - - - - - -',
        ],
      },
      harmony: {
        wave: 'pulse12', volume: 0.07, env: { a: 0.005, d: 0.1, s: 0.5, r: 0.4 },
        bars: [
          'E4 . A4 . C#5 . E5 - - - C#5 - E5 - - -',
          'G#5 - - - E5 - - - E5 - - - - - - -',
        ],
      },
      bass: {
        wave: 'triangle', volume: 0.3, env: { a: 0.004, d: 0.1, s: 0.8, r: 0.3 },
        bars: [
          'A2 - - - - - - - A2 - - - E2 - - -',
          'E2 - - - E3 - - - A2 - - - - - - -',
        ],
      },
      drums: {
        wave: 'noise', volume: 0.12,
        bars: [
          'k . . . s . . . k . k . s s s s',
          'k . . . s . . . k . . . . . . .',
        ],
      },
    },
  },

  // Defeat: a slow, falling minor line that settles low and fades.
  defeat: {
    title: 'Defeat',
    bpm: 66,
    volume: 0.65,
    loop: false,
    channels: {
      lead: {
        wave: 'pulse25', volume: 0.09, filter: 1600, env: { a: 0.05, d: 0.3, s: 0.6, r: 1 }, vibrato: { rate: 4, depth: 6, delay: 0.3 },
        bars: ['E5 - - - C5 - - - B4 - - - A4 - - -'],
      },
      harmony: {
        wave: 'pulse50', volume: 0.04, filter: 900, env: { a: 0.08, d: 0.3, s: 0.6, r: 1 },
        bars: ['C5 - - - A4 - - - G#4 - - - E4 - - -'],
      },
      bass: {
        wave: 'triangle', volume: 0.26, env: { a: 0.05, d: 0.3, s: 0.7, r: 1 },
        bars: ['A2 - - - - - - - E2 - - - A1 - - -'],
      },
      drums: {
        wave: 'noise', volume: 0.06,
        bars: ['k . . . . . . . . . . . k . . .'],
      },
    },
  },

  // Beating Grun: the fate of the cosmos is won. His C minor breaks into a blazing
  // C major fanfare, with a full band, a sweeping high arpeggio, rolling drums and
  // the grand bVII - bVI - V - I cadence home.
  grunVictory: {
    title: 'Dawn After the Endless Night',
    bpm: 112,
    volume: 0.95,
    loop: false,
    channels: {
      lead: {
        wave: 'pulse25', volume: 0.18, env: { a: 0.005, d: 0.08, s: 0.7, r: 0.8 }, vibrato: { rate: 6, depth: 6, delay: 0.2 },
        bars: [
          'G4 G4 G4 . C5 - - . E5 - G5 - C6 - - -',
          'D6 - - - C6 - - - B5 - - - C6 - - -',
        ],
      },
      harmony: {
        wave: 'pulse50', volume: 0.07, filter: 2400, env: { a: 0.005, d: 0.1, s: 0.6, r: 0.8 },
        bars: [
          'E4 E4 E4 . G4 - - . C5 - E5 - G5 - - -',
          'F5 - - - Eb5 - - - D5 - - - E5 - - -',
        ],
      },
      sparkle: {
        wave: 'pulse12', volume: 0.05, env: { a: 0.002, d: 0.06, s: 0.4, r: 0.4 },
        bars: [
          arp('C', { octave: 5, order: [0, 1, 2, 3] }),
          'Bb5 D6 F6 D6 Ab5 C6 Eb6 C6 G5 B5 D6 B5 C6 E6 G6 E6',
        ],
      },
      bass: {
        wave: 'triangle', volume: 0.34, env: { a: 0.003, d: 0.08, s: 0.8, r: 0.6 },
        bars: [
          bass('C', 'pump'),
          'Bb2 - Bb3 - Ab2 - Ab3 - G2 - G3 - C3 - C2 -',
        ],
      },
      drums: {
        wave: 'noise', volume: 0.14,
        bars: [
          'k . s s k . s s k . s . k s s s',
          'k . s . k . s . k . s s s s s k',
        ],
      },
    },
  },

  // ---- Battle boards: each as slow and spacious as the battle theme, in the board's own colours.

  // Dusk over Highkeep: twilight on the castle walls. D Dorian, with a lute plucking
  // under a distant, noble horn and a soft march on the drum.
  highkeep: {
    title: 'Twilight on the Ramparts',
    bpm: 70,
    volume: 0.7,
    channels: {
      lute: {
        wave: 'pulse12', volume: 0.05, filter: 2200, env: { a: 0.002, d: 0.25, s: 0, r: 0.2 },
        bars: HIGHKEEP_CHORDS.map(c => arp(c, { octave: 4, order: [0, 1, 2, 3], every: 2 })),
      },
      horn: {
        wave: 'pulse50', volume: 0.06, filter: 1400, env: { a: 0.12, d: 0.4, s: 0.7, r: 0.8 }, vibrato: { rate: 4.5, depth: 4, delay: 0.35 },
        bars: [
          'A4 - - - - - - - D5 - - - - - - -',
          'B4 - - - - - - - - - - - . . . .',
          'A4 - - - G4 - - - F4 - - - E4 - - -',
          'E4 - - - - - - - - - - - . . . .',
          'A4 - - - - - - - D5 - - - E5 - - -',
          'D5 - - - - - - - B4 - - - - - - -',
          'C5 - - - - - - - E5 - - - - - - -',
          'A4 - - - - - - - - - - - . . . .',
          'F5 - - - - - - - E5 - - - C5 - - -',
          'E5 - - - - - - - G4 - - - - - - -',
          'D5 - - - - - - - B4 - - - G4 - - -',
          'A4 - - - - - - - - - - - . . . .',
          'A4 - - - C5 - - - F5 - - - - - - -',
          'G5 - - - - - - - D5 - - - B4 - - -',
          'C5 - - - - - - - E5 - - - G4 - - -',
          'D5 - - - - - - - - - - - . . . .',
        ],
      },
      bass: {
        wave: 'triangle', volume: 0.24, env: { a: 0.04, d: 0.3, s: 0.7, r: 0.4 },
        bars: HIGHKEEP_CHORDS.map(c => bass(c, 'halves')),
      },
      drums: {
        wave: 'noise', volume: 0.045,
        bars: HIGHKEEP_CHORDS.map((_, i) => (i % 4 === 3 ? 'k . . . . . . . k . . . s . s s' : 'k . . . . . . . k . . . . . . .')),
      },
    },
  },

  // The Frozen Pass: snow on the pines under the aurora. E minor, cold suspended
  // chords, high bells ringing out, and only the wind for a beat.
  frozenpass: {
    title: 'Snowfall on the Pass',
    bpm: 66,
    volume: 0.65,
    channels: {
      pad: {
        wave: 'pulse50', volume: 0.045, filter: 700, env: { a: 0.3, d: 0.6, s: 0.6, r: 1.2 },
        bars: FROZEN_CHORDS.map(c => arp(c, { octave: 3, order: [0, 1, 2, 1], every: 4 })),
      },
      bells: {
        wave: 'pulse12', volume: 0.045, filter: 3200, env: { a: 0.002, d: 0.6, s: 0, r: 1.2 },
        bars: FROZEN_CHORDS.map(c => arp(c, { octave: 5, order: [3, 2, 0, 1], every: 5 })),
      },
      lead: {
        wave: 'pulse25', volume: 0.055, filter: 1600, env: { a: 0.1, d: 0.4, s: 0.6, r: 1 }, vibrato: { rate: 4, depth: 5, delay: 0.4 },
        bars: [
          REST, REST,
          'B4 - - - - - - - - - - - D5 - - -',
          'A4 - - - - - - - - - - - . . . .',
          REST, REST,
          'C5 - - - - - - - E5 - - - - - - -',
          'D#5 - - - - - - - - - - - . . . .',
          REST, REST,
          'G5 - - - - - - - F#5 - - - D5 - - -',
          'E5 - - - - - - - - - - - . . . .',
          REST, REST,
          'F#5 - - - - - - - D#5 - - - - - - -',
          'E5 - - - - - - - - - - - . . . .',
        ],
      },
      bass: {
        wave: 'triangle', volume: 0.22, env: { a: 0.2, d: 0.4, s: 0.7, r: 0.8 },
        bars: FROZEN_CHORDS.map(c => bass(c, 'whole')),
      },
      wind: {
        wave: 'noise', volume: 0.03,
        bars: FROZEN_CHORDS.map(() => '. . . . h . . . . . . . h . . .'),
      },
    },
  },

  // Moonwood: a moonlit forest full of fireflies. F# minor pentatonic on a soft,
  // flute-like lead over a plucked harp, with a hand drum and crickets.
  moonwood: {
    title: 'Under the Moonwood',
    bpm: 76,
    volume: 0.7,
    channels: {
      harp: {
        wave: 'pulse12', volume: 0.045, filter: 2400, env: { a: 0.002, d: 0.3, s: 0, r: 0.3 },
        bars: MOONWOOD_CHORDS.map(c => arp(c, { octave: 4, order: [0, 2, 3, 2], every: 2 })),
      },
      flute: {
        wave: 'triangle', volume: 0.13, env: { a: 0.06, d: 0.3, s: 0.7, r: 0.5 }, vibrato: { rate: 5, depth: 6, delay: 0.25 },
        bars: [
          'C#5 - - - - - E5 - F#5 - - - - - - -',
          'E5 - - - - - - - B4 - - - - - - -',
          'C#5 - - - - - - - A4 - - - B4 - - -',
          'C#5 - - - - - - - - - - - . . . .',
          'F#5 - - - - - E5 - C#5 - - - - - - -',
          'B4 - - - - - - - E5 - - - - - - -',
          'F#5 - - - - - - - A5 - - - F#5 - - -',
          'E5 - - - - - - - - - - - . . . .',
          REST, REST,
          'B4 - - - - - - - E5 - - - B5 - - -',
          'E5 - - - - - - - C#5 - - - - - - -',
          'F#5 - - - A5 - - - - - - - F#5 - - -',
          'E5 - - - - - - - B4 - - - - - - -',
          'C#5 - - - - - - - E5 - - - - - - -',
          'F#5 - - - - - - - - - - - . . . .',
        ],
      },
      bass: {
        wave: 'triangle', volume: 0.24, env: { a: 0.05, d: 0.3, s: 0.7, r: 0.5 },
        bars: MOONWOOD_CHORDS.map(c => bass(c, 'halves')),
      },
      drums: {
        wave: 'noise', volume: 0.04,
        bars: MOONWOOD_CHORDS.map(() => 'k . . . . . k . . . h . . . h .'),
      },
    },
  },

  // The Riven Sanctum: ruins around a tear in the sky. B minor that keeps slipping
  // to G minor and F, slow swelling chords, a wavering lead, and glints of light.
  sanctum: {
    title: 'The Riven Sanctum',
    bpm: 62,
    volume: 0.65,
    channels: {
      swell: {
        wave: 'pulse50', volume: 0.045, filter: 900, env: { a: 0.9, d: 0.5, s: 0.8, r: 1.5 },
        bars: SANCTUM_CHORDS.map(c => arp(c, { octave: 3, order: [0, 2], every: 8 })),
      },
      glints: {
        wave: 'pulse12', volume: 0.03, filter: 3000, env: { a: 0.01, d: 0.4, s: 0, r: 0.8 },
        bars: SANCTUM_CHORDS.map(c => arp(c, { octave: 5, order: [3, 1, 2, 0], every: 3 })),
      },
      lead: {
        wave: 'pulse25', volume: 0.055, filter: 1500, env: { a: 0.15, d: 0.4, s: 0.65, r: 1 }, vibrato: { rate: 3.5, depth: 9, delay: 0.3 },
        bars: [
          REST, REST,
          'F#5 - - - - - - - D5 - - - - - - -',
          'C5 - - - - - - - - - - - . . . .',
          REST, REST,
          'G5 - - - - - - - F#5 - - - E5 - - -',
          'A#4 - - - - - - - - - - - . . . .',
          REST, REST,
          'D5 - - - - - - - Bb4 - - - G4 - - -',
          'A4 - - - - - - - - - - - . . . .',
          REST, REST,
          'C#5 - - - - - - - A#4 - - - - - - -',
          'B4 - - - - - - - - - - - . . . .',
        ],
      },
      bass: {
        wave: 'triangle', volume: 0.24, env: { a: 0.1, d: 0.3, s: 0.75, r: 0.8 },
        bars: SANCTUM_CHORDS.map(c => bass(c, 'whole')),
      },
      drums: {
        wave: 'noise', volume: 0.04,
        bars: SANCTUM_CHORDS.map((_, i) => (i % 2 ? REST : 'k . . . . . . . . . . . . . . .')),
      },
    },
  },

  // Card library: a warm, lute-like study piece in C major. No drums.
  library: {
    title: 'The Archivist\'s Lute',
    bpm: 84,
    volume: 0.75,
    channels: {
      lute: {
        wave: 'pulse12', volume: 0.06, filter: 2400, env: { a: 0.003, d: 0.25, s: 0, r: 0.2 },
        bars: LIBRARY_CHORDS.map(c => arp(c, { octave: 4, order: [0, 1, 2, 3] })),
      },
      lead: {
        wave: 'pulse50', volume: 0.06, filter: 1600, env: { a: 0.04, d: 0.4, s: 0.5, r: 0.7 }, vibrato: { rate: 5, depth: 4, delay: 0.25 },
        bars: [
          'E5 - - - - - - - G5 - - - - - - -',
          'A5 - - - - - - - G5 - - - E5 - - -',
          'F5 - - - - - - - A5 - - - - - - -',
          'G5 - - - - - - - - - - - D5 - - -',
          'E5 - - - - - G5 - C6 - - - - - - -',
          'B5 - - - - - - - G5 - - - E5 - - -',
          'A5 - - - - - - - C6 - - - A5 - - -',
          'G5 - - - - - - - - - - - . . . .',
          'C6 - - - - - - - A5 - - - - - - -',
          'B5 - - - - - - - D6 - - - - - - -',
          'G5 - - - - - - - E5 - - - - - - -',
          'A5 - - - - - - - C6 - - - B5 - A5 -',
          'F5 - - - - - - - A5 - - - - - - -',
          'G5 - - - - - - - B5 - - - D6 - - -',
          'C6 - - - - - - - - - - - G5 - - -',
          'E5 - - - - - - - - - - - . . . .',
        ],
      },
      bass: {
        wave: 'triangle', volume: 0.24, env: { a: 0.02, d: 0.3, s: 0.6, r: 0.3 },
        bars: LIBRARY_CHORDS.map(c => bass(c, 'halves')),
      },
    },
  },

  // Deck builder: the forge. A slow, low drone with an anvil ringing on every
  // bar (one bar is 3 seconds, the forge scene's hammer cycle), two lighter
  // taps as the hammer bounces, and the bellows breathing every other bar.
  forge: {
    title: 'Hammer and Hearth',
    bpm: 80,
    volume: 0.7,
    channels: {
      drone: {
        wave: 'triangle', volume: 0.26, env: { a: 0.3, d: 0.5, s: 0.8, r: 0.8 },
        bars: FORGE_CHORDS.map(c => bass(c, 'whole')),
      },
      pad: {
        wave: 'pulse50', volume: 0.045, filter: 700, env: { a: 0.4, d: 0.6, s: 0.6, r: 1 },
        bars: FORGE_CHORDS.map(c => arp(c, { octave: 3, order: [0, 2, 1, 2], every: 4 })),
      },
      lead: {
        wave: 'pulse25', volume: 0.06, filter: 1400, env: { a: 0.08, d: 0.4, s: 0.55, r: 0.9 }, vibrato: { rate: 4, depth: 5, delay: 0.35 },
        bars: [
          REST, REST, REST, REST,
          'A4 - - - - - - - G4 - - - F4 - - -',
          'E4 - - - - - - - D4 - - - - - - -',
          'D4 - - - F4 - - - G4 - - - Bb4 - - -',
          'A4 - - - - - - - - - - - . . . .',
          REST, REST, REST, REST,
          'F4 - - - - - - - G4 - - - A4 - - -',
          'C5 - - - - - - - A4 - - - G4 - - -',
          'E4 - - - - - - - C#5 - - - - - - -',
          'D5 - - - - - - - - - - - . . . .',
        ],
      },
      anvil: {
        wave: 'noise', volume: 0.07,
        bars: FORGE_CHORDS.map(() => 'a . . . . . t . . . t . . . . .'),
      },
      thud: {
        wave: 'noise', volume: 0.05,
        bars: FORGE_CHORDS.map(() => 'k . . . . . . . . . . . . . . .'),
      },
      bellows: {
        wave: 'noise', volume: 0.08,
        bars: FORGE_CHORDS.map((_, i) => (i % 2 ? REST : 'b . . . . . . . . . . . . . . .')),
      },
    },
  },

  // Quests: mellow but hopeful, the night before setting out. Brighter and
  // busier than the library, gentler than the menu's march.
  quests: {
    title: 'The Road Ahead',
    bpm: 100,
    volume: 0.8,
    channels: {
      lute: {
        wave: 'pulse12', volume: 0.055, filter: 2600, env: { a: 0.003, d: 0.2, s: 0.1, r: 0.15 },
        bars: QUEST_CHORDS.map(c => arp(c, { octave: 4, order: [0, 1, 2, 1, 3, 1, 2, 1], every: 2 })),
      },
      lead: {
        wave: 'pulse50', volume: 0.065, filter: 2000, env: { a: 0.03, d: 0.3, s: 0.6, r: 0.5 }, vibrato: { rate: 5, depth: 4, delay: 0.2 },
        bars: [
          'D5 - - - B4 - - - G4 - - - B4 - D5 -',
          'F#5 - - - - - - - E5 - - - D5 - - -',
          'E5 - - - G5 - - - B4 - - - - - - -',
          'C5 - - - E5 - - - G5 - - - - - . .',
          'G5 - - - F#5 - - - D5 - - - B4 - - -',
          'A4 - - - D5 - - - F#5 - - - A5 - - -',
          'G5 - - - E5 - - - C5 - - - E5 - - -',
          'D5 - - - - - - - - - - - . . . .',
          'B4 - - - E5 - - - G5 - - - B5 - - -',
          'A5 - - - G5 - - - E5 - - - C5 - - -',
          'D5 - - - G5 - - - B5 - - - D6 - - -',
          'A5 - - - - - - - F#5 - - - A5 - - -',
          'G5 - - - - - - - E5 - - - G5 - - -',
          'F#5 - - - - - - - A5 - - - - - - -',
          'G5 - - - - - - - - - - - - - - -',
          '. . . . D5 - - - B4 - - - A4 - - -',
        ],
      },
      bass: {
        wave: 'triangle', volume: 0.26, env: { a: 0.01, d: 0.2, s: 0.7, r: 0.2 },
        bars: QUEST_CHORDS.map(c => bass(c, 'halves')),
      },
      drums: {
        wave: 'noise', volume: 0.06,
        bars: QUEST_CHORDS.map((_, i) => (i % 4 === 3 ? 'k . . . h . . . k . k . h . h .' : 'k . . . h . . . k . . . h . . .')),
      },
    },
  },

  crypt: {
    title: 'Dirge of the Crypt',
    bpm: 80,
    volume: 0.7,
    channels: {
      lead: {
        wave: 'pulse25', volume: 0.045, filter: 2250, env: { a: 0.245, d: 0.3, s: 0.6, r: 0.8 }, vibrato: { rate: 4.5, depth: 13, delay: 0.3 },
        bars: [
          'B4 - - - - - - - . . . . . . F#4 -',
          'G4 - - - - - - - . . . . F#4 - G4 -',
          'A4 - - - - - - - . . . . F#4 - F4 -',
          'E4 - - - - - - - . . . . . . F4 -',
          'F#4 - - - - - - - . . . . F4 - F#4 -',
          'G4 - - - - - - - . . . . . . Ab4 -',
          'A4 - - - - - - - . . . . Ab4 - G4 -',
          'F#4 - - - - - - - . . . . A4 - Bb4 -',
          'B4 - - - - - - - . . . . . . F#4 -',
          'G4 - - - - - - - . . . . F#4 - G4 -',
          'A4 - - - - - - - . . . . F#4 - F4 -',
          'E4 - - - - - - - . . . . . . F4 -',
          'F#4 - - - - - - - . . . . F4 - F#4 -',
          'G4 - - - - - - - . . . . . . Ab4 -',
          'A4 - - - - - - - . . . . Ab4 - G4 -',
          'F#4 - - - - - - - . . . . A4 - Bb4 -',
        ],
      },
      pad: {
        wave: 'pulse50', volume: 0.05, filter: 900, env: { a: 0.08, d: 0.4, s: 0.5, r: 0.6 },
        bars: CRYPT_CHORDS.map(c => arp(c, { octave: 3, order: [0, 1, 2, 3], every: 2 })),
      },
      bass: {
        wave: 'triangle', volume: 0.26, env: { a: 0.05, d: 0.3, s: 0.7, r: 0.5 },
        bars: CRYPT_CHORDS.map(c => bass(c, 'halves')),
      },
      drums: {
        wave: 'noise', volume: 0.05,
        bars: repeat('k . . . t . . . a . . . . . . .', 16),
      },
      lute: {
        wave: 'pulse25', volume: 0.05, filter: 1450, env: { a: 0.003, d: 0.44, s: 0.1, r: 0.15 },
        bars: CRYPT_CHORDS.map(c => arp(c)),
      },
    },
  },
};

/** How long a one-shot song lasts, in seconds, including its last notes ringing out. */
export function songSeconds(id) {
  const s = compileSong(id);
  return s.length * s.stepDur + Math.max(...Object.values(SONGS[id].channels).map(c => c.env?.r ?? 0));
}

export const WAVES = ['pulse12', 'pulse25', 'pulse50', 'triangle', 'noise'];
const DRUMS = new Set(['k', 's', 'h', 'a', 't', 'b']);
export const STEPS_PER_BAR = 16;
export const STEPS_PER_BEAT = 4;

/**
 * Validate a song and turn it into events:
 * { stepDur, length, events: [{ step, channel, midi | drum, steps }] } sorted by step.
 * Throws a descriptive error for any malformed bar or note.
 */
export function compileSong(id, song = SONGS[id]) {
  if (!song) throw new Error(`Unknown song "${id}"`);
  const events = [];
  let length = null;
  for (const [name, ch] of Object.entries(song.channels)) {
    if (!WAVES.includes(ch.wave)) throw new Error(`${id}.${name}: unknown wave "${ch.wave}"`);
    const tokens = [];
    ch.bars.forEach((bar, b) => {
      const t = bar.trim().split(/\s+/);
      if (t.length !== STEPS_PER_BAR) throw new Error(`${id}.${name} bar ${b + 1}: ${t.length} steps, expected ${STEPS_PER_BAR}`);
      tokens.push(...t);
    });
    if (length !== null && tokens.length !== length) throw new Error(`${id}.${name}: ${tokens.length} steps, other channels have ${length}`);
    length = tokens.length;
    tokens.forEach((tok, step) => {
      if (tok === '.' || tok === '-') {
        if (tok === '-' && step === 0) throw new Error(`${id}.${name}: a song can't start with a hold`);
        return;
      }
      let steps = 1;
      while (tokens[step + steps] === '-') steps++;
      if (ch.wave === 'noise') {
        if (!DRUMS.has(tok)) throw new Error(`${id}.${name} step ${step}: "${tok}" is not a drum (k, s, h)`);
        events.push({ step, channel: name, drum: tok, steps });
      } else {
        const midi = noteToMidi(tok);
        if (midi === null) throw new Error(`${id}.${name} step ${step}: "${tok}" is not a note`);
        events.push({ step, channel: name, midi, steps });
      }
    });
  }
  events.sort((a, b) => a.step - b.step);
  return { stepDur: 60 / song.bpm / STEPS_PER_BEAT, length, events };
}
