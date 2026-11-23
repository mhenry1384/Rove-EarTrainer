# Agent instructions

Rove EarTrainer is a static web app (plain HTML/CSS/JS, no build step, no dependencies)
that will be hosted on GitHub Pages from `main`. Keep it that way: no frameworks, no npm,
no bundler. Any library must be vendored as a local file.

## Why this app exists

The owner plays guitar, is decent at **movable-do solfege** (not fast yet), and wants to
**play on guitar what they hear in their head** quickly and without mistakes. Melodies first;
later, chords by function in the key (I, IV, V, vi, then ii, iii, borrowed chords).
They also want to find a song's tonic fast (currently it takes them 30–60 s).

The owner's daily routine and milestones are in `PRACTICE_PLAN.md`. The app should support
blocks 1 (tonic and degrees) and 3 (melody playback) of that plan, plus the weekly test.

## Current state (as of 2026-11-13)

Only a **microphone test page** exists. It is for checking that guitar pitch detection
through a mic is reliable before building the real trainer.

- `pitch.js`: YIN pitch detection written from scratch. Range 70–1400 Hz, threshold 0.15,
  parabolic interpolation, returns `{ freq, clarity }`. Also `freqToMidi()` and `rms()`.
- `app.js`: microphone input, live display and note segmentation:
  - `getUserMedia` with echoCancellation, noiseSuppression and autoGainControl all **off**
    (voice processing distorts instrument pitch).
  - Analysis runs on `setInterval` every 15 ms, **not** `requestAnimationFrame`
    (rAF doesn't fire in some contexts, such as the Claude browser pane, and audio analysis
    shouldn't depend on rendering).
  - A note is **committed** when one semitone holds steady for `stableMs` (default 60) with
    clarity ≥ 0.85 and level ≥ 0.01 RMS. The same note is committed again only after a new
    pluck (level jumps 1.6× above the quietest of the last ~6 frames) or 120 ms of silence.
  - The ms figure shown is the time from the pluck (or, for legato, from the pitch change) to commit.
  - Settings are saved in localStorage under `rove-eartrainer-mictest`.
  - Solfege is chromatic movable do: do ra re me mi fa fi sol le la te ti.

**Verified:** in Node, 147 of 147 synthetic guitar-like tones from E2 to E6 were detected
correctly, even with a very weak fundamental. In the browser, with a fake mic stream made
from an oscillator, every note of a test phrase was committed, including repeated notes and
a legato run, about 60–80 ms after each note started.

**Not yet verified:** a real guitar through a real microphone. That is the owner's next step.
Ask how it went before building the trainer. Known risk areas: octave errors on low strings
with laptop mics, repeated-note detection, fast passages.

## Planned app (not built yet)

1. **Melody playback mode (main feature).** Play a cadence (I–IV–V–I) to set the key, then a
   short melody. The user plays it back on guitar and the mic scores it.
   - Score by **pitch class** (ignore octave, or allow ±1 octave) so octave errors don't matter.
   - Track first-try accuracy and response time.
   - Difficulty ramps up: 3–4 diatonic notes → 5–8 notes with leaps → chromatic notes
     (te, fi, si, me, le). Random keys.
2. **Tonic speed mode.** Play a short progression in a random key, and time how fast the user
   plays the tonic.
3. **Chord mode.** Polyphonic detection is NOT reliable in a browser, so answer by tapping a
   multiple-choice button (I, IV, V, vi…) or by playing just the bass note.
4. **Progress and weekly test.** Store stats and the weekly test numbers from PRACTICE_PLAN.md
   (average tonic time, first-try phrases out of 10), and chart them.
5. Sound playback through the Web Audio API (simple synth, or a few local piano samples).

## Conventions (match the owner's other Rove apps, e.g. ../Rove TransposablePiano)

When this becomes the real app, turn it into an installable PWA like the other Rove apps:
`version.js` with `APP_VERSION` (bump it on every change to app files), a network-first `sw.js`
using `cache: "no-cache"`, `skipWaiting()` + `clients.claim()`, `manifest.webmanifest`,
`icons/`, and a "Version N" footer. Copy the service worker setup and its AGENTS.md rules from
`../Rove TransposablePiano`.

## Running locally

Microphone access needs HTTPS or localhost:

```bash
python -m http.server 8765
```

Then open http://localhost:8765. The folder is not a git repo yet; the owner will push it to
GitHub and publish it with GitHub Pages.
