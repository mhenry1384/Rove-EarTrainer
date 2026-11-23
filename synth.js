// Small Web Audio synth with a soft electric-piano-like tone. No samples.
// All times passed in are seconds relative to "now" (0 = immediately).

const Synth = (() => {
  let ctx = null;
  let master = null;
  let wave = null;
  let volume = 0.8;
  let bus = null; // per-playback gain, replaced on stop() so stopping is instant

  function ensure() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 4;
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(comp);
      comp.connect(ctx.destination);
      const harmonics = [0, 1, 0.45, 0.22, 0.12, 0.06, 0.035, 0.02, 0.01];
      wave = ctx.createPeriodicWave(new Float32Array(harmonics.length), new Float32Array(harmonics));
      newBus();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function newBus() {
    bus = ctx.createGain();
    bus.connect(master);
  }

  function setVolume(v) {
    volume = v;
    if (master) master.gain.value = v;
  }

  const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // Play one note. at/dur in seconds from now. vel 0..1.
  function note(midi, at, dur, vel = 0.8) {
    ensure();
    const t = ctx.currentTime + 0.03 + at;
    const f = midiToFreq(midi);
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(wave);
    osc.frequency.value = f;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 0.5;
    filter.frequency.setValueAtTime(Math.min(9000, f * 10), t);
    filter.frequency.setTargetAtTime(Math.max(600, f * 2.5), t, 0.25);

    const g = ctx.createGain();
    const peak = 0.22 * vel;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.006);
    g.gain.setTargetAtTime(peak * 0.25, t + 0.006, 0.45);
    g.gain.setTargetAtTime(0, t + dur, 0.07);

    osc.connect(filter);
    filter.connect(g);
    g.connect(bus);
    osc.start(t);
    osc.stop(t + dur + 0.6);
  }

  function chord(midis, at, dur, vel = 0.55) {
    midis.forEach((m) => note(m, at, dur, vel));
  }

  // Silence everything that is playing or scheduled.
  function stop() {
    if (!ctx) return;
    const old = bus;
    old.gain.setTargetAtTime(0, ctx.currentTime, 0.015);
    setTimeout(() => old.disconnect(), 200);
    newBus();
  }

  return { ensure, note, chord, stop, setVolume };
})();
