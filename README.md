# Rove EarTrainer

An ear-training app for guitar. The goal: hear a melody, play it back on the guitar,
and have the app score you through the microphone.

**Current state:** a microphone test page that shows the pitch it hears from your guitar
and logs each note you play. It's for checking that pitch detection is reliable enough before
building the full trainer.

See [PRACTICE_PLAN.md](PRACTICE_PLAN.md) for the daily practice routine this app supports.

## Running it

Browsers only allow microphone access on secure pages (HTTPS or `localhost`), so serve the folder:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`. On GitHub Pages it works as is.

## Files

- `index.html`: page structure
- `styles.css`: styling (light and dark)
- `pitch.js`: YIN pitch detection, no dependencies
- `app.js`: microphone input, note tracking and display

## Built with

HTML, CSS, JavaScript and the Web Audio API. No build step and no dependencies.
