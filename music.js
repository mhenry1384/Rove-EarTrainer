// Music theory and exercise generators. No audio and no DOM here.
//
// A melody note is { deg, alt }:
//   deg: scale step counted from do (0 = do, 4 = sol, 7 = do an octave up, -3 = sol below)
//   alt: chromatic alteration in semitones (-1, 0 or +1), e.g. fa with alt +1 is fi

const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
const DIATONIC_SYL = ["do", "re", "mi", "fa", "sol", "la", "ti"];
const RAISED_SYL = ["di", "ri", "mi", "fi", "si", "li", "ti"];
const LOWERED_SYL = ["do", "ra", "me", "fa", "se", "le", "te"];

// Major keys, spelled the way a guitarist would normally see them.
const KEYS = [
  { name: "C", letter: 0 },
  { name: "Db", letter: 1 },
  { name: "D", letter: 1 },
  { name: "Eb", letter: 2 },
  { name: "E", letter: 2 },
  { name: "F", letter: 3 },
  { name: "F#", letter: 3 },
  { name: "G", letter: 4 },
  { name: "Ab", letter: 5 },
  { name: "A", letter: 5 },
  { name: "Bb", letter: 6 },
  { name: "B", letter: 6 },
];
const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];

const mod = (n, m) => ((n % m) + m) % m;
const randInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function semitonesFromDo(note) {
  return 12 * Math.floor(note.deg / 7) + MAJOR_STEPS[mod(note.deg, 7)] + note.alt;
}

function syllable(note) {
  const d = mod(note.deg, 7);
  if (note.alt > 0) return RAISED_SYL[d];
  if (note.alt < 0) return LOWERED_SYL[d];
  return DIATONIC_SYL[d];
}

// -1 below the home octave, 0 in it, +1 above.
function octaveOf(note) {
  return Math.floor(note.deg / 7);
}

// Letter name of a scale step in a key, spelled correctly (F# in D, Bb in F...).
function letterName(keyPc, note) {
  const key = KEYS[keyPc];
  const letter = mod(key.letter + note.deg, 7);
  const pc = mod(keyPc + MAJOR_STEPS[mod(note.deg, 7)] + note.alt, 12);
  const acc = mod(pc - LETTER_PC[letter] + 6, 12) - 6;
  const sign = acc > 0 ? "#".repeat(acc) : "b".repeat(-acc);
  return LETTERS[letter] + sign;
}

// Do sits between F3 and E4, which keeps melodies in a comfortable guitar range.
function doMidiFor(keyPc) {
  let m = 48 + keyPc;
  if (m < 53) m += 12;
  return m;
}

// ---------- Melodies ----------

const MELODY_LEVELS = [
  {
    id: 1,
    label: "1 – 3–4 notes, steps",
    len: [3, 4],
    range: [-1, 4],
    leapProb: 0.12,
    maxLeap: 2,
    start: [0, 2, 4],
    chromatic: false,
  },
  {
    id: 2,
    label: "2 – 4–5 notes, small leaps",
    len: [4, 5],
    range: [-3, 5],
    leapProb: 0.3,
    maxLeap: 2,
    start: [0, 2, 4, -3],
    chromatic: false,
  },
  {
    id: 3,
    label: "3 – 5–8 notes, leaps",
    len: [5, 8],
    range: [-3, 8],
    leapProb: 0.35,
    maxLeap: 4,
    start: null,
    chromatic: false,
  },
  {
    id: 4,
    label: "4 – chromatic (fi, te, me, le, si)",
    len: [5, 8],
    range: [-3, 8],
    leapProb: 0.3,
    maxLeap: 4,
    start: null,
    chromatic: true,
  },
];

const STABLE = new Set([0, 2, 4]); // do, mi, sol

function diatonicMelody(level, length) {
  const [lo, hi] = level.range;
  for (let attempt = 0; attempt < 500; attempt++) {
    const starts = level.start || [];
    let deg = starts.length ? pick(starts) : randInt(Math.max(lo, -3), Math.min(hi, 5));
    const notes = [deg];
    let lastMove = 0;
    while (notes.length < length) {
      let move;
      if (Math.abs(lastMove) >= 2 && Math.random() < 0.7) {
        // After a leap, usually step back the other way.
        move = -Math.sign(lastMove);
      } else if (Math.random() < level.leapProb) {
        move = randInt(2, level.maxLeap) * (Math.random() < 0.5 ? -1 : 1);
      } else if (Math.random() < 0.06) {
        move = 0;
      } else {
        move = Math.random() < 0.5 ? -1 : 1;
      }
      const next = deg + move;
      if (next < lo || next > hi) continue;
      deg = next;
      lastMove = move;
      notes.push(deg);
    }
    if (!STABLE.has(mod(notes[notes.length - 1], 7))) continue;
    // A single repeated pitch for the whole phrase isn't useful.
    if (new Set(notes).size < Math.min(3, length)) continue;
    return notes.map((d) => ({ deg: d, alt: 0 }));
  }
  return [0, 1, 2, 0].slice(0, length).map((d) => ({ deg: d, alt: 0 }));
}

// Swap in chromatic notes where they resolve naturally:
// fi→sol, te→la, le→sol, me→re, si→la.
function addChromatic(notes) {
  const options = [];
  for (let i = 1; i < notes.length - 1; i++) {
    const d = mod(notes[i].deg, 7);
    const next = notes[i + 1].deg - notes[i].deg;
    if (d === 3 && next === 1) options.push([i, +1]); // fi -> sol
    if (d === 6 && next === -1) options.push([i, -1]); // te -> la
    if (d === 5 && next === -1) options.push([i, -1]); // le -> sol
    if (d === 2 && next === -1) options.push([i, -1]); // me -> re
    if (d === 4 && next === 1) options.push([i, +1]); // si -> la
  }
  if (!options.length) return null;
  const count = Math.min(options.length, Math.random() < 0.35 ? 2 : 1);
  for (let k = 0; k < count; k++) {
    const idx = Math.floor(Math.random() * options.length);
    const [i, alt] = options.splice(idx, 1)[0];
    notes[i] = { deg: notes[i].deg, alt };
  }
  return notes;
}

function makeMelody(levelId) {
  const level = MELODY_LEVELS.find((l) => l.id === levelId) || MELODY_LEVELS[0];
  for (let attempt = 0; attempt < 200; attempt++) {
    const notes = diatonicMelody(level, randInt(level.len[0], level.len[1]));
    if (!level.chromatic) return notes;
    const withChromatic = addChromatic(notes);
    if (withChromatic) return withChromatic;
  }
  return diatonicMelody(level, level.len[0]);
}

// ---------- Chords ----------

// root: semitones above do. quality: "maj" or "min".
const CHORDS = {
  I: { root: 0, quality: "maj" },
  ii: { root: 2, quality: "min" },
  iii: { root: 4, quality: "min" },
  IV: { root: 5, quality: "maj" },
  V: { root: 7, quality: "maj" },
  vi: { root: 9, quality: "min" },
  bVII: { root: 10, quality: "maj" },
  iv: { root: 5, quality: "min" },
  bVI: { root: 8, quality: "maj" },
  "V/V": { root: 2, quality: "maj" },
};

const CHORD_LEVELS = [
  { id: 1, label: "1 – I IV V", chords: ["I", "IV", "V"] },
  { id: 2, label: "2 – I IV V vi", chords: ["I", "IV", "V", "vi"] },
  { id: 3, label: "3 – add ii iii", chords: ["I", "ii", "iii", "IV", "V", "vi"] },
  {
    id: 4,
    label: "4 – add bVII iv bVI V/V",
    chords: ["I", "ii", "iii", "IV", "V", "vi", "bVII", "iv", "bVI", "V/V"],
  },
];

function chordIntervals(quality) {
  return quality === "min" ? [0, 3, 7] : [0, 4, 7];
}

// Close-position triad near the previous voicing (smooth voice leading),
// plus a bass note on the root.
function voiceChord(symbol, doMidi, prev) {
  const c = CHORDS[symbol];
  const pcs = chordIntervals(c.quality).map((i) => c.root + i);
  const lo = doMidi - 5;
  const hi = doMidi + 14;
  const target = prev || [doMidi, doMidi + 4, doMidi + 7];
  let best = null;
  let bestCost = Infinity;
  for (let inv = 0; inv < 3; inv++) {
    const rotated = pcs.slice(inv).concat(pcs.slice(0, inv).map((p) => p + 12));
    for (let oct = -2; oct <= 2; oct++) {
      const v = rotated.map((p) => doMidi + p + 12 * oct);
      if (v[0] < lo || v[2] > hi) continue;
      const cost = v.reduce((s, n, i) => s + Math.abs(n - target[i]), 0);
      if (cost < bestCost) {
        bestCost = cost;
        best = v;
      }
    }
  }
  let bass = doMidi - 12 + c.root;
  if (bass > doMidi - 7) bass -= 12;
  return { upper: best, bass };
}

function voiceProgression(symbols, doMidi) {
  let prev = null;
  return symbols.map((s) => {
    const v = voiceChord(s, doMidi, prev);
    prev = v.upper;
    return v;
  });
}

// The classic I–IV–V–I cadence with textbook voice leading.
function cadenceVoicing(doMidi) {
  const b = doMidi - 12;
  return [
    { upper: [doMidi, doMidi + 4, doMidi + 7], bass: b },
    { upper: [doMidi, doMidi + 5, doMidi + 9], bass: b + 5 - 12 },
    { upper: [doMidi - 1, doMidi + 2, doMidi + 7], bass: b + 7 - 12 },
    { upper: [doMidi, doMidi + 4, doMidi + 7], bass: b },
  ];
}

function makeChordQuestion(levelId, count) {
  const level = CHORD_LEVELS.find((l) => l.id === levelId) || CHORD_LEVELS[0];
  const out = [];
  while (out.length < count) {
    const c = pick(level.chords);
    if (out.length && c === out[out.length - 1]) continue;
    // A one-chord question right after the cadence shouldn't be I every time.
    if (count === 1 && c === "I" && Math.random() < 0.6) continue;
    out.push(c);
  }
  return out;
}

// ---------- Tonic finding ----------

// Common pop/folk loops. They get rotated so the progression rarely starts on I.
const TONIC_LOOPS = [
  ["I", "V", "vi", "IV"],
  ["I", "vi", "IV", "V"],
  ["I", "IV", "V", "IV"],
  ["I", "IV", "vi", "V"],
  ["ii", "V", "I", "I"],
  ["I", "bVII", "IV", "I"],
  ["I", "iii", "IV", "V"],
  ["vi", "IV", "I", "V"],
  ["I", "V", "IV", "V"],
  ["IV", "I", "V", "vi"],
];

function makeTonicProgression() {
  const loop = pick(TONIC_LOOPS);
  const shift = randInt(0, 3);
  return loop.slice(shift).concat(loop.slice(0, shift));
}

// A simple tune over the chords, built from chord tones, so it sounds a bit
// more like a song than bare chords. Returns { midi, beat } pairs (2 per chord).
function tuneOverChords(symbols, doMidi) {
  const out = [];
  let last = doMidi + 7;
  symbols.forEach((s, i) => {
    const c = CHORDS[s];
    const tones = chordIntervals(c.quality).map((x) => c.root + x);
    for (let k = 0; k < 2; k++) {
      // Chord tones in the octave above do, nearest to the previous note.
      const cands = [];
      tones.forEach((t) => {
        for (let o = 0; o <= 1; o++) {
          const m = doMidi + mod(t, 12) + 12 * o;
          if (m >= doMidi + 2 && m <= doMidi + 14) cands.push(m);
        }
      });
      cands.sort((a, b) => Math.abs(a - last) - Math.abs(b - last));
      const m = cands[Math.random() < 0.6 ? 0 : Math.min(1, cands.length - 1)];
      out.push({ midi: m, beat: i * 2 + k });
      last = m;
    }
  });
  return out;
}
