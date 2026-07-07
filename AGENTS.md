# AGENTS.md

## Cursor Cloud specific instructions

### What this repo is
`MMM-FIFAWorldCup` is a **[MagicMirror²](https://github.com/MagicMirrorOrg/MagicMirror) module**, not a standalone app. It has no `dev`/`start`/`test`/`lint` scripts of its own (see `package.json`). The two runtime pieces are:
- `node_helper.js` — backend helper that runs in the MagicMirror node process and fetches the bracket from FIFA's public API (`https://api.fifa.com/api/v3/seasonbracket/season/285023`, no API key).
- `MMM-FIFAWorldCup.js` + `MMM-FIFAWorldCup.css` — front-end that renders the mirrored bracket in the browser.

The update script installs this module's deps (`npm install`). There is no lint/test suite; use `node --check MMM-FIFAWorldCup.js node_helper.js` for a quick syntax sanity check.

### Running / testing it end-to-end (requires a MagicMirror² host)
The module can only render inside a MagicMirror² host, which is **not** part of this repo and must be set up per session (kept out of the update script because it's a large, external dependency). Steps that worked:

1. **Node version:** MagicMirror ≥2.37 needs Node ≥22.21.1, but `/exec-daemon/node` (v22.14) sits ahead of nvm on `PATH` and shadows it. Use nvm and prepend its bin explicitly:
   ```bash
   export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"
   nvm install 24 >/dev/null; export PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH"
   ```
   (The module itself works on the default Node too; only the host needs the newer version.)
2. **Install host + link module:**
   ```bash
   git clone --depth 1 https://github.com/MagicMirrorOrg/MagicMirror.git ~/MagicMirror
   cd ~/MagicMirror && npm install
   ln -sfn /workspace ~/MagicMirror/modules/MMM-FIFAWorldCup
   ```
3. **Config:** create `~/MagicMirror/config/config.js` with `ipWhitelist: []` (allow all) and a `modules` entry for `MMM-FIFAWorldCup` at e.g. `position: "bottom_bar"`.
4. **Run headless (serveronly, no Electron):**
   ```bash
   cd ~/MagicMirror && npm run server   # serves on http://localhost:8080
   ```
   Then open `http://localhost:8080` in a browser to view the bracket.

### Non-obvious gotchas
- **The FIFA fetch only fires when a browser client connects.** `npm run server` alone will not log any fetch; the front-end module triggers `WC_GET_BRACKET` on page load. Look for `[MMM-FIFAWorldCup] HTTP 200` / `Parsed 6 rounds` in the server log after loading the page.
- **`api.fifa.com` is reachable from the cloud VM** and returns the full real bracket (6 knockout stages). The README mentions a placeholder fallback, but the current `node_helper.js` sends `WC_BRACKET_ERROR` on failure (no placeholder) — so if the module is stuck on "Loading bracket…", check network access to `api.fifa.com`.
- **Editing module files requires restarting the MagicMirror process** (there is no hot reload for module code); a browser refresh alone won't pick up backend changes.
