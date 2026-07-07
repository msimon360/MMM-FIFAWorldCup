# MMM-BracketEngine

A [MagicMirror²](https://github.com/MichMich/MagicMirror) module that displays a live, mirrored knockout tournament bracket for any sport. Providers fetch data from external APIs and normalize it into a common format; the engine renders it with a CSS Grid layout.

Seeded from [MMM-FIFAWorldCup](https://github.com/msimon360/mmm-fifaworldcup) and generalized for multi-sport support.

---

## Installation

```bash
cd ~/MagicMirror/modules
git clone https://github.com/msimon360/MMM-BracketEngine
cd MMM-BracketEngine
npm install
```

Add to your `config/config.js`:

```js
{
  module: "MMM-BracketEngine",
  position: "bottom_bar",
  config: {
    provider: "fifa",
    providerConfig: {
      seasonId: "285023",
      language: "en"
    },
    updateInterval: 3 * 60 * 1000,
    colored: true,
    showDates: true,
    showPenalties: false,
    showFlags: true,
    showLastUpdated: true
  }
}
```

Restart MagicMirror after installing: `pm2 restart mm`

---

## Configuration

| Option | Default | Description |
|---|---|---|
| `provider` | `"fifa"` | Data provider name (`fifa`, `static`) |
| `providerConfig` | `{}` | Provider-specific settings (see below) |
| `updateInterval` | `180000` | Milliseconds between data refreshes |
| `animationSpeed` | `1000` | DOM update fade speed in ms |
| `header` | `null` | Override module header; `null` uses provider `meta.title` |
| `colored` | `true` | Highlight match winners in green |
| `showDates` | `true` | Show match dates under each card |
| `showPenalties` | `false` | Show penalty shootout scores |
| `showFlags` | `true` | Show team flag emojis |
| `showLastUpdated` | `true` | Show last-updated timestamp |

### FIFA provider

```js
provider: "fifa",
providerConfig: {
  seasonId: "285023",   // FIFA season ID
  language: "en",
  title: "FIFA World Cup 2026"  // optional header override in payload
}
```

Data source: `https://api.fifa.com/api/v3/seasonbracket/season/{seasonId}`

### Static provider (offline / testing)

```js
provider: "static",
providerConfig: {
  filePath: "modules/MMM-BracketEngine/data/placeholder-bracket.json"
}
```

Or pass inline data:

```js
providerConfig: {
  bracketData: { meta: { ... }, rounds: [ ... ] }
}
```

---

## Layout

The bracket is mirrored left/right with the trophy in the centre:

```
[R32][R16][QF][SF]  🏆  [SF][QF][R16][R32]
```

Smaller brackets (e.g. 16-team) omit earlier rounds and adjust column count automatically.

---

## Common Data Schema

All providers must return this shape:

```js
{
  meta: {
    title: "Tournament Name",   // required
    sport: "soccer",            // required
    icon: "⚽",                 // optional
    updatedAt: "2026-07-06T..." // optional
  },
  rounds: [
    {
      id: "R16",                // R32, R16, QF, SF, 3RD, F
      name: "Round of 16",
      matches: [
        {
          id: 1,
          status: "final",      // scheduled | live | final
          teamA: { name: "Germany", abbr: "GER" },
          teamB: { name: "France", abbr: "FRA" },
          // optional:
          date: "Jul 6",
          scoreA: 2, scoreB: 1,
          penA: 4, penB: 3,
          winner: "GER"
        }
      ]
    }
  ]
}
```

Validation runs in `node_helper.js` before data reaches the frontend. Invalid payloads trigger `BE_BRACKET_ERROR`.

---

## Writing a Provider

1. Create `providers/MyProvider.js` extending `BaseProvider`
2. Implement `async fetchBracket()` returning the schema above
3. Register in `node_helper.js`:

```js
const MyProvider = require("./providers/MyProvider");
const PROVIDERS = { fifa: FifaProvider, static: StaticProvider, mysport: MyProvider };
```

Provider-specific match ordering (e.g. FIFA R32 reorder) belongs in the provider, not the engine.

---

## Architecture

```
MMM-BracketEngine.js  ←→  node_helper.js  ←→  providers/
     (render)              (router)            (fifa, static, …)
```

Socket notifications: `BE_GET_BRACKET`, `BE_BRACKET_RESULT`, `BE_BRACKET_ERROR`

`MMM-BracketEngine` and `MMM-FIFAWorldCup` can coexist on the same mirror (different socket prefixes).

---

## Testing

```bash
npm test
```

Validates the placeholder bracket against the schema.

---

## Troubleshooting

- **"Loading bracket…" forever** — check `pm2 logs mm` for `[MMM-BracketEngine]` errors. Confirm network access if using the FIFA provider.
- **Stale data after error** — the module keeps the last good bracket and shows a dimmed error message.
- **Layout looks wrong** — full restart required (`pm2 restart mm`), not just a browser refresh.

---

## License

MIT
