/* MMM-FIFAWorldCup.js — Mirrored bracket edition
 *
 * Layout (visual, left→right):
 *   [R32][R16][QF][SF] 🏆 [SF][QF][R16][R32]
 *
 * The right half uses flex-direction:row-reverse so the DOM order
 * SF→QF→R16→R32 renders visually as R32←R16←QF←SF from the screen
 * edge inward to the trophy.
 */

Module.register("MMM-FIFAWorldCup", {

  defaults: {
    updateInterval: 3 * 60 * 1000,
    animationSpeed: 1000,
    colored: true,
    showDates: true,   // set false to hide match dates — helps on smaller screens
  },

  start() {
    Log.info(`[${this.name}] Starting`);
    this.bracket     = null;
    this.loaded      = false;
    this.lastUpdated = null;
    this.scheduleUpdate(0);
  },

  getStyles() { return ["MMM-FIFAWorldCup.css"]; },
  getHeader()  { return "⚽ FIFA World Cup 2026"; },

  // ── DOM ─────────────────────────────────────────────────────────────────────

  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "wc-wrapper";

    if (!this.loaded) {
      wrapper.innerHTML = `<span class="dimmed light small">Loading bracket…</span>`;
      return wrapper;
    }
    if (!this.bracket || !this.bracket.length) {
      wrapper.innerHTML = `<span class="dimmed light small">No bracket data yet.</span>`;
      return wrapper;
    }

    const rounds  = this.bracket;
    const r32 = rounds.find(r => r.id === "R32");
    const r16 = rounds.find(r => r.id === "R16");
    const qf  = rounds.find(r => r.id === "QF");
    const sf  = rounds.find(r => r.id === "SF");
    const fin = rounds.find(r => r.id === "F");

    const h    = arr => Math.ceil(arr.length / 2);
    const top  = r   => r ? r.matches.slice(0, h(r.matches)) : [];
    const bot  = r   => r ? r.matches.slice(h(r.matches))    : [];

    // Champion
    let champion = null;
    if (fin && fin.matches[0] && fin.matches[0].winner) {
      const m = fin.matches[0];
      champion = (m.winner === m.teamA?.abbr ? m.teamA : m.teamB)?.name || null;
    }

    const bracketEl = document.createElement("div");
    bracketEl.className = "wc-bracket";

    // ── Left half: DOM order R32→R16→QF→SF, flex-direction:row ──
    //    Visually: R32 at screen edge, SF nearest trophy  ✓
    const leftHalf = document.createElement("div");
    leftHalf.className = "wc-half wc-half-left";
    [
      { id:"R32", matches: top(r32) },
      { id:"R16", matches: top(r16) },
      { id:"QF",  matches: top(qf)  },
      { id:"SF",  matches: top(sf)  },
    ].forEach(({ id, matches }, i, arr) => {
      leftHalf.appendChild(
        this._buildRoundCol(id, matches, "left", i === 0, i === arr.length - 1)
      );
    });

    // ── Centre ──
    const centre = document.createElement("div");
    centre.className = "wc-center";
    const trophy = document.createElement("div");
    trophy.className = "wc-trophy";
    trophy.textContent = "🏆";
    centre.appendChild(trophy);
    if (champion) {
      const el = document.createElement("div");
      el.className = "wc-champion-name";
      el.textContent = champion;
      centre.appendChild(el);
    }

    // ── Right half: DOM order R32→R16→QF→SF, flex-direction:row-reverse ──
    //    row-reverse renders last child (SF) leftmost → nearest trophy.
    //    First child (R32) renders rightmost → at the screen edge.  ✓
    const rightHalf = document.createElement("div");
    rightHalf.className = "wc-half wc-half-right";
    [
      { id:"R32", matches: bot(r32) },
      { id:"R16", matches: bot(r16) },
      { id:"QF",  matches: bot(qf)  },
      { id:"SF",  matches: bot(sf)  },
    ].forEach(({ id, matches }, i, arr) => {
      rightHalf.appendChild(
        this._buildRoundCol(id, matches, "right", i === 0, i === arr.length - 1)
      );
    });

    bracketEl.appendChild(leftHalf);
    bracketEl.appendChild(centre);
    bracketEl.appendChild(rightHalf);
    wrapper.appendChild(bracketEl);

    if (this.lastUpdated) {
      const ts = document.createElement("div");
      ts.className = "wc-updated";
      ts.textContent = `Updated: ${this.lastUpdated}`;
      wrapper.appendChild(ts);
    }

    return wrapper;
  },

  // ── Round column ────────────────────────────────────────────────────────────

  _buildRoundCol(id, matches, side, isOutermost, isInnermost) {
    const col = document.createElement("div");
    col.className = "wc-round";

    const title = document.createElement("div");
    title.className = "wc-round-title";
    title.textContent = this._roundLabel(id);
    col.appendChild(title);

    const matchesEl = document.createElement("div");
    matchesEl.className = "wc-matches";

    matches.forEach((m, i) => {
      const wrap = document.createElement("div");
      wrap.className = "wc-match-wrap";

      const card   = this._buildCard(m);
      const cIn    = this._connIn();
      const cOut   = this._connOut(i);

      if (side === "left") {
        // Left: [cIn?][card][cOut?]   cIn from outer round, cOut brackets toward trophy
        if (!isOutermost) wrap.appendChild(cIn);
        wrap.appendChild(card);
        if (!isInnermost) wrap.appendChild(cOut);
      } else {
        // Right (row-reversed): visually this column is flipped, so connectors swap sides.
        // cOut goes on the LEFT of the card (toward trophy, which is to the left after flip)
        // cIn  goes on the RIGHT (from outer round, which is to the right after flip)
        if (!isInnermost) wrap.appendChild(cOut);
        wrap.appendChild(card);
        if (!isOutermost) wrap.appendChild(cIn);
      }

      matchesEl.appendChild(wrap);
    });

    col.appendChild(matchesEl);
    return col;
  },

  // Straight horizontal stub (incoming from previous round)
  _connIn() {
    const div = document.createElement("div");
    div.className = "wc-conn-in";
    div.innerHTML = `<svg viewBox="0 0 8 100" preserveAspectRatio="none">
      <line x1="0" y1="50" x2="8" y2="50" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>
    </svg>`;
    return div;
  },

  // Bracket arm joining a pair toward the next round
  _connOut(idx) {
    const div = document.createElement("div");
    div.className = "wc-conn-out";
    const isTop = idx % 2 === 0;
    const y2    = isTop ? "100" : "0";
    div.innerHTML = `<svg viewBox="0 0 8 100" preserveAspectRatio="none">
      <line x1="0" y1="50" x2="4" y2="50" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>
      <line x1="4" y1="50" x2="4" y2="${y2}" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>
      <line x1="4" y1="${y2}" x2="8" y2="${y2}" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>
    </svg>`;
    return div;
  },

  // ── Match card ──────────────────────────────────────────────────────────────

  _buildCard(m) {
    const card = document.createElement("div");
    card.className = "wc-match-card";

    card.appendChild(this._teamRow(m.teamA, m.scoreA, m.winner && m.winner === m.teamA?.abbr));
    const div = document.createElement("div"); div.className = "wc-match-divider"; card.appendChild(div);
    card.appendChild(this._teamRow(m.teamB, m.scoreB, m.winner && m.winner === m.teamB?.abbr));

    if (m.status === "live") {
      const lb = document.createElement("div"); lb.className = "wc-live-badge"; lb.textContent = "● LIVE"; card.appendChild(lb);
    } else if (m.date && this.config.showDates) {
      const dt = document.createElement("div"); dt.className = "wc-match-date"; dt.textContent = m.date; card.appendChild(dt);
    }
    return card;
  },

  _teamRow(team, score, isWinner) {
    const row = document.createElement("div");
    const tbd = !team || team.abbr === "TBD" || team.name === "TBD";
    row.className = "wc-team-row" +
      (isWinner && this.config.colored ? " wc-winner" : "") +
      (tbd ? " wc-tbd" : "");

    const flag = document.createElement("span"); flag.className = "wc-team-flag";
    flag.textContent = tbd ? "" : this._flag(team.abbr);

    const name = document.createElement("span"); name.className = "wc-team-name";
    name.textContent = tbd ? "TBD" : (team.name || team.abbr);

    const sc = document.createElement("span"); sc.className = "wc-team-score";
    sc.textContent = (score !== null && score !== undefined) ? score : "";

    row.appendChild(flag); row.appendChild(name); row.appendChild(sc);
    return row;
  },

  // ── Helpers ─────────────────────────────────────────────────────────────────

  _roundLabel(id) {
    return { R32:"Rd of 32", R16:"Rd of 16", QF:"Quarters", SF:"Semis", F:"Final" }[id] || id;
  },

  _flag(abbr) {
    if (!abbr) return "";
    const map = {
      MEX:"MX",RSA:"ZA",KOR:"KR",CZE:"CZ",SUI:"CH",CAN:"CA",BIH:"BA",QAT:"QA",
      BRA:"BR",MAR:"MA",SCO:"GB",HTI:"HT",USA:"US",AUS:"AU",PAR:"PY",TUR:"TR",
      GER:"DE",CIV:"CI",ECU:"EC",CUW:"CW",NED:"NL",JPN:"JP",SWE:"SE",TUN:"TN",
      BEL:"BE",EGY:"EG",IRN:"IR",NZL:"NZ",ESP:"ES",CPV:"CV",URU:"UY",KSA:"SA",
      FRA:"FR",NOR:"NO",SEN:"SN",IRQ:"IQ",ARG:"AR",AUT:"AT",DZA:"DZ",JOR:"JO",
      COL:"CO",POR:"PT",COD:"CD",UZB:"UZ",ENG:"GB",CRO:"HR",GHA:"GH",PAN:"PA",
    };
    const a2 = map[abbr] || abbr.slice(0,2);
    return [...a2].slice(0,2).map(c => String.fromCodePoint(0x1F1E6 - 65 + c.charCodeAt(0))).join("");
  },

  // ── Socket ───────────────────────────────────────────────────────────────────

  scheduleUpdate(delay) {
    setTimeout(() => {
      this.sendSocketNotification("WC_GET_BRACKET");
      this.scheduleUpdate();
    }, delay !== undefined ? delay : this.config.updateInterval);
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "WC_BRACKET_RESULT") {
      this.bracket     = payload.bracket;
      this.lastUpdated = new Date().toLocaleTimeString();
      this.loaded      = true;
      this.updateDom(this.config.animationSpeed);
    }
    if (notification === "WC_BRACKET_ERROR") {
      Log.error(`[${this.name}] Bracket error:`, payload);
    }
  },
});