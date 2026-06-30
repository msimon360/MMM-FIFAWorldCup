# MMM-FIFAWorldCup

A [MagicMirror²](https://github.com/MichMich/MagicMirror) module that displays a live, mirrored FIFA World Cup 2026 knockout bracket — Round of 32 through the Final, with the trophy in the centre.

**Data source:** ESPN's public soccer API (no API key required), with a built-in placeholder bracket as a fallback so the module always shows something even if ESPN is unreachable.

---

## Installation

```bash
cd ~/MagicMirror/modules
git clone https://github.com/YOUR_USERNAME/MMM-FIFAWorldCup
# — or just copy the folder over —
cd MMM-FIFAWorldCup
npm install
```

---

## Configuration

Add this block to your `config/config.js`:

```js
{
  module: "MMM-FIFAWorldCup",
  position: "bottom_bar",       // full-width regions work best for the bracket
  config: {
    updateInterval: 3 * 60 * 1000,  // refresh every 3 min (ms)
    colored: true,                   // highlight match winners in green
    showDates: true,                 // set false to hide match dates (tighter cards on small screens)
    animationSpeed: 1000,            // DOM update fade speed (ms)
  }
}
```

### Config options

| Option | Default | Description |
|---|---|---|
| `updateInterval` | `180000` | Milliseconds between data refreshes |
| `colored` | `true` | Highlight match winners in green |
| `showDates` | `true` | Show match dates under each card — turn off for tighter cards on small screens |
| `animationSpeed` | `1000` | DOM update fade speed in ms |

---

## Layout

The bracket is mirrored left/right with the trophy in the centre, so it reads outward-in on both sides:

```
[R32][R16][QF][SF]  🏆  [SF][QF][R16][R32]
```

Round of 32 sits at each screen edge, narrowing inward through Round of 16, Quarter-Finals, and Semi-Finals, meeting at the trophy in the middle. This keeps the bracket compact and balanced on wide mirror displays instead of running off one side of the screen.

---

## How it works

1. **`node_helper.js`** runs on the Pi and calls ESPN's public soccer API (`site.api.espn.com`) every `updateInterval` ms, requesting the FIFA World Cup 2026 bracket.
2. If the dedicated bracket endpoint isn't populated yet, it falls back to building the bracket from the live scoreboard feed.
3. If neither source returns usable knockout-stage data (e.g. early in the tournament before the bracket is set), it falls back to a built-in placeholder bracket based on the official draw, so the module never shows a blank screen.
4. The bracket data is sent to the front-end via `sendSocketNotification`.
5. **`MMM-FIFAWorldCup.js`** builds the mirrored bracket as DOM elements in `getDom()` — splitting each round's matches into a top half (left side of the mirror) and bottom half (right side), with SVG connector lines joining each pair toward the next round.
6. The module re-fetches and re-renders automatically every `updateInterval`.

---

## Troubleshooting

- **Module shows "Loading bracket…" forever** — check `pm2 logs mm` for errors from `[MMM-FIFAWorldCup]`. This usually means the node helper's fetch is failing silently; confirm your Pi has internet access to `site.api.espn.com`.
- **Bracket shows but layout looks off** — after editing any module file, you need a **full restart** (`pm2 restart mm`), not just a browser refresh. Electron can cache stale CSS/JS.
- **Changes don't seem to apply at all** — confirm the file actually copied over correctly:
  ```bash
  grep -n "showDates" ~/MagicMirror/modules/MMM-FIFAWorldCup/MMM-FIFAWorldCup.js
  ```
  If that returns nothing, the file on the Pi is stale — re-copy it and restart.
- **`cheerio` not found** — run `npm install` inside the module folder (only needed if you re-enable the FIFA page scrape fallback in `node_helper.js`).
- **Node.js < 18** — `node-fetch` v2 is included as a dependency for older Node versions; Node 18+ uses the built-in global `fetch` instead.

---

## License

MIT