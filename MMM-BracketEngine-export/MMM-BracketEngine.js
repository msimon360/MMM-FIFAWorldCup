/* MMM-BracketEngine.js — Generalized mirrored knockout bracket */

Module.register("MMM-BracketEngine", {

  defaults: {
    provider: "fifa",
    providerConfig: {
      seasonId: "285023",
      language: "en",
    },
    updateInterval: 3 * 60 * 1000,
    animationSpeed: 1000,
    header: null,
    colored: true,
    showDates: true,
    showPenalties: false,
    showFlags: true,
    showLastUpdated: true,
  },

  start() {
    Log.info(`[${this.name}] Starting (provider: ${this.config.provider})`);
    this.bracket = null;
    this.loaded = false;
    this.error = null;
    this.lastUpdated = null;
    this.scheduleUpdate(0);
  },

  getStyles() {
    return ["MMM-BracketEngine.css"];
  },

  getHeader() {
    if (this.config.header) return this.config.header;
    const icon = this.bracket?.meta?.icon || "";
    const title = this.bracket?.meta?.title || "Tournament Bracket";
    return icon ? `${icon} ${title}` : title;
  },

  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "be-wrapper";

    if (!this.loaded) {
      wrapper.innerHTML = `<span class="dimmed light small">Loading bracket…</span>`;
      return wrapper;
    }

    if (!this.bracket?.rounds?.length) {
      wrapper.innerHTML = `<span class="dimmed light small">No bracket data yet.</span>`;
      if (this.error) {
        const err = document.createElement("div");
        err.className = "be-error";
        err.textContent = this.error;
        wrapper.appendChild(err);
      }
      return wrapper;
    }

    const rounds = this.bracket.rounds;
    const sideRoundIds = this._getSideRoundIds(rounds);
    const roundMap = Object.fromEntries(rounds.map(r => [r.id, r]));

    const fin = roundMap.F;
    const third = roundMap["3RD"];

    const h = arr => Math.ceil(arr.length / 2);
    const top = r => (r ? r.matches.slice(0, h(r.matches)) : []);
    const bot = r => (r ? r.matches.slice(h(r.matches)) : []);

    let champion = null;
    if (fin?.matches?.[0]?.winner) {
      const m = fin.matches[0];
      champion = (m.winner === m.teamA?.abbr ? m.teamA : m.teamB)?.name || null;
    }

    const firstRound = roundMap[sideRoundIds[0]];
    const rowBase = firstRound
      ? Math.max(1, Math.ceil(firstRound.matches.length / 2))
      : 1;

    const bracketEl = document.createElement("div");
    bracketEl.className = "be-bracket";

    const leftDefs = sideRoundIds.map(id => ({
      id,
      name: roundMap[id]?.name,
      matches: top(roundMap[id]),
    }));

    const rightDefs = sideRoundIds.map(id => ({
      id,
      name: roundMap[id]?.name,
      matches: bot(roundMap[id]),
    }));

    const leftHalf = document.createElement("div");
    leftHalf.className = "be-half be-half-left";
    leftHalf.appendChild(this._buildGridHalf(leftDefs, "left", rowBase));

    const centre = this._buildCenterColumn(fin, third, champion);

    const rightHalf = document.createElement("div");
    rightHalf.className = "be-half be-half-right";
    rightHalf.appendChild(this._buildGridHalf(rightDefs, "right", rowBase));

    bracketEl.appendChild(leftHalf);
    bracketEl.appendChild(centre);
    bracketEl.appendChild(rightHalf);
    wrapper.appendChild(bracketEl);

    if (this.config.showLastUpdated && this.lastUpdated) {
      const ts = document.createElement("div");
      ts.className = "be-updated";
      ts.textContent = `Updated: ${this.lastUpdated}`;
      wrapper.appendChild(ts);
    }

    if (this.error) {
      const err = document.createElement("div");
      err.className = "be-error";
      err.textContent = this.error;
      wrapper.appendChild(err);
    }

    return wrapper;
  },

  _getSideRoundIds(rounds) {
    const order = ["R32", "R16", "QF", "SF", "R8", "R4"];
    const present = new Set(rounds.map(r => r.id));
    return order.filter(id => present.has(id));
  },

  _buildGridHalf(roundDefs, side, rowBase) {
    const half = document.createElement("div");
    half.className = "be-grid-half";
    half.style.gridTemplateColumns = `repeat(${roundDefs.length}, 1fr)`;
    half.style.gridTemplateRows = `repeat(${rowBase}, 1fr)`;

    const colOrder = side === "left"
      ? roundDefs.map((_, i) => i)
      : roundDefs.map((_, i) => roundDefs.length - 1 - i);

    roundDefs.forEach((def, defIdx) => {
      const rowSpan = Math.pow(2, defIdx);
      const gridCol = colOrder[defIdx] + 1;

      const title = document.createElement("div");
      title.className = "be-round-title";
      title.textContent = def.name || this._roundLabel(def.id);
      title.style.gridColumn = `${gridCol} / span 1`;
      title.style.gridRow = "1";
      half.appendChild(title);

      def.matches.forEach((m, i) => {
        const startRow = 2 + i * rowSpan;

        const wrap = document.createElement("div");
        wrap.className = "be-match-wrap";
        wrap.style.gridColumn = `${gridCol} / span 1`;
        wrap.style.gridRow = `${startRow} / span ${Math.max(rowSpan, 1)}`;

        const isOutermost = defIdx === 0;
        const isInnermost = defIdx === roundDefs.length - 1;
        const card = this._buildCard(m);
        const cIn = this._connIn();
        const cOut = this._connOut(i);

        const trophySide = side === "left";
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
    centre.className = "be-center";

    if (fin?.matches?.length) {
      centre.appendChild(this._buildCenterMatch("F", fin.matches[0], fin.name));
    }

    const trophy = document.createElement("div");
    trophy.className = "be-trophy";
    trophy.textContent = this.bracket?.meta?.icon || "🏆";
    centre.appendChild(trophy);

    if (champion) {
      const el = document.createElement("div");
      el.className = "be-champion-name";
      el.textContent = champion;
      centre.appendChild(el);
    }

    if (third?.matches?.length) {
      centre.appendChild(this._buildCenterMatch("3RD", third.matches[0], third.name));
    }

    return centre;
  },

  _buildCenterMatch(roundId, match, roundName) {
    const block = document.createElement("div");
    block.className = "be-center-match";

    const title = document.createElement("div");
    title.className = "be-center-title";
    title.textContent = roundName || this._roundLabel(roundId);
    block.appendChild(title);

    block.appendChild(this._buildCard(match));
    return block;
  },

  _connIn() {
    const div = document.createElement("div");
    div.className = "be-conn-in";
    div.innerHTML = `<svg viewBox="0 0 8 100" preserveAspectRatio="none">
      <line x1="0" y1="50" x2="8" y2="50" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>
    </svg>`;
    return div;
  },

  _connOut(idx) {
    const div = document.createElement("div");
    div.className = "be-conn-out";
    const isTop = idx % 2 === 0;
    const y2 = isTop ? "100" : "0";
    div.innerHTML = `<svg viewBox="0 0 8 100" preserveAspectRatio="none">
      <line x1="0" y1="50" x2="4" y2="50" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>
      <line x1="4" y1="50" x2="4" y2="${y2}" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>
      <line x1="4" y1="${y2}" x2="8" y2="${y2}" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>
    </svg>`;
    return div;
  },

  _buildCard(m) {
    const card = document.createElement("div");
    card.className = "be-match-card";

    card.appendChild(
      this._teamRow(m.teamA, m.scoreA, m.winner && m.winner === m.teamA?.abbr)
    );

    const div = document.createElement("div");
    div.className = "be-match-divider";
    card.appendChild(div);

    card.appendChild(
      this._teamRow(m.teamB, m.scoreB, m.winner && m.winner === m.teamB?.abbr)
    );

    if (m.status === "live") {
      const lb = document.createElement("div");
      lb.className = "be-live-badge";
      lb.textContent = "● LIVE";
      card.appendChild(lb);
    } else if (m.date && this.config.showDates) {
      const dt = document.createElement("div");
      dt.className = "be-match-date";
      dt.textContent = m.date;
      card.appendChild(dt);
    }

    if (
      this.config.showPenalties &&
      m.penA !== null &&
      m.penA !== undefined &&
      m.penB !== null &&
      m.penB !== undefined
    ) {
      const pen = document.createElement("div");
      pen.className = "be-penalty-score";
      pen.textContent = `Pens ${m.penA}-${m.penB}`;
      card.appendChild(pen);
    }

    return card;
  },

  _teamRow(team, score, isWinner) {
    const row = document.createElement("div");
    const placeholder = team?.isPlaceholder;
    const tbd = !team || team.abbr === "TBD" || team.name === "TBD";
    row.className =
      "be-team-row" +
      (isWinner && this.config.colored ? " be-winner" : "") +
      (tbd || placeholder ? " be-tbd" : "");

    const flag = document.createElement("span");
    flag.className = "be-team-flag";
    if (!tbd && !placeholder && this.config.showFlags) {
      flag.textContent = team.flag || this._flag(team.abbr);
    }

    const name = document.createElement("span");
    name.className = "be-team-name";
    name.textContent = tbd ? "TBD" : team.name || team.abbr;

    const sc = document.createElement("span");
    sc.className = "be-team-score";
    sc.textContent = score !== null && score !== undefined ? score : "";

    row.appendChild(flag);
    row.appendChild(name);
    row.appendChild(sc);
    return row;
  },

  _roundLabel(id) {
    return {
      R32: "Rd of 32",
      R16: "Rd of 16",
      QF: "Quarters",
      SF: "Semis",
      "3RD": "3rd Place",
      F: "Final",
      R8: "Rd of 8",
      R4: "Semis",
    }[id] || id;
  },

  _flag(abbr) {
    if (!abbr || /\d/.test(abbr)) return "";
    const map = {
      MEX: "MX", RSA: "ZA", KOR: "KR", CZE: "CZ", SUI: "CH", CAN: "CA",
      BIH: "BA", QAT: "QA", BRA: "BR", MAR: "MA", SCO: "GB", HTI: "HT",
      USA: "US", AUS: "AU", PAR: "PY", TUR: "TR", GER: "DE", CIV: "CI",
      ECU: "EC", CUW: "CW", NED: "NL", JPN: "JP", SWE: "SE", TUN: "TN",
      BEL: "BE", EGY: "EG", IRN: "IR", NZL: "NZ", ESP: "ES", CPV: "CV",
      URU: "UY", KSA: "SA", FRA: "FR", NOR: "NO", SEN: "SN", IRQ: "IQ",
      ARG: "AR", AUT: "AT", DZA: "DZ", JOR: "JO", COL: "CO", POR: "PT",
      COD: "CD", UZB: "UZ", ENG: "GB", CRO: "HR", GHA: "GH", PAN: "PA",
    };
    const a2 = map[abbr] || abbr.slice(0, 2);
    return [...a2]
      .slice(0, 2)
      .map(c => String.fromCodePoint(0x1f1e6 - 65 + c.charCodeAt(0)))
      .join("");
  },

  scheduleUpdate(delay) {
    setTimeout(() => {
      this.sendSocketNotification("BE_GET_BRACKET", {
        provider: this.config.provider,
        providerConfig: this.config.providerConfig,
      });
      this.scheduleUpdate();
    }, delay !== undefined ? delay : this.config.updateInterval);
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "BE_BRACKET_RESULT") {
      this.bracket = payload;
      this.lastUpdated = new Date().toLocaleTimeString();
      this.loaded = true;
      this.error = null;
      this.updateDom(this.config.animationSpeed);
    }
    if (notification === "BE_BRACKET_ERROR") {
      Log.error(`[${this.name}] Bracket error:`, payload);
      this.error = payload;
      if (this.bracket) {
        this.updateDom(this.config.animationSpeed);
      }
    }
  },
});
