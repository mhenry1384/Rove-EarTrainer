// Rove EarTrainer – microphone pitch test.
// Shows the live pitch and a log of "committed" notes, using the same
// note-segmentation rules a scored exercise would use.

const NOTE_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const KEY_NAMES = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
// Chromatic movable-do syllables relative to the key's tonic.
const SOLFEGE = ["do", "ra", "re", "me", "mi", "fa", "fi", "sol", "le", "la", "te", "ti"];

const BUFFER_SIZE = 2048;
const SILENCE_RESET_MS = 120; // silence this long lets the same note be logged again
const ONSET_RATIO = 1.6; // level jump that counts as a new pluck
const MAX_LOG = 40;
const TICK_MS = 15; // analysis interval (timer, not rAF, so it never pauses for rendering)

const $ = (id) => document.getElementById(id);
const els = {
  start: $("start"),
  key: $("key"),
  clear: $("clear"),
  status: $("status"),
  noteName: $("note-name"),
  noteOctave: $("note-octave"),
  solfege: $("solfege"),
  needle: $("cents-needle"),
  freq: $("freq"),
  cents: $("cents"),
  clarity: $("clarity"),
  levelBar: $("level-bar"),
  levelMin: $("level-min"),
  log: $("log"),
  logEmpty: $("log-empty"),
  clarityMin: $("clarity-min"),
  clarityOut: $("clarity-out"),
  levelMinInput: $("level-min-input"),
  levelOut: $("level-out"),
  stableMs: $("stable-ms"),
  stableOut: $("stable-out"),
};

const settings = { clarityMin: 0.85, levelMin: 0.01, stableMs: 60, key: 0 };

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem("rove-eartrainer-mictest") || "{}");
    Object.assign(settings, saved);
  } catch {}
}
function saveSettings() {
  try {
    localStorage.setItem("rove-eartrainer-mictest", JSON.stringify(settings));
  } catch {}
}

// ---------- UI setup ----------
loadSettings();
KEY_NAMES.forEach((name, i) => {
  const opt = document.createElement("option");
  opt.value = String(i);
  opt.textContent = name;
  els.key.appendChild(opt);
});
els.key.value = String(settings.key);
els.clarityMin.value = settings.clarityMin;
els.levelMinInput.value = settings.levelMin;
els.stableMs.value = settings.stableMs;

function syncOutputs() {
  els.clarityOut.textContent = Number(settings.clarityMin).toFixed(2);
  els.levelOut.textContent = Number(settings.levelMin).toFixed(3);
  els.stableOut.textContent = `${settings.stableMs} ms`;
  els.levelMin.style.left = `${levelToPct(settings.levelMin)}%`;
}

els.key.addEventListener("change", () => {
  settings.key = Number(els.key.value);
  saveSettings();
});
els.clarityMin.addEventListener("input", () => {
  settings.clarityMin = Number(els.clarityMin.value);
  syncOutputs();
  saveSettings();
});
els.levelMinInput.addEventListener("input", () => {
  settings.levelMin = Number(els.levelMinInput.value);
  syncOutputs();
  saveSettings();
});
els.stableMs.addEventListener("input", () => {
  settings.stableMs = Number(els.stableMs.value);
  syncOutputs();
  saveSettings();
});
els.clear.addEventListener("click", () => {
  els.log.textContent = "";
  els.logEmpty.hidden = false;
});

// Level meter on a log scale: 0.001 .. 0.3 RMS
function levelToPct(level) {
  const lo = Math.log10(0.001);
  const hi = Math.log10(0.3);
  const v = (Math.log10(Math.max(level, 0.001)) - lo) / (hi - lo);
  return Math.max(0, Math.min(100, v * 100));
}

function noteLabel(midi) {
  return { name: NOTE_NAMES[((midi % 12) + 12) % 12], octave: Math.floor(midi / 12) - 1 };
}
function solfegeFor(midi) {
  return SOLFEGE[(((midi - settings.key) % 12) + 12) % 12];
}

// ---------- Audio ----------
let audioCtx = null;
let analyser = null;
let stream = null;
let buf = null;
let running = false;
let timer = null;

els.start.addEventListener("click", async () => {
  if (running) {
    stop();
    return;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        // Voice processing distorts instrument pitch and level; turn it all off.
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
  } catch (err) {
    els.status.textContent = `Couldn't open the microphone: ${err.message}`;
    return;
  }
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const source = audioCtx.createMediaStreamSource(stream);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = BUFFER_SIZE;
  if (audioCtx.state === "suspended") await audioCtx.resume();
  source.connect(analyser);
  buf = new Float32Array(BUFFER_SIZE);
  running = true;
  resetTracker();
  els.start.textContent = "Stop microphone";
  const track = stream.getAudioTracks()[0];
  els.status.textContent = `Listening (${track ? track.label || "microphone" : "microphone"}, ${audioCtx.sampleRate} Hz).`;
  timer = setInterval(tick, TICK_MS);
});

function stop() {
  running = false;
  clearInterval(timer);
  if (stream) stream.getTracks().forEach((t) => t.stop());
  if (audioCtx) audioCtx.close();
  stream = null;
  audioCtx = null;
  els.start.textContent = "Start microphone";
  els.status.textContent = "Microphone off.";
  showLive(null);
}

// ---------- Note tracking ----------
// A note is "committed" (logged) when one semitone holds steady for stableMs.
// The same note is logged again only after a new pluck (level jump) or silence.
const tracker = {};
function resetTracker() {
  tracker.levels = []; // recent RMS values for onset detection
  tracker.armed = true; // true when the next stable note may be logged
  tracker.lastCommitted = null;
  tracker.candMidi = null;
  tracker.candSince = 0;
  tracker.onsetAt = performance.now();
  tracker.silentSince = null;
}

function tick() {
  if (!running) return;
  const now = performance.now();
  analyser.getFloatTimeDomainData(buf);
  const level = rms(buf);
  els.levelBar.style.width = `${levelToPct(level)}%`;

  // Silence
  if (level < settings.levelMin) {
    if (tracker.silentSince === null) tracker.silentSince = now;
    if (now - tracker.silentSince > SILENCE_RESET_MS) {
      tracker.armed = true;
      tracker.lastCommitted = null;
    }
    tracker.candMidi = null;
    tracker.levels.push(level);
    if (tracker.levels.length > 6) tracker.levels.shift();
    showLive(null);
    return;
  }
  if (tracker.silentSince !== null) tracker.onsetAt = now;
  tracker.silentSince = null;

  // Onset: level jumped well above the quietest recent frame.
  const recentMin = tracker.levels.length ? Math.min(...tracker.levels) : 0;
  if (tracker.levels.length >= 3 && level > recentMin * ONSET_RATIO && level > settings.levelMin * 1.5) {
    tracker.armed = true;
    tracker.candMidi = null;
    tracker.onsetAt = now;
  }
  tracker.levels.push(level);
  if (tracker.levels.length > 6) tracker.levels.shift();

  const result = detectPitch(buf, audioCtx.sampleRate);
  if (!result || result.clarity < settings.clarityMin) {
    tracker.candMidi = null;
    showLive(result, true);
    return;
  }
  showLive(result, false);

  const midi = Math.round(freqToMidi(result.freq));
  if (midi !== tracker.candMidi) {
    tracker.candMidi = midi;
    tracker.candSince = now;
  } else if (now - tracker.candSince >= settings.stableMs && (tracker.armed || midi !== tracker.lastCommitted)) {
    // Plucked notes: time since the pluck. Legato notes: time since the pitch changed.
    const since = tracker.armed ? tracker.onsetAt : tracker.candSince;
    commitNote(midi, result, Math.round(now - since));
    tracker.armed = false;
    tracker.lastCommitted = midi;
  }
}

function showLive(result, unclear) {
  if (!result) {
    els.noteName.textContent = "–";
    els.noteOctave.textContent = "";
    els.solfege.innerHTML = "&nbsp;";
    els.freq.textContent = "–";
    els.cents.textContent = "–";
    els.clarity.textContent = "–";
    els.needle.style.left = "50%";
    els.noteName.parentElement.classList.remove("unclear");
    return;
  }
  const exact = freqToMidi(result.freq);
  const midi = Math.round(exact);
  const cents = Math.round((exact - midi) * 100);
  const { name, octave } = noteLabel(midi);
  els.noteName.textContent = name;
  els.noteOctave.textContent = octave;
  els.solfege.textContent = solfegeFor(midi);
  els.freq.textContent = `${result.freq.toFixed(1)} Hz`;
  els.cents.textContent = `${cents > 0 ? "+" : ""}${cents}`;
  els.clarity.textContent = result.clarity.toFixed(2);
  els.needle.style.left = `${50 + cents}%`;
  els.noteName.parentElement.classList.toggle("unclear", unclear);
}

function commitNote(midi, result, latencyMs) {
  const { name, octave } = noteLabel(midi);
  const li = document.createElement("li");
  li.innerHTML =
    `<span class="log-note">${name}<sub>${octave}</sub></span>` +
    `<span class="log-sol">${solfegeFor(midi)}</span>` +
    `<span class="log-ms">${latencyMs} ms</span>`;
  els.log.prepend(li);
  while (els.log.children.length > MAX_LOG) els.log.lastChild.remove();
  els.logEmpty.hidden = true;
}

syncOutputs();
