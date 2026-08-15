# 2026 Fantasy Football Draft Board

A single-page draft board for a 10-team, full-PPR redraft league. Drag players
to reorder or re-tier them, click a row to mark it drafted, switch between an
overall 1–N view and a by-position tier view. Everything saves automatically
in your browser — no login, no server, no build step.

## Run it locally

Just open `index.html` in a browser. Because it uses `fetch`-free vanilla
JS/CSS, double-clicking the file works — no local server required.

If you'd rather serve it (some browsers are stricter about local files):

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Deploy to GitHub Pages

1. Create a new repository on GitHub (e.g. `draft-board`) and push these
   files to it:

   ```bash
   git init
   git add .
   git commit -m "Initial draft board"
   git branch -M main
   git remote add origin https://github.com/<your-username>/draft-board.git
   git push -u origin main
   ```

2. On GitHub, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to `Deploy from a branch`,
   branch `main`, folder `/ (root)`. Save.
4. GitHub gives you a URL a minute or two later, typically:
   `https://<your-username>.github.io/draft-board/`

That's it — no build step, no dependencies to install. Any time you edit and
push, the live site updates within a minute or so.

## How it works

- **`index.html`** — page structure.
- **`style.css`** — all visual design (dark "draft-night broadcast" theme,
  position color-coding, tier dividers).
- **`data.js`** — the starting player list: name, team, position, ADP,
  starting tier, and the ESPN/Yahoo/Sleeper ADP values used for the mismatch
  flags. This is what you'd edit or regenerate to refresh rankings.
- **`app.js`** — all the logic: rendering, drag-and-drop, search, drafted
  toggling, and `localStorage` persistence.
- **`vendor/Sortable.min.js`** — [SortableJS](https://github.com/SortableJS/Sortable)
  (MIT licensed), vendored locally so the board works even with no internet
  connection at the draft table. No other dependencies.

### Where your changes live

Everything you do on the board — reordering, re-tiering, and drafted marks —
is saved to `localStorage` under the key `ff-draft-board-v1`. That's scoped
per-browser, per-device. It is **not** shared between your phone and laptop,
and clearing your browser's site data wipes it. Click **Reset board** any
time to wipe your changes and restore the original rankings.

### Updating the player list for a future season

`data.js` is generated from a small Python script — regenerate it from a new
ADP/rankings dataset rather than hand-editing 150+ entries. Each player
object looks like this:

```js
{
  "id": "p1",
  "name": "Jahmyr Gibbs",
  "team": "DET",
  "pos": "RB",
  "overallRank": 1,
  "posRank": 1,
  "tier": 1,
  "adp": 1.5,
  "espn": 1.6,
  "yahoo": 1.6,
  "sleeper": 1.8,
  "pick": "1.01",
  "espnGap": -0.1
}
```

`tier` groups players within a position (used by the By Position view).
`espnGap` (ESPN ADP minus the average of Yahoo/Sleeper ADP) drives the
"ESPN value" / "ESPN reach" flags in the Overall view — positive means ESPN
drafts them later than the wider market, negative means earlier.

## Browser support

Works in any modern browser (Chrome, Firefox, Safari, Edge) on desktop or
mobile. Drag-and-drop works with touch too. No IE support.
