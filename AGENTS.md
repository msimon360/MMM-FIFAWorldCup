# AGENTS.md

## Cursor Cloud specific instructions

This repository is a **MagicMirror² module** (`MMM-FIFAWorldCup`), not a standalone application. It has no build step, no test suite, and no lint config of its own. It runs *inside* a MagicMirror² host:

- Front-end: `MMM-FIFAWorldCup.js` (runs in the browser, builds the bracket DOM) + `MMM-FIFAWorldCup.css`.
- Back-end: `node_helper.js` (runs in the MagicMirror Node process, fetches the FIFA bracket API and returns parsed data over a socket notification).
- Data source: FIFA's public bracket API (`https://api.fifa.com/api/v3/seasonbracket/season/285023?language=en`, no API key). The API is reachable from the Cloud VM and currently returns fully populated knockout data.

### Running / testing the module in a MagicMirror host

A MagicMirror host is cloned at `/home/ubuntu/MagicMirror` (outside this repo, so it is not committed). This repo is symlinked into it at `/home/ubuntu/MagicMirror/modules/MMM-FIFAWorldCup`, and `config/config.js` there already loads this module.

Non-obvious gotchas:

- **Node version:** MagicMirror 2.37 requires Node `>=22.21.1`. The default `node` on the VM (`/exec-daemon/node`) is v22.14 and takes precedence over `nvm use`. Use the nvm build explicitly by prepending it to PATH:
  `export PATH="/home/ubuntu/.nvm/versions/node/v22.22.2/bin:$PATH"`. This module's own code only needs Node 18+; the version bump is purely for the host.
- **Start the host (serveronly, no Electron/GUI needed):** from `/home/ubuntu/MagicMirror` run `npm run server`. It listens on `http://localhost:8080`. `config/config.js` sets `address: "0.0.0.0"` and `ipWhitelist: []` so a browser can reach it.
- **The FIFA fetch is triggered by the front-end, not on server start.** `node_helper.js` only fetches after a browser loads the page and the module sends `WC_GET_BRACKET`. Watch `[MMM-FIFAWorldCup]` lines in the server log to confirm `HTTP 200` / `Parsed N rounds`.
- If the host is missing (fresh VM without the snapshot), recreate it: `git clone --depth 1 https://github.com/MagicMirrorOrg/MagicMirror.git ~/MagicMirror`, symlink this repo into `~/MagicMirror/modules/MMM-FIFAWorldCup`, add a `config/config.js` that lists the module, then `npm run install-mm` and `npm run server` (using the Node 22.22.2 PATH above).

### Module dependencies

Run `npm install` in the repo root to install `cheerio` and `node-fetch` (used as a fallback fetch for Node <18; Node 18+ uses global `fetch`).
