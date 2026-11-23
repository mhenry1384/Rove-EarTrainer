// Monophonic pitch detection using the YIN algorithm
// (de Cheveigné & Kawahara, 2002). No dependencies.
//
// detectPitch(buffer, sampleRate) -> { freq, clarity } or null
//   freq    : fundamental frequency in Hz
//   clarity : 0..1, how periodic the signal is (1 = perfectly periodic)

const PITCH_MIN_HZ = 70; // a little below low E (82.4 Hz), allows drop D
const PITCH_MAX_HZ = 1400; // above the 24th fret on the high E string (1318.5 Hz)
const YIN_THRESHOLD = 0.15;

let yinScratch = null;

function detectPitch(buf, sampleRate) {
  const tauMin = Math.max(2, Math.floor(sampleRate / PITCH_MAX_HZ));
  const tauMax = Math.min(Math.floor(sampleRate / PITCH_MIN_HZ), Math.floor(buf.length / 2));
  const W = buf.length - tauMax;
  if (W <= 0 || tauMax <= tauMin) return null;

  if (!yinScratch || yinScratch.length < tauMax + 1) yinScratch = new Float32Array(tauMax + 1);
  const d = yinScratch;

  // Step 2: difference function.
  d[0] = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0;
    for (let i = 0; i < W; i++) {
      const delta = buf[i] - buf[i + tau];
      sum += delta * delta;
    }
    d[tau] = sum;
  }

  // Step 3: cumulative mean normalized difference.
  d[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    running += d[tau];
    d[tau] = running === 0 ? 1 : (d[tau] * tau) / running;
  }

  // Step 4: first dip below the threshold, then walk down to its local minimum.
  let tau = -1;
  for (let t = tauMin; t <= tauMax; t++) {
    if (d[t] < YIN_THRESHOLD) {
      while (t + 1 <= tauMax && d[t + 1] < d[t]) t++;
      tau = t;
      break;
    }
  }
  // No dip under the threshold: fall back to the global minimum (low clarity).
  if (tau === -1) {
    let best = tauMin;
    for (let t = tauMin + 1; t <= tauMax; t++) if (d[t] < d[best]) best = t;
    tau = best;
  }

  // Step 5: parabolic interpolation for sub-sample accuracy.
  let betterTau = tau;
  if (tau > 1 && tau < tauMax) {
    const s0 = d[tau - 1];
    const s1 = d[tau];
    const s2 = d[tau + 1];
    const denom = s0 + s2 - 2 * s1;
    if (denom !== 0) betterTau = tau + (s0 - s2) / (2 * denom);
  }

  const clarity = Math.max(0, Math.min(1, 1 - d[tau]));
  return { freq: sampleRate / betterTau, clarity };
}

function freqToMidi(freq) {
  return 69 + 12 * Math.log2(freq / 440);
}

function rms(buf) {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}
