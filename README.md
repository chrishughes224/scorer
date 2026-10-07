# Scorer

A phone-friendly scorecard for family games — built for UNO, flexible enough for anything you keep score in.

It's a Progressive Web App: plain HTML/CSS/JS with no build step and no server. Scores are saved on the phone (`localStorage`), it works offline, and it can be added to the home screen as an app.

## Features

- **Game types** — UNO, UNO (lowest wins), Hearts, Golf and general "highest/lowest wins" are built in. Make your own in **Settings → New game type** by choosing:
  - who wins (highest or lowest total)
  - when the game ends (at a target score, after N rounds, or when you say)
  - how rounds are entered (everyone enters a score, or *winner takes* the points left in everyone else's hand)
  - optional UNO card calculator and negative scores
- **UNO card calculator** — tap the cards left in a hand (numbers, Skip/Reverse/+2 = 20, Wild/Wild +4 = 50) instead of adding them up.
- Live standings with progress to the target, a "deals" marker that rotates each round, and a game-over banner.
- Tap any round to fix it. Rematch rotates the seats so someone else deals first.
- Player roster with colors, win stats per game type, and JSON backup/restore.
- Keeps the screen awake during a game; light and dark mode.

## Run locally

```sh
npm start   # serves on http://localhost:5173
npm test    # scoring logic unit tests
```

To try it on your phone, open the dev server from the phone on the same Wi‑Fi (use your computer's IP), or deploy it.

## Deploy (GitHub Pages)

`.github/workflows/pages.yml` runs the tests and publishes the site on every push to `main`/`master`. Enable it once in the repo under **Settings → Pages → Source: GitHub Actions**. Then open the Pages URL on your phone and use **Share → Add to Home Screen** (iPhone) or **Install app** (Android).

When you ship changes, bump `VERSION` in `sw.js` so installed copies pick them up.

## Code layout

| File | What it does |
| --- | --- |
| `js/scoring.js` | Pure scoring rules and built-in game types (unit-tested) |
| `js/store.js` | Saves players, custom game types and games to `localStorage` |
| `js/app.js` | Screens, round-entry sheet, and UNO calculator |
| `css/styles.css` | Mobile-first styles, light/dark |
| `sw.js`, `manifest.webmanifest` | Offline cache and home-screen install |
