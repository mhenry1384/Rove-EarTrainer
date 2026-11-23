// Music theory and exercise generators. No audio and no DOM here.
//
// A key is { tonic, minor }: tonic is a pitch class 0..11 (0 = C). Minor keys use
// la-based minor, so the syllables are always counted from the relative major's do.
//
// A melody note is { deg, alt }:
//   deg: scale step counted from do (0 = do, 4 = sol, 7 = do an octave up, -2 = la below)
//   alt: chromatic alteration in semitones (-1, 0 or +1), e.g. fa with alt +1 is fi

const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
const DIATONIC_SYL = ["do", "re", "mi", "fa", "sol", "la", "ti"];
const RAISED_SYL = ["di", "ri", "mi", "fi", "si", "li", "ti"];
const LOWERED_SYL = ["do", "ra", "me", "fa", "se", "le", "te"];

// Major keys by do, spelled the way a guitarist would normally see them.
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
const TONIC_CHOICES = ["C", "C# / Db", "D", "D# / Eb", "E", "F", "F# / Gb", "G", "G# / Ab", "A", "A# / Bb", "B"];
const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];

const mod = (n, m) => ((n % m) + m) % m;
const randInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ---------- Keys ----------

// Pitch class of do (the relative major's tonic for a minor key).
function keyDoPc(key) {
  return key.minor ? mod(key.tonic + 3, 12) : key.tonic;
}

// Letter that do is spelled with. Eb minor (do = Gb) reads better than D# minor.
function keyDoLetter(key) {
  const pc = keyDoPc(key);
  if (key.minor && pc === 6) return 4; // Gb
  return KEYS[pc].letter;
}

// Letter name of a note in a key, spelled correctly (F# in D, Bb in F...).
function letterName(key, note) {
  const letter = mod(keyDoLetter(key) + note.deg, 7);
  const pc = mod(keyDoPc(key) + MAJOR_STEPS[mod(note.deg, 7)] + note.alt, 12);
  const acc = mod(pc - LETTER_PC[letter] + 6, 12) - 6;
  return LETTERS[letter] + (acc > 0 ? "#".repeat(acc) : "b".repeat(-acc));
}

const HOME = { deg: 0, alt: 0 };
const HOME_MINOR = { deg: -2, alt: 0 };

function homeNote(key) {
  return key.minor ? HOME_MINOR : HOME;
}
function tonicName(key) {
  return letterName(key, homeNote(key));
}
function doName(key) {
  return letterName(key, HOME);
}
function keyName(key) {
  return `${tonicName(key)} ${key.minor ? "minor" : "major"}`;
}
function sameKey(a, b) {
  return !!a && !!b && a.tonic === b.tonic && a.minor === b.minor;
}

// Do sits between F3 and E4, which keeps melodies in a comfortable guitar range.
function doMidiFor(key) {
  let m = 48 + keyDoPc(key);
  if (m < 53) m += 12;
  return m;
}
function tonicMidiFor(key) {
  return doMidiFor(key) + (key.minor ? -3 : 0);
}

// scale: "major", "minor" or "mixed". fixedTonic: a pitch class, or null for random.
function randomKey(scale, except, fixedTonic = null) {
  for (let i = 0; i < 50; i++) {
    const minor = scale === "minor" || (scale === "mixed" && Math.random() < 0.5);
    const tonic = fixedTonic === null ? randInt(0, 11) : fixedTonic;
    const key = { tonic, minor };
    if (!sameKey(key, except)) return key;
  }
  return { tonic: fixedTonic === null ? randInt(0, 11) : fixedTonic, minor: scale === "minor" };
}

// ---------- Notes ----------

function semitonesFromDo(note) {
  return 12 * Math.floor(note.deg / 7) + MAJOR_STEPS[mod(note.deg, 7)] + note.alt;
}

function syllable(note) {
  const d = mod(note.deg, 7);
  if (note.alt > 0) return RAISED_SYL[d];
  if (note.alt < 0) return LOWERED_SYL[d];
  return DIATONIC_SYL[d];
}

// -1 below the home octave, 0 in it, +1 above. In minor the home octave runs la to sol.
function octaveOf(note, minor) {
  return Math.floor((note.deg + (minor ? 2 : 0)) / 7);
}

// ---------- Melodies ----------

// Degrees in a level are counted from the home note (do in major, la in minor).
const MELODY_LEVELS = [
  { id: 1, label: "1 – 3–4 notes, steps", len: [3, 4], range: [-1, 4], leapProb: 0.12, maxLeap: 2, start: [0, 2, 4], chromatic: false },
  { id: 2, label: "2 – 4–5 notes, small leaps", len: [4, 5], range: [-3, 5], leapProb: 0.3, maxLeap: 2, start: [0, 2, 4, -3], chromatic: false },
  { id: 3, label: "3 – 5–8 notes, leaps", len: [5, 8], range: [-3, 8], leapProb: 0.35, maxLeap: 4, start: null, chromatic: false },
  { id: 4, label: "4 – chromatic notes", len: [5, 8], range: [-3, 8], leapProb: 0.3, maxLeap: 4, start: null, chromatic: true },
];

const STABLE = new Set([0, 2, 4]); // home, third, fifth

// Returns degrees counted from the home note.
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
    const end = mod(notes[notes.length - 1], 7);
    if (!STABLE.has(end)) continue;
    // Ending on the home note (do or la) should be the most common.
    if (end !== 0 && Math.random() < 0.45) continue;
    // A phrase that hardly moves isn't useful.
    if (new Set(notes).size < Math.min(3, length)) continue;
    return notes;
  }
  return [0, 1, 2, 0].slice(0, length);
}

// Swap in chromatic notes where they resolve naturally. Works on do-based degrees.
// Major: fi→sol, te→la, le→sol, me→re, si→la.
// Minor (la-based): si→la, si→ti (harmonic minor), fi→si→la (melodic minor).
function addChromatic(notes, minor) {
  const options = [];
  for (let i = 1; i < notes.length - 1; i++) {
    const d = mod(notes[i].deg, 7);
    const next = notes[i + 1].deg - notes[i].deg;
    if (minor) {
      if (d === 4 && (next === 1 || next === 2)) options.push([i, +1]);
    } else {
      if (d === 3 && next === 1) options.push([i, +1]); // fi -> sol
      if (d === 6 && next === -1) options.push([i, -1]); // te -> la
      if (d === 5 && next === -1) options.push([i, -1]); // le -> sol
      if (d === 2 && next === -1) options.push([i, -1]); // me -> re
      if (d === 4 && next === 1) options.push([i, +1]); // si -> la
    }
  }
  if (!options.length) return null;
  const count = Math.min(options.length, Math.random() < 0.35 ? 2 : 1);
  for (let k = 0; k < count; k++) {
    const idx = Math.floor(Math.random() * options.length);
    const [i, alt] = options.splice(idx, 1)[0];
    notes[i] = { deg: notes[i].deg, alt };
  }
  if (minor) {
    // fa going up to si becomes fi (melodic minor).
    for (let i = 1; i < notes.length - 1; i++) {
      const n = notes[i];
      const nx = notes[i + 1];
      if (mod(n.deg, 7) === 3 && n.alt === 0 && nx.deg === n.deg + 1 && nx.alt === 1) notes[i] = { deg: n.deg, alt: 1 };
    }
  }
  return notes;
}

function makeMelody(levelId, minor = false) {
  const level = MELODY_LEVELS.find((l) => l.id === levelId) || MELODY_LEVELS[0];
  const shift = minor ? -2 : 0;
  const build = (len) => diatonicMelody(level, len).map((d) => ({ deg: d + shift, alt: 0 }));
  for (let attempt = 0; attempt < 200; attempt++) {
    const notes = build(randInt(level.len[0], level.len[1]));
    if (!level.chromatic) return notes;
    const withChromatic = addChromatic(notes, minor);
    if (withChromatic) return withChromatic;
  }
  return build(level.len[0]);
}

// ---------- Chords ----------

// deg/alt: the root, as a do-based scale step. quality: "maj", "min" or "dim".
const MAJOR_CHORDS = {
  I: { deg: 0, alt: 0, quality: "maj" },
  ii: { deg: 1, alt: 0, quality: "min" },
  iii: { deg: 2, alt: 0, quality: "min" },
  IV: { deg: 3, alt: 0, quality: "maj" },
  V: { deg: 4, alt: 0, quality: "maj" },
  vi: { deg: 5, alt: 0, quality: "min" },
  bVII: { deg: 6, alt: -1, quality: "maj" },
  iv: { deg: 3, alt: 0, quality: "min" },
  bVI: { deg: 5, alt: -1, quality: "maj" },
  "V/V": { deg: 1, alt: 0, quality: "maj" },
};
// Numerals relative to the minor tonic (la).
const MINOR_CHORDS = {
  i: { deg: 5, alt: 0, quality: "min" },
  "ii°": { deg: 6, alt: 0, quality: "dim" },
  III: { deg: 0, alt: 0, quality: "maj" },
  iv: { deg: 1, alt: 0, quality: "min" },
  IV: { deg: 1, alt: 0, quality: "maj" },
  v: { deg: 2, alt: 0, quality: "min" },
  V: { deg: 2, alt: 0, quality: "maj" },
  VI: { deg: 3, alt: 0, quality: "maj" },
  VII: { deg: 4, alt: 0, quality: "maj" },
};

function chordDef(symbol, minor) {
  return (minor ? MINOR_CHORDS : MAJOR_CHORDS)[symbol];
}
function chordRootSemis(c) {
  return MAJOR_STEPS[c.deg] + c.alt;
}
function chordIntervals(quality) {
  if (quality === "min") return [0, 3, 7];
  if (quality === "dim") return [0, 3, 6];
  return [0, 4, 7];
}
const QUALITY_SUFFIX = { maj: "", min: "m", dim: "dim" };

// Chord name in a key, e.g. "Bm" for vi in D, "C" for bVII in D.
function chordName(key, symbol) {
  const c = chordDef(symbol, key.minor);
  return letterName(key, { deg: c.deg, alt: c.alt }) + QUALITY_SUFFIX[c.quality];
}

const CHORD_LEVELS = [
  { id: 1, major: ["I", "IV", "V"], minor: ["i", "iv", "V"] },
  { id: 2, major: ["I", "IV", "V", "vi"], minor: ["i", "iv", "V", "VI", "VII"] },
  { id: 3, major: ["I", "ii", "iii", "IV", "V", "vi"], minor: ["i", "III", "iv", "v", "V", "VI", "VII"] },
  {
    id: 4,
    major: ["I", "ii", "iii", "IV", "V", "vi", "bVII", "iv", "bVI", "V/V"],
    minor: ["i", "ii°", "III", "iv", "IV", "v", "V", "VI", "VII"],
  },
];

// Close-position triad near the previous voicing (smooth voice leading),
// plus a bass note on the root.
function voiceChord(symbol, doMidi, prev, minor) {
  const c = chordDef(symbol, minor);
  const root = chordRootSemis(c);
  const pcs = chordIntervals(c.quality).map((i) => root + i);
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
  let bass = doMidi - 12 + root;
  if (bass > doMidi - 7) bass -= 12;
  return { upper: best, bass };
}

function voiceProgression(symbols, doMidi, minor) {
  let prev = null;
  return symbols.map((s) => {
    const v = voiceChord(s, doMidi, prev, minor);
    prev = v.upper;
    return v;
  });
}

// I–IV–V–I (or i–iv–V–i in minor) with textbook voice leading.
function cadenceVoicing(key) {
  const t = tonicMidiFor(key);
  const third = key.minor ? 3 : 4;
  const sixth = key.minor ? 8 : 9;
  const b = t - 12;
  return [
    { upper: [t, t + third, t + 7], bass: b },
    { upper: [t, t + 5, t + sixth], bass: b - 7 },
    { upper: [t - 1, t + 2, t + 7], bass: b - 5 },
    { upper: [t, t + third, t + 7], bass: b },
  ];
}

function makeChordQuestion(levelId, count, minor) {
  const level = CHORD_LEVELS.find((l) => l.id === levelId) || CHORD_LEVELS[0];
  const list = minor ? level.minor : level.major;
  const home = minor ? "i" : "I";
  const out = [];
  while (out.length < count) {
    const c = pick(list);
    if (out.length && c === out[out.length - 1]) continue;
    // A one-chord question right after the cadence shouldn't be the tonic every time.
    if (count === 1 && c === home && Math.random() < 0.6) continue;
    out.push(c);
  }
  return out;
}

// ---------- Tonic finding ----------

// Common pop/folk loops. They get rotated so the progression rarely starts on the tonic.
const TONIC_LOOPS_MAJOR = [
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
const TONIC_LOOPS_MINOR = [
  ["i", "VI", "III", "VII"],
  ["i", "iv", "v", "i"],
  ["i", "VII", "VI", "VII"],
  ["i", "iv", "VII", "III"],
  ["i", "VI", "iv", "V"],
  ["i", "III", "VII", "iv"],
  ["i", "iv", "i", "V"],
  ["VI", "VII", "i", "i"],
  ["i", "VII", "VI", "V"],
];

function makeTonicProgression(minor) {
  const loop = pick(minor ? TONIC_LOOPS_MINOR : TONIC_LOOPS_MAJOR);
  const shift = randInt(0, 3);
  return loop.slice(shift).concat(loop.slice(0, shift));
}

// A simple tune over the chords, built from chord tones, so it sounds a bit
// more like a song than bare chords. Returns { midi, beat } pairs (2 per chord).
function tuneOverChords(symbols, doMidi, minor) {
  const out = [];
  let last = doMidi + 7;
  symbols.forEach((s, i) => {
    const c = chordDef(s, minor);
    const root = chordRootSemis(c);
    const tones = chordIntervals(c.quality).map((x) => root + x);
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
