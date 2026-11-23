// Rove EarTrainer – main page. Plays exercises; you check yourself by
// showing the answer. Nothing is scored.

const $ = (id) => document.getElementById(id);
const STORE_KEY = "rove-eartrainer";

const settings = {
  mode: "melody",
  mLevel: 1,
  mKeyMode: "random", // "random" or a key index 0..11
  mEvery: 4,
  mCadMode: "keychange",
  mTempo: 90,
  mLetters: false,
  tTune: true,
  tTempo: 100,
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
// Plays I–IV–V–I. Returns its length in seconds.
function playCadence(doMidi, at = 0) {
  const v = cadenceVoicing(doMidi);
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

function randomKey(except) {
  let k;
  do k = randInt(0, 11);
  while (k === except);
  return k;
}

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

  pickKey() {
    if (settings.mKeyMode !== "random") {
      const k = Number(settings.mKeyMode);
      const changed = k !== this.key;
      this.key = k;
      return changed;
    }
    const every = Number(settings.mEvery);
    if (this.key === null || (every > 0 && this.phrasesInKey >= every)) {
      this.key = randomKey(this.key);
      this.phrasesInKey = 0;
      return true;
    }
    return false;
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
    this.notes = makeMelody(Number(settings.mLevel));
    this.revealed = false;
    this.render();
    let at = 0;
    if (keyChanged || settings.mCadMode === "always") at = playCadence(this.doMidi()) + 0.35;
    await this.playMelody(t, 1, at);
  },

  async replay(t, slow = 1) {
    if (!this.notes) return this.next(t);
    await this.playMelody(t, slow);
  },

  async cadence(t) {
    if (this.key === null) this.pickKey();
    this.render();
    await sleep(playCadence(this.doMidi()), t);
  },

  async playDo(t) {
    if (this.key === null) this.pickKey();
    this.render();
    Synth.note(this.doMidi(), 0, 1.2);
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
    els.key.textContent = `${KEYS[this.key].name} major`;
    els.keyNote.textContent = `do = ${KEYS[this.key].name}`;
    if (!this.notes) return;
    els.answer.textContent = "";
    const row = document.createElement("div");
    row.className = "chips";
    this.notes.forEach((n) => {
      const chip = document.createElement(this.revealed ? "button" : "span");
      chip.className = "chip" + (this.revealed ? "" : " hidden-note");
      if (this.revealed) {
        chip.type = "button";
        const oct = octaveOf(n);
        chip.innerHTML =
          `<span class="syl${n.alt ? " chromatic" : ""}">${syllable(n)}` +
          (oct < 0 ? '<sub class="oct" title="lower octave">↓</sub>' : "") +
          (oct > 0 ? '<sup class="oct" title="upper octave">↑</sup>' : "") +
          `</span>` +
          (settings.mLetters ? `<span class="letter">${letterName(this.key, n)}</span>` : "");
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
    const voiced = voiceProgression(this.chords, doMidi);
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
    this.key = randomKey(this.key);
    this.chords = makeTonicProgression();
    this.tune = tuneOverChords(this.chords, doMidiFor(this.key));
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
    Synth.note(doMidiFor(this.key), 0.05, 1.6);
    Synth.note(doMidiFor(this.key) - 12, 0.05, 1.6, 0.6);
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
      a.innerHTML = '<p class="hint">Listening… find do, then press <strong>Show do</strong>.</p>';
      return;
    }
    const name = KEYS[this.key].name;
    a.innerHTML =
      `<p class="big-answer">do = <strong>${name}</strong></p>` +
      `<p class="hint">Key of ${name} major. The chords were ${this.chords.join(" – ")}.</p>`;
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
    const voiced = voiceProgression(this.question, doMidi);
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
    const doMidi = doMidiFor(this.key);
    const at = withCadence ? playCadence(doMidi) + 0.5 : 0;
    const r = this.scheduleQuestion(at);
    if (this.revealed) highlightChips(this.els.answer, r.times, r.durs);
    await sleep(r.len, t);
  },

  async next(t) {
    this.key = randomKey(this.key);
    this.question = makeChordQuestion(Number(settings.cLevel), Number(settings.cCount));
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
    await sleep(playCadence(doMidiFor(this.key)), t);
  },

  async playDo(t) {
    if (this.key === null) return;
    Synth.note(doMidiFor(this.key), 0, 1.2);
    await sleep(1.3, t);
  },

  reveal() {
    if (!this.question) return;
    this.revealed = true;
    this.render();
  },

  render() {
    if (this.key === null) return;
    this.els.key.textContent = `${KEYS[this.key].name} major`;
    const a = this.els.answer;
    a.textContent = "";
    const row = document.createElement("div");
    row.className = "chips";
    this.question.forEach((sym) => {
      const chip = document.createElement(this.revealed ? "button" : "span");
      chip.className = "chip" + (this.revealed ? "" : " hidden-note");
      if (this.revealed) {
        chip.type = "button";
        const c = CHORDS[sym];
        const root = chordRootName(this.key, sym);
        chip.innerHTML =
          `<span class="syl">${sym}</span>` +
          `<span class="letter">${root}${c.quality === "min" ? "m" : ""}</span>`;
        chip.title = "Play this chord";
        chip.addEventListener("click", () => {
          stopHandsFree();
          cancelAll();
          const v = voiceChord(sym, doMidiFor(this.key), null);
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

// Spell a chord root in the key (bVII in D is C, V/V in F is G...).
function chordRootName(keyPc, sym) {
  const degreeOf = { I: 0, ii: 1, iii: 2, IV: 3, iv: 3, V: 4, vi: 5, bVI: 5, bVII: 6, "V/V": 1 };
  const c = CHORDS[sym];
  const deg = degreeOf[sym];
  const alt = c.root - MAJOR_STEPS[deg];
  return letterName(keyPc, { deg, alt });
}

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
$("m-do").addEventListener("click", () => run((t) => melody.playDo(t)));
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
fillSelect($("m-keymode"), [["random", "random"], ...KEYS.map((k, i) => [i, `${k.name} major`])]);
fillSelect($("c-level"), CHORD_LEVELS.map((l) => [l.id, l.label]));

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
  else if (k === "d") click("do");
  else if (k === "s") click("slow");
  else if (k === "h") {
    e.preventDefault();
    toggleHandsFree();
  }
});

setInterval(() => tonic.tick(), 100);
setMode(settings.mode);
