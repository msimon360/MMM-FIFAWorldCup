/* node_helper.js  –  MMM-FIFAWorldCup (bracket edition, v5)
 *
 * KEY CHANGE FROM v4:
 *   v4 tried to determine each match's round purely from ESPN's per-event
 *   text fields (season.slug / altGameNote / notes), fetched via repeated
 *   daily scoreboard calls. This was fragile — daily date windows can
 *   include stale or misfiled events.
 *
 *   v5 adds a second, independent data source as a validation layer:
 *   ESPN's STANDINGS endpoint (site.web.api.espn.com/.../standings), which
 *   reliably reports each team's group-stage finish (rank 1-4) and
 *   qualification note ("Advance to Round of 32", "Best 8 advance",
 *   "Eliminated"). We use this to build a set of teams that are NOT
 *   confirmed eliminated, then only accept scoreboard events where BOTH
 *   competing teams are in that set. This filters out stale/misfiled
 *   group-stage games without relying solely on date-window guessing.
 *
 *   Note: teams ranked 3rd in their group show "Best 8 advance" for ALL
 *   3rd-place teams until the full group stage concludes and ESPN can
 *   determine which 8 specifically qualify — we treat all of them as
 *   provisionally eligible rather than guessing which 8.
 *
 * Diagnostic console.log/warn lines report: how many qualified teams were
 * found, how many scoreboard events passed validation, and match counts
 * per round. Check `pm2 logs mm` if counts still look wrong.
 */

const NodeHelper = require("node_helper");
let _fetch;
try { _fetch = fetch; } catch { _fetch = require("node-fetch"); }

// Try https://api.fifa.com/api/v3/seasonbracket/season/285023?language=en Instead

const ESPN_SCOREBOARD_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";
const ESPN_STANDINGS_URL   = "https://site.web.api.espn.com/apis/v2/sports/soccer/fifa.world/standings";

module.exports = NodeHelper.create({
  start() { console.log(`[${this.name}] started (v5 — standings-validated)`); },

  socketNotificationReceived(notification) {
    if (notification === "WC_GET_BRACKET") this.fetchBracket();
  },

  async fetchBracket() {
    try {
      const bracket = await this.buildBracket();
      this.sendSocketNotification("WC_BRACKET_RESULT", { bracket });
    } catch (err) {
      console.error(`[${this.name}] fetch failed:`, err.message);
      this.sendSocketNotification("WC_BRACKET_RESULT", { bracket: this.buildPlaceholderBracket() });
    }
  },

  // ── Step 1: Standings → qualified team set ──────────────────────────────────
  async fetchQualifiedTeams() {
    const res = await _fetch(ESPN_STANDINGS_URL, { headers: { "User-Agent": "MagicMirror/MMM-FIFAWorldCup" }, timeout: 10000 });
    if (!res.ok) throw new Error(`ESPN standings HTTP ${res.status}`);
    const data = await res.json();

    const groups = data?.children ?? [];
    const qualified = new Set();
    let eliminatedCount = 0;

    for (const group of groups) {
      const entries = group.standings?.entries ?? [];
      for (const entry of entries) {
        const abbr = entry.team?.abbreviation;
        const desc = (entry.note?.description ?? "").toLowerCase();
        if (!abbr) continue;

        if (desc.includes("eliminated")) {
          eliminatedCount++;
          continue; // confirmed out — never include
        }
        // Rank 1, 2 (always advance), or rank 3 "best 8 advance" (provisional)
        qualified.add(abbr);
      }
    }

    console.log(`[${this.name}] standings: ${qualified.size} teams not-yet-eliminated, ${eliminatedCount} confirmed eliminated`);
    return qualified;
  },

  // ── Step 2: Scoreboard fetch across the knockout window ─────────────────────
  async fetchDay(yyyymmdd) {
    const url = `${ESPN_SCOREBOARD_BASE}?dates=${yyyymmdd}`;
    const res = await _fetch(url, { headers: { "User-Agent": "MagicMirror/MMM-FIFAWorldCup" }, timeout: 10000 });
    if (!res.ok) throw new Error(`ESPN HTTP ${res.status} for ${yyyymmdd}`);
    return res.json();
  },

  dateRange(startYYYYMMDD, endYYYYMMDD) {
    const toDate = s => new Date(`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}T00:00:00Z`);
    const start = toDate(startYYYYMMDD);
    const end   = toDate(endYYYYMMDD);
    const out = [];
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      out.push(d.toISOString().slice(0,10).replace(/-/g,""));
    }
    return out;
  },

  // ── Main orchestration ──────────────────────────────────────────────────────
  async buildBracket() {
    const qualifiedTeams = await this.fetchQualifiedTeams();
    if (!qualifiedTeams.size) throw new Error("No qualified teams found in standings");

    // Get calendar (round date windows) from one scoreboard call
    const today = new Date();
    const todayStr = today.toISOString().slice(0,10).replace(/-/g,"");
    const seed = await this.fetchDay(todayStr);
    const calendar = seed?.leagues?.[0]?.calendar?.[0]?.entries ?? [];
    if (!calendar.length) throw new Error("No calendar data from ESPN");

    const ROUND_ID_MAP = {
      "round of 32": "R32",
      "rd of 16": "R16",
      "round of 16": "R16",
      "quarterfinals": "QF",
      "semifinals": "SF",
      "final": "F",
    };

    const knockoutRounds = calendar
      .map(entry => {
        const key = entry.label.toLowerCase();
        const id = ROUND_ID_MAP[key];
        if (!id) return null;
        return {
          id,
          name: entry.label,
          startDate: entry.startDate.slice(0,10).replace(/-/g,""),
          endDate: entry.endDate.slice(0,10).replace(/-/g,""),
        };
      })
      .filter(Boolean);

    if (!knockoutRounds.length) throw new Error("No knockout rounds found in calendar");

    // Fetch every day across the full knockout window
    const overallStart = knockoutRounds[0].startDate;
    const overallEnd    = knockoutRounds[knockoutRounds.length - 1].endDate;
    const allDays = this.dateRange(overallStart, overallEnd);

    const allEvents = [];
    const seenIds = new Set();

    for (const day of allDays) {
      try {
        const data = await this.fetchDay(day);
        const events = data?.events ?? [];
        for (const ev of events) {
          if (seenIds.has(ev.id)) continue;
          seenIds.add(ev.id);
          allEvents.push(ev);
        }
      } catch (e) {
        console.warn(`[${this.name}] skip ${day}: ${e.message}`);
      }
    }

    console.log(`[${this.name}] fetched ${allEvents.length} unique events across knockout window`);

    // ── Step 3: VALIDATE against qualified-teams set ──
    const validEvents = allEvents.filter(ev => {
      const comp = ev.competitions?.[0];
      const competitors = comp?.competitors ?? [];
      const abbrs = competitors.map(c => c.team?.abbreviation).filter(Boolean);
      if (abbrs.length < 2) return false;
      return abbrs.every(a => qualifiedTeams.has(a));
    });

    console.log(`[${this.name}] ${validEvents.length}/${allEvents.length} events passed qualified-team validation`);

    // ── Step 4: resolve each valid event's round ──
    const ROUND_TEXT_MAP = [
      [/round of 32/i, "R32"],
      [/round of 16|rd\.? of 16/i, "R16"],
      [/quarter ?final/i, "QF"],
      [/semi ?final/i, "SF"],
      [/3rd.place|third.place/i, "3RD"],
      [/\bfinal\b/i, "F"],
    ];

    const resolveByText = (ev) => {
      const comp = ev.competitions?.[0];
      const candidates = [
        ev.season?.slug,
        comp?.notes?.[0]?.headline,
        comp?.altGameNote,
        ev.name,
      ].filter(Boolean).join(" | ");
      for (const [pattern, id] of ROUND_TEXT_MAP) {
        if (pattern.test(candidates)) return id;
      }
      return null;
    };

    // Fallback: which calendar window does the match date fall into?
    const resolveByDate = (ev) => {
      if (!ev.date) return null;
      const evDay = ev.date.slice(0,10).replace(/-/g,"");
      for (const r of knockoutRounds) {
        if (evDay >= r.startDate && evDay <= r.endDate) return r.id;
      }
      return null;
    };

    let textResolved = 0, dateResolved = 0, unresolved = 0;
    for (const ev of validEvents) {
      ev._roundId = resolveByText(ev);
      if (ev._roundId) { textResolved++; continue; }
      ev._roundId = resolveByDate(ev);
      if (ev._roundId) { dateResolved++; }
      else { unresolved++; }
    }

    console.log(`[${this.name}] round resolution — by text: ${textResolved}, by date fallback: ${dateResolved}, unresolved: ${unresolved}`);
    for (const id of ["R32","R16","QF","SF","F"]) {
      const count = validEvents.filter(ev => ev._roundId === id).length;
      console.log(`[${this.name}] round ${id}: ${count} matches`);
    }

    // ── Group into final bracket structure ──
    const roundsOut = knockoutRounds.map(r => ({
      id: r.id,
      name: r.name,
      matches: validEvents
        .filter(ev => ev._roundId === r.id)
        .sort((a,b) => new Date(a.date) - new Date(b.date))
        .map(ev => this.parseESPNEvent(ev)),
    })).filter(r => r.matches.length > 0);

    if (!roundsOut.length) throw new Error("No valid knockout matches after validation");

    return roundsOut;
  },

  parseESPNEvent(ev) {
    const comp = ev.competitions?.[0];
    const competitors = comp?.competitors ?? [];
    const a = competitors.find(c => c.homeAway === "home") ?? competitors[0];
    const b = competitors.find(c => c.homeAway === "away") ?? competitors[1];
    const state = comp?.status?.type?.state ?? "pre";

    return {
      id: ev.id,
      status: state === "in" ? "live" : state === "post" ? "final" : "scheduled",
      date: ev.date ? new Date(ev.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null,
      teamA: a ? { name: a.team?.displayName ?? "TBD", abbr: a.team?.abbreviation ?? "TBD" } : { name: "TBD", abbr: "TBD" },
      teamB: b ? { name: b.team?.displayName ?? "TBD", abbr: b.team?.abbreviation ?? "TBD" } : { name: "TBD", abbr: "TBD" },
      scoreA: a?.score != null ? Number(a.score) : null,
      scoreB: b?.score != null ? Number(b.score) : null,
      winner: competitors.find(c => c.winner)?.team?.abbreviation ?? null,
    };
  },

  // ── Last-resort static fallback ──────────────────────────────────────────────
  buildPlaceholderBracket() {
    const TBD = (d) => ({ id: Math.random().toString(36).slice(2), status: "scheduled", date: d, teamA: { name: "TBD", abbr: "TBD" }, teamB: { name: "TBD", abbr: "TBD" }, scoreA: null, scoreB: null, winner: null });
    return [
      { id: "R32", name: "Round of 32",     matches: Array.from({ length: 16 }, (_, i) => TBD(`Jun ${28 + Math.floor(i/3)}`)) },
      { id: "R16", name: "Round of 16",     matches: Array.from({ length: 8 },  (_, i) => TBD(`Jul ${4 + Math.floor(i/2)}`))  },
      { id: "QF",  name: "Quarter-Finals",  matches: Array.from({ length: 4 },  (_, i) => TBD(`Jul ${9 + Math.floor(i/2)}`))  },
      { id: "SF",  name: "Semi-Finals",     matches: Array.from({ length: 2 },  (_, i) => TBD(`Jul ${14 + i}`))               },
      { id: "F",   name: "Final",           matches: [TBD("Jul 19")] },
    ];
  },
});