# Rove EarTrainer

Ear training for guitar in movable do. The app plays something; you sing it, play it on
the guitar, then show the answer to check yourself. Nothing is scored.

- **Melody:** a cadence sets the key, then a short phrase to play back. Four levels, from
  3–4 stepwise notes up to phrases with chromatic notes (fi, te, le, me, si).
- **Tonic:** a short chord loop in a random key. Find the home note (do, or la in minor) as fast as you can; a timer shows how long it took.
- **Chords:** a cadence, then chords to name by function (I, IV, V, vi…).
- **Major and minor:** each tab can use major keys, la-based minor keys, or a mix.
- **Hands-free:** plays, waits for you, shows the answer and moves on, so your hands stay on the guitar.
- **Mic test** (`mic.html`): shows the pitch your guitar is playing, using YIN pitch detection.

See [PRACTICE_PLAN.md](PRACTICE_PLAN.md) for the daily routine this app supports.

## Running it

It's a static site. Serve the folder (the mic page needs HTTPS or `localhost`):

```bash
python -m http.server 8765
```

Then open `http://localhost:8765`. On GitHub Pages it works as is, and it can be installed as an app.

## Built with

HTML, CSS, JavaScript and the Web Audio API. No build step and no dependencies.
