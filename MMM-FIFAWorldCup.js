/* MMM-FIFAWorldCup.js — Mirrored bracket edition (Grid layout)
 *
 * Uses CSS Grid instead of flexbox for vertical alignment.
 * Each Round-of-32 match occupies exactly 1 grid row. Each later round's
 * match spans 2x the rows of the round before it and is centred via
 * `align-self: center`, so it naturally lines up between its two feeders
 * regardless of how many matches are in play — fixing the previous
 * "Quarters/Semis labels float over the wrong matches" issue.
 *
 * Layout (visual, left→right):
 *   [R32][R16][QF][SF] 🏆 [SF][QF][R16][R32]
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

    const rounds = this.bracket;
    const r32 = rounds.find(r => r.id === "R32");
    const r16 = rounds.find(r => r.id === "R16");
    const qf  = rounds.find(r => r.id === "QF");
    const sf  = rounds.find(r => r.id === "SF");
    const fin = rounds.find(r => r.id === "F");
    const third = rounds.find(r => r.id === "3RD");

    const h   = arr => Math.ceil(arr.length / 2);
    const top = r   => r ? r.matches.slice(0, h(r.matches)) : [];
    const bot = r   => r ? r.matches.slice(h(r.matches))    : [];

    // Champion
    let champion = null;
    if (fin && fin.matches[0] && fin.matches[0].winner) {
      const m = fin.matches[0];
      champion = (m.winner === m.teamA?.abbr ? m.teamA : m.teamB)?.name || null;
    }

    // Each half always reserves 4 round slots (R32,R16,QF,SF) — even if a
    // later round has zero matches yet — so grid row math stays consistent
    // and columns don't jump around as the tournament progresses.
    const ROW_BASE = 8; // each HALF has at most 8 Round-of-32 matches (16 total / 2 halves)

    const bracketEl = document.createElement("div");
    bracketEl.className = "wc-bracket";

    const leftHalf = document.createElement("div");
    leftHalf.className = "wc-half wc-half-left";
    leftHalf.appendChild(this._buildGridHalf([
      { id: "R32", matches: top(r32) },
      { id: "R16", matches: top(r16) },
      { id: "QF",  matches: top(qf)  },
      { id: "SF",  matches: top(sf)  },
    ], "left", ROW_BASE));

    const centre = this._buildCenterColumn(fin, third, champion);

    const rightHalf = document.createElement("div");
    rightHalf.className = "wc-half wc-half-right";
    rightHalf.appendChild(this._buildGridHalf([
      { id: "R32", matches: bot(r32) },
      { id: "R16", matches: bot(r16) },
      { id: "QF",  matches: bot(qf)  },
      { id: "SF",  matches: bot(sf)  },
    ], "right", ROW_BASE));

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

  // ── Grid half builder ──────────────────────────────────────────────────────
  // Builds one half (4 round columns) as a single CSS Grid so that every
  // round's matches are vertically centred against their real feeder slots,
  // using row-span doubling: R32=1 row, R16=2 rows, QF=4 rows, SF=8 rows.

  _buildGridHalf(roundDefs, side, rowBase) {
    const half = document.createElement("div");
    half.className = "wc-grid-half";
    half.style.gridTemplateColumns = `repeat(${roundDefs.length}, 1fr)`;
    half.style.gridTemplateRows = `repeat(${rowBase}, 1fr)`;

    // visual column order differs for left vs right (right is mirrored)
    const colOrder = side === "left"
      ? [0, 1, 2, 3]   // R32,R16,QF,SF left→right
      : [3, 2, 1, 0];  // SF,QF,R16,R32 left→right (so R32 lands at outer edge)

    roundDefs.forEach((def, defIdx) => {
      const rowSpan = Math.pow(2, defIdx); // R32:1, R16:2, QF:4, SF:8
      const gridCol = colOrder[defIdx] + 1; // CSS grid is 1-indexed

      // Title spans the same column, sits in an implicit header row above
      const title = document.createElement("div");
      title.className = "wc-round-title";
      title.textContent = this._roundLabel(def.id);
      title.style.gridColumn = `${gridCol} / span 1`;
      title.style.gridRow = `1`;
      half.appendChild(title);

      def.matches.forEach((m, i) => {
        // startRow = 2 (row 1 is the header) + i * rowSpan.
        // Verified by hand: this packs each round's matches back-to-back
        // with zero gaps, and each later round's match exactly spans and
        // centres over its corresponding pair of matches from the round
        // before it. No extra offset or multiplier needed.
        const startRow = 2 + i * rowSpan;

        const wrap = document.createElement("div");
        wrap.className = "wc-match-wrap";
        wrap.style.gridColumn = `${gridCol} / span 1`;
        wrap.style.gridRow = `${startRow} / span ${Math.max(rowSpan, 1)}`;

        const isOutermost = defIdx === 0;
        const isInnermost = defIdx === roundDefs.length - 1;
        const card = this._buildCard(m);
        const cIn  = this._connIn();
        const cOut = this._connOut(i);

        const trophySide = (side === "left"); // toward-trophy side is right for left half, left for right half
        if (trophySide) {
          if (!isOutermost) wrap.appendChild(cIn);
          wrap.appendChild(card);
          if (!isInnermost) wrap.appendChild(cOut);
        } else {
          if (!isInnermost) wrap.appendChild(cOut);
          wrap.appendChild(card);
          if (!isOutermost) wrap.appendChild(cIn);
        }

        half.appendChild(wrap);
      });
    });

    return half;
  },

  _buildCenterColumn(fin, third, champion) {
    const centre = document.createElement("div");
    centre.className = "wc-center";

    if (fin?.matches?.length) {
      centre.appendChild(this._buildCenterMatch("F", fin.matches[0]));
    }

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

    if (third?.matches?.length) {
      centre.appendChild(this._buildCenterMatch("3RD", third.matches[0]));
    }

    return centre;
  },

  _buildCenterMatch(roundId, match) {
    const block = document.createElement("div");
    block.className = "wc-center-match";

    const title = document.createElement("div");
    title.className = "wc-center-title";
    title.textContent = this._roundLabel(roundId);
    block.appendChild(title);

    block.appendChild(this._buildCard(match));
    return block;
  },

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
    const placeholder = team?.isPlaceholder;
    const tbd = !team || team.abbr === "TBD" || team.name === "TBD";
    row.className = "wc-team-row" +
      (isWinner && this.config.colored ? " wc-winner" : "") +
      ((tbd || placeholder) ? " wc-tbd" : "");

    const flag = document.createElement("span"); flag.className = "wc-team-flag";
    flag.textContent = (tbd || placeholder) ? "" : this._flag(team.abbr);

    const name = document.createElement("span"); name.className = "wc-team-name";
    name.textContent = tbd ? "TBD" : (team.name || team.abbr);

    const sc = document.createElement("span"); sc.className = "wc-team-score";
    sc.textContent = (score !== null && score !== undefined) ? score : "";

    row.appendChild(flag); row.appendChild(name); row.appendChild(sc);
    return row;
  },

  // ── Helpers ─────────────────────────────────────────────────────────────────

  _roundLabel(id) {
    return { R32:"Rd of 32", R16:"Rd of 16", QF:"Quarters", SF:"Semis", "3RD":"3rd Place", F:"Final" }[id] || id;
  },

  _flag(abbr) {
    if (!abbr || /\d/.test(abbr)) return "";
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