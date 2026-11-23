# Agent instructions

Rove EarTrainer is a static PWA (plain HTML/CSS/JS, no build step, no dependencies) hosted
on GitHub Pages from `main` (repo `mhenry1384/Rove-EarTrainer`). Pushing to `main` deploys it.
Keep it that way: no frameworks, no npm, no bundler. Any library must be vendored as a local file.

## Why this app exists

The owner plays guitar, is decent at **movable-do solfege** (not fast yet), and wants to
**play on guitar what they hear in their head** quickly and without mistakes. Melodies first;
later, chords by function in the key. They also want to find a song's tonic fast.
Their daily routine is in `PRACTICE_PLAN.md`.

## No scoring (decided 2026-11-23)

The owner does **not** want exercises scored or stats tracked. They hear for themselves whether
they played it right. The app plays things and has a "Show answer" button; that's it.
Don't add scoring, grading, streaks or progress charts unless they ask.
The microphone pitch detection works but is not part of the trainer; it lives on `mic.html`.

## Files

Every tab has a major / minor / mixed setting. Minor is **la-based** (the owner's choice):
syllables are counted from the relative major's do, the cadence is i–iv–V–i (with si), and
minor chords use minor-key numerals (i, iv, V, VI, VII...). A key is `{ tonic, minor }`.

- `index.html`, `app.js`: the trainer. Three tabs:
  - **Melody**: cadence (I–IV–V–I) sets the key, then a short phrase. Levels 1–4 (steps →
    leaps → chromatic fi/te/le/me/si). Random or fixed key, new key every N phrases.
    The answer shows syllables (↓/↑ for octave), optional letter names; chips are clickable.
  - **Tonic**: a 4-chord loop (rotated so it rarely starts on I) plus an optional tune, in a
    random key. A timer runs until "Show tonic". The time is shown, never stored.
  - **Chords**: cadence then 1, 2 or 4 chords; the answer shows numerals and chord names.
  - **Hands-free** (all tabs): play → wait → (replay → wait) → show answer → next, so both hands
    stay on the guitar. Any button stops it.
- `music.js`: theory and generators (melodies, chord voicing, spelling). No DOM, no audio,
  so it can be tested in Node with `eval`.
- `synth.js`: Web Audio synth (`Synth.note/chord/stop`). No samples.
- `mic.html`, `mic.js`, `pitch.js`: microphone test page. YIN pitch detection; analysis runs
  on `setInterval` (not rAF); voice processing is off in `getUserMedia`.
- Settings are saved in localStorage under `rove-eartrainer` (mic page: `rove-eartrainer-mictest`).

## Updates must show up fast

- **Bump `APP_VERSION` in `version.js` with every change to app files**
  (HTML, CSS, JS, manifest, icons). It drives the service worker cache name
  (`eartrainer-v<N>`) and the "Version N" footer. Don't hard-code the version elsewhere.
- **Add new app files to `ASSETS` in `sw.js`** so they work offline.
- **Keep the service worker network-first with `cache: "no-cache"`**. GitHub Pages sends
  `Cache-Control: max-age=600`; without `no-cache`, online loads can be 10 minutes stale.
- **Keep the registration in `index.html` as it is:** `updateViaCache: "none"`,
  `registration.update()` on `visibilitychange`, and a single reload on `controllerchange`
  (skipped on first install).
- **Keep `skipWaiting()` and `clients.claim()`** in `sw.js`.
- Don't add long-lived caching, hashed filenames, or "update available, tap to refresh" prompts.

## Ideas not built yet

- Real songs / longer phrases with rhythm.

## Running locally

```bash
python -m http.server 8765
```

Then open http://localhost:8765 (the mic page needs HTTPS or localhost).
