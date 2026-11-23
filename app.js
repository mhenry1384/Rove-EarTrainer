// Rove EarTrainer – main page. Plays exercises; you check yourself by
// showing the answer. Nothing is scored.

const $ = (id) => document.getElementById(id);
const STORE_KEY = "rove-eartrainer";

const settings = {
  mode: "melody",
  mLevel: 1,
  mScale: "major", // "major", "minor" or "mixed" (same for tScale, cScale)
  mKeyMode: "random", // "random" or the tonic's pitch class 0..11
  mEvery: 4,
  mCadMode: "keychange",
  mTempo: 90,
  mLetters: false,
  tScale: "major",
  tTune: true,
  tTempo: 100,
  cScale: "major",
  cLevel: 1,
  cCount: 1,
  volume: 0.8,
  hfPause: 6,
  hfPlays: 2,
};

function loadSettings() {
  try {
    Object.assign(settings, JSON.parse(localStorage.getItem(STORE_KEY) || "{}"));
  } catch {}
}
function saveSettings() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(settings));
  } catch {}
}

// ---------- Playback control ----------
// Every action bumps the token; anything still waiting on an old token stops.
const CANCELLED = Symbol("cancelled");
let token = 0;

function cancelAll() {
  token++;
  Synth.stop();
  clearHighlight();
  return token;
}
function sleep(sec, t) {
  return new Promise((resolve, reject) =>
    setTimeout(() => (t === token ? resolve() : reject(CANCELLED)), sec * 1000)
  );
}
function ignoreCancel(err) {
  if (err !== CANCELLED) throw err;
}

const CADENCE_CHORD = 0.7;
// Plays I–IV–V–I (i–iv–V–i in minor). Returns its length in seconds.
function playCadence(key, at = 0) {
  const v = cadenceVoicing(key);
  v.forEach((c, i) => {
    const len = i === 3 ? CADENCE_CHORD * 1.8 : CADENCE_CHORD;
    Synth.chord(c.upper, at + i * CADENCE_CHORD, len * 0.95);
    Synth.note(c.bass, at + i * CADENCE_CHORD, len * 0.95, 0.7);
  });
  return CADENCE_CHORD * 4.8;
}

// ---------- Shared UI helpers ----------
function fillSelect(sel, items) {
  sel.textContent = "";
  items.forEach(([value, label]) => {
    const o = document.createElement("option");
    o.value = String(value);
    o.textContent = label;
    sel.appendChild(o);
  });
}

const fitsScale = (key, scale) => scale === "mixed" || key.minor === (scale === "minor");

let highlightTimers = [];
function clearHighlight() {
  highlightTimers.forEach(clearTimeout);
  highlightTimers = [];
  document.querySelectorAll(".chip.playing").forEach((c) => c.classList.remove("playing"));
}
// Light up answer chips in time with playback.
function highlightChips(container, times, dur) {
  const chips = container.querySelectorAll(".chip");
  times.forEach((at, i) => {
    if (!chips[i]) return;
    highlightTimers.push(setTimeout(() => chips[i].classList.add("playing"), at * 1000 + 30));
    highlightTimers.push(setTimeout(() => chips[i].classList.remove("playing"), (at + dur[i]) * 1000));
  });
}

// ---------- Melody mode ----------
const melody = {
  key: null,
  phrasesInKey: 0,
  notes: null,
  revealed: false,
  els: {
    key: $("m-key"),
    keyNote: $("m-key-note"),
    answer: $("m-answer"),
  },

  doMidi() {
    return doMidiFor(this.key);
  },

  // Returns true when the key changed (so the cadence should play).
  pickKey() {
    const fixed = settings.mKeyMode === "random" ? null : Number(settings.mKeyMode);
    const every = Number(settings.mEvery);
    const k = this.key;
    const due =
      k === null ||
      !fitsScale(k, settings.mScale) ||
      (fixed !== null && k.tonic !== fixed) ||
      (every > 0 && this.phrasesInKey >= every);
    if (!due) return false;
    // With a fixed tonic and "mixed", a key change can only switch major/minor;
    // with a fixed major- or minor-only key there's nothing to change to.
    const next = randomKey(settings.mScale, fixed !== null && settings.mScale !== "mixed" ? null : k, fixed);
    this.phrasesInKey = 0;
    const changed = !sameKey(next, k);
    this.key = next;
    return changed;
  },

  // Schedules the phrase. Returns { len, times, durs } in seconds.
  scheduleMelody(at, slow = 1) {
    const beat = (60 / settings.mTempo) * slow;
    const doMidi = this.doMidi();
    const times = [];
    const durs = [];
    this.notes.forEach((n, i) => {
      const len = i === this.notes.length - 1 ? beat * 2 : beat;
      const t = at + i * beat;
      Synth.note(doMidi + semitonesFromDo(n), t, len * 0.92);
      times.push(t);
      durs.push(len);
    });
    return { len: at + beat * (this.notes.length + 1), times, durs };
  },

  async playMelody(t, slow = 1, at = 0) {
    const r = this.scheduleMelody(at, slow);
    if (this.revealed) highlightChips(this.els.answer, r.times, r.durs);
    await sleep(r.len, t);
  },

  async next(t) {
    const keyChanged = this.pickKey();
    this.phrasesInKey++;
    this.notes = makeMelody(Number(settings.mLevel), this.key.minor);
    this.revealed = false;
    this.render();
    let at = 0;
    if (keyChanged || settings.mCadMode === "always") at = playCadence(this.key) + 0.35;
    await this.playMelody(t, 1, at);
  },

  async replay(t, slow = 1) {
    if (!this.notes) return this.next(t);
    await this.playMelody(t, slow);
  },

  async cadence(t) {
    if (this.key === null) this.pickKey();
    this.render();
    await sleep(playCadence(this.key), t);
  },

  async playTonic(t) {
    if (this.key === null) this.pickKey();
    this.render();
    Synth.note(tonicMidiFor(this.key), 0, 1.2);
    await sleep(1.3, t);
  },

  reveal() {
    if (!this.notes) return;
    this.revealed = true;
    this.render();
  },

  render() {
    const els = this.els;
    if (this.key === null) return;
    const k = this.key;
    els.key.textContent = keyName(k);
    els.keyNote.textContent = k.minor ? `la = ${tonicName(k)} · do = ${doName(k)}` : `do = ${doName(k)}`;
    if (!this.notes) return;
    els.answer.textContent = "";
    const row = document.createElement("div");
    row.className = "chips";
    this.notes.forEach((n) => {
      const chip = document.createElement(this.revealed ? "button" : "span");
      chip.className = "chip" + (this.revealed ? "" : " hidden-note");
      if (this.revealed) {
        chip.type = "button";
        const oct = octaveOf(n, k.minor);
        chip.innerHTML =
          `<span class="syl${n.alt ? " chromatic" : ""}">${syllable(n)}` +
          (oct < 0 ? '<sub class="oct" title="lower octave">↓</sub>' : "") +
          (oct > 0 ? '<sup class="oct" title="upper octave">↑</sup>' : "") +
          `</span>` +
          (settings.mLetters ? `<span class="letter">${letterName(k, n)}</span>` : "");
        chip.title = "Play this note";
        chip.addEventListener("click", () => {
          stopHandsFree();
          cancelAll();
          Synth.note(this.doMidi() + semitonesFromDo(n), 0, 0.9);
        });
      } else {
        chip.textContent = "?";
      }
      row.appendChild(chip);
    });
    els.answer.appendChild(row);
    if (!this.revealed) {
      const p = document.createElement("p");
      p.className = "hint";
      p.textContent = `${this.notes.length} notes`;
      els.answer.appendChild(p);
    }
  },
};

// ---------- Tonic mode ----------
const tonic = {
  key: null,
  chords: null,
  tune: null,
  revealed: false,
  startedAt: null,
  stoppedAt: null,
  els: { timer: $("t-timer"), answer: $("t-answer") },

  schedule() {
    const doMidi = doMidiFor(this.key);
    const beat = 60 / settings.tTempo;
    const chordLen = beat * 2;
    const voiced = voiceProgression(this.chords, doMidi, this.key.minor);
    const reps = 2;
    for (let r = 0; r < reps; r++) {
      voiced.forEach((v, i) => {
        const at = (r * this.chords.length + i) * chordLen;
        Synth.chord(v.upper, at, chordLen * 0.95, 0.4);
        Synth.note(v.bass, at, chordLen * 0.95, 0.6);
      });
      if (settings.tTune) {
        this.tune.forEach((n) => {
          Synth.note(n.midi, r * this.chords.length * chordLen + n.beat * beat, beat * 0.9, 0.75);
        });
      }
    }
    return reps * this.chords.length * chordLen;
  },

  async next(t) {
    this.key = randomKey(settings.tScale, this.key);
    this.chords = makeTonicProgression(this.key.minor);
    this.tune = tuneOverChords(this.chords, doMidiFor(this.key), this.key.minor);
    this.revealed = false;
    this.startedAt = performance.now();
    this.stoppedAt = null;
    this.render();
    await sleep(this.schedule() + 0.3, t);
  },

  async replay(t) {
    if (!this.chords) return this.next(t);
    await sleep(this.schedule() + 0.3, t);
  },

  reveal() {
    if (!this.chords) return;
    if (this.stoppedAt === null) this.stoppedAt = performance.now();
    this.revealed = true;
    this.render();
    Synth.note(tonicMidiFor(this.key), 0.05, 1.6);
    Synth.note(tonicMidiFor(this.key) - 12, 0.05, 1.6, 0.6);
  },

  tick() {
    if (this.startedAt === null) return;
    const end = this.stoppedAt === null ? performance.now() : this.stoppedAt;
    const s = (end - this.startedAt) / 1000;
    this.els.timer.innerHTML = `${s.toFixed(1)}<span>s</span>`;
    this.els.timer.classList.toggle("stopped", this.stoppedAt !== null);
  },

  render() {
    const a = this.els.answer;
    a.textContent = "";
    if (!this.revealed) {
      const what = settings.tScale === "major" ? "do" : settings.tScale === "minor" ? "la" : "home (do or la)";
      a.innerHTML = `<p class="hint">Listening… find ${what}, then press <strong>Show tonic</strong>.</p>`;
      return;
    }
    const k = this.key;
    const names = this.chords.map((s) => `${s} (${chordName(k, s)})`).join(" – ");
    a.innerHTML =
      `<p class="big-answer">${k.minor ? "la" : "do"} = <strong>${tonicName(k)}</strong></p>` +
      `<p class="hint">${keyName(k)}${k.minor ? ` (do = ${doName(k)})` : ""}. Chords: ${names}.</p>`;
  },
};

// ---------- Chord mode ----------
const chords = {
  key: null,
  question: null,
  revealed: false,
  els: { key: $("c-key"), answer: $("c-answer") },

  scheduleQuestion(at) {
    const doMidi = doMidiFor(this.key);
    const voiced = voiceProgression(this.question, doMidi, this.key.minor);
    const len = 1.3;
    const times = [];
    const durs = [];
    voiced.forEach((v, i) => {
      Synth.chord(v.upper, at + i * len, len * 0.92);
      Synth.note(v.bass, at + i * len, len * 0.92, 0.7);
      times.push(at + i * len);
      durs.push(len);
    });
    return { len: at + this.question.length * len + 0.3, times, durs };
  },

  async play(t, withCadence) {
    const at = withCadence ? playCadence(this.key) + 0.5 : 0;
    const r = this.scheduleQuestion(at);
    if (this.revealed) highlightChips(this.els.answer, r.times, r.durs);
    await sleep(r.len, t);
  },

  async next(t) {
    this.key = randomKey(settings.cScale, this.key);
    this.question = makeChordQuestion(Number(settings.cLevel), Number(settings.cCount), this.key.minor);
    this.revealed = false;
    this.render();
    await this.play(t, true);
  },

  async replay(t) {
    if (!this.question) return this.next(t);
    await this.play(t, false);
  },

  async cadence(t) {
    if (this.key === null) return this.next(t);
    await sleep(playCadence(this.key), t);
  },

  reveal() {
    if (!this.question) return;
    this.revealed = true;
    this.render();
  },

  render() {
    if (this.key === null) return;
    this.els.key.textContent = keyName(this.key);
    const a = this.els.answer;
    a.textContent = "";
    const row = document.createElement("div");
    row.className = "chips";
    this.question.forEach((sym) => {
      const chip = document.createElement(this.revealed ? "button" : "span");
      chip.className = "chip" + (this.revealed ? "" : " hidden-note");
      if (this.revealed) {
        chip.type = "button";
        chip.innerHTML =
          `<span class="syl">${sym}</span>` + `<span class="letter">${chordName(this.key, sym)}</span>`;
        chip.title = "Play this chord";
        chip.addEventListener("click", () => {
          stopHandsFree();
          cancelAll();
          const v = voiceChord(sym, doMidiFor(this.key), null, this.key.minor);
          Synth.chord(v.upper, 0, 1.2);
          Synth.note(v.bass, 0, 1.2, 0.7);
        });
      } else {
        chip.textContent = "?";
      }
      row.appendChild(chip);
    });
    a.appendChild(row);
  },
};

// ---------- Modes, actions and hands-free ----------
const modes = { melody, tonic, chords };
const current = () => modes[settings.mode];

function run(action) {
  stopHandsFree();
  const t = cancelAll();
  Synth.ensure();
  Promise.resolve(action(t)).catch(ignoreCancel);
}

let handsFree = false;
function setHandsFreeUI() {
  document.querySelectorAll(".handsfree").forEach((b) => {
    b.classList.toggle("on", handsFree);
    b.textContent = handsFree ? "Stop hands-free" : "Hands-free";
  });
  if (!handsFree) document.querySelectorAll(".hf-status").forEach((s) => (s.textContent = ""));
}
function hfStatus(text) {
  const s = document.querySelector(`[data-panel="${settings.mode}"] .hf-status`);
  if (s) s.textContent = text;
}
function stopHandsFree() {
  if (!handsFree) return;
  handsFree = false;
  setHandsFreeUI();
}

async function handsFreeLoop(t) {
  const m = current();
  const pause = Number(settings.hfPause);
  const plays = Number(settings.hfPlays);
  while (true) {
    hfStatus("Listen…");
    await m.next(t);
    for (let i = 1; i < plays; i++) {
      hfStatus("Your turn");
      await sleep(pause, t);
      hfStatus("Again…");
      await m.replay(t);
    }
    hfStatus("Your turn");
    await sleep(pause, t);
    hfStatus("Answer");
    m.reveal();
    if (m === tonic) await sleep(2.2, t);
    else await m.replay(t);
    await sleep(1.5, t);
  }
}

function toggleHandsFree() {
  if (handsFree) {
    stopHandsFree();
    cancelAll();
    return;
  }
  const t = cancelAll();
  Synth.ensure();
  handsFree = true;
  setHandsFreeUI();
  handsFreeLoop(t).catch(ignoreCancel);
}

function setMode(mode) {
  stopHandsFree();
  cancelAll();
  settings.mode = mode;
  saveSettings();
  document.querySelectorAll(".tabs button").forEach((b) => {
    const on = b.dataset.mode === mode;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });
  document.querySelectorAll(".panel").forEach((p) => (p.hidden = p.dataset.panel !== mode));
}

// ---------- Wiring ----------
loadSettings();
$("app-version").textContent = APP_VERSION;

document.querySelectorAll(".tabs button").forEach((b) =>
  b.addEventListener("click", () => setMode(b.dataset.mode))
);
document.querySelectorAll(".handsfree").forEach((b) => b.addEventListener("click", toggleHandsFree));

$("m-next").addEventListener("click", () => run((t) => melody.next(t)));
$("m-replay").addEventListener("click", () => run((t) => melody.replay(t)));
$("m-slow").addEventListener("click", () => run((t) => melody.replay(t, 1.7)));
$("m-cadence").addEventListener("click", () => run((t) => melody.cadence(t)));
$("m-tonic").addEventListener("click", () => run((t) => melody.playTonic(t)));
$("m-show").addEventListener("click", () => {
  stopHandsFree();
  cancelAll();
  melody.reveal();
});

$("t-next").addEventListener("click", () => run((t) => tonic.next(t)));
$("t-replay").addEventListener("click", () => run((t) => tonic.replay(t)));
$("t-show").addEventListener("click", () => {
  stopHandsFree();
  cancelAll();
  Synth.ensure();
  tonic.reveal();
});

$("c-next").addEventListener("click", () => run((t) => chords.next(t)));
$("c-replay").addEventListener("click", () => run((t) => chords.replay(t)));
$("c-cadence").addEventListener("click", () => run((t) => chords.cadence(t)));
$("c-show").addEventListener("click", () => {
  stopHandsFree();
  cancelAll();
  chords.reveal();
});

// Settings controls
fillSelect($("m-level"), MELODY_LEVELS.map((l) => [l.id, l.label]));
fillSelect($("m-keymode"), [["random", "random"], ...TONIC_CHOICES.map((name, i) => [i, name])]);

// Chord level labels list the chords for the chosen major/minor setting.
function fillChordLevels() {
  const sel = $("c-level");
  fillSelect(
    sel,
    CHORD_LEVELS.map((l) => {
      const major = l.major.join(" ");
      const minor = l.minor.join(" ");
      const label = settings.cScale === "major" ? major : settings.cScale === "minor" ? minor : `${major} / ${minor}`;
      return [l.id, `${l.id} – ${label}`];
    })
  );
  sel.value = String(settings.cLevel);
}
fillChordLevels();

function bindSelect(id, key, onChange) {
  const el = $(id);
  el.value = String(settings[key]);
  el.addEventListener("change", () => {
    settings[key] = el.value;
    saveSettings();
    if (onChange) onChange();
  });
}
function bindCheck(id, key, onChange) {
  const el = $(id);
  el.checked = !!settings[key];
  el.addEventListener("change", () => {
    settings[key] = el.checked;
    saveSettings();
    if (onChange) onChange();
  });
}
function bindRange(id, key, format, onChange) {
  const el = $(id);
  const out = $(`${id}-out`);
  el.value = settings[key];
  const show = () => (out.textContent = format(Number(el.value)));
  show();
  el.addEventListener("input", () => {
    settings[key] = Number(el.value);
    show();
    saveSettings();
    if (onChange) onChange();
  });
}

bindSelect("m-scale", "mScale");
bindSelect("t-scale", "tScale");
bindSelect("c-scale", "cScale", fillChordLevels);
bindSelect("m-level", "mLevel");
bindSelect("m-keymode", "mKeyMode", () => {
  melody.phrasesInKey = 0;
});
bindSelect("m-every", "mEvery");
bindSelect("m-cadmode", "mCadMode");
bindRange("m-tempo", "mTempo", (v) => `${v} bpm`);
bindCheck("m-letters", "mLetters", () => melody.render());
bindCheck("t-tune", "tTune");
bindRange("t-tempo", "tTempo", (v) => `${v} bpm`);
bindSelect("c-level", "cLevel");
bindSelect("c-count", "cCount");
bindRange("vol", "volume", (v) => `${Math.round(v * 100)}%`, () => Synth.setVolume(settings.volume));
bindRange("hf-pause", "hfPause", (v) => `${v} s`);
bindSelect("hf-plays", "hfPlays");

Synth.setVolume(settings.volume);

// Keyboard shortcuts
document.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = e.target.tagName;
  if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
  const k = e.key.toLowerCase();
  const p = settings.mode[0]; // "m", "t" or "c"
  const click = (id) => {
    const el = $(`${p}-${id}`);
    if (el) {
      e.preventDefault();
      el.click();
    }
  };
  if (k === "enter" || k === "n") click("next");
  else if (k === " ") click("replay");
  else if (k === "a") click("show");
  else if (k === "c") click("cadence");
  else if (k === "t") click("tonic");
  else if (k === "s") click("slow");
  else if (k === "h") {
    e.preventDefault();
    toggleHandsFree();
  }
});

setInterval(() => tonic.tick(), 100);
setMode(settings.mode);
