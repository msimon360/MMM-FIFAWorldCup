/* node_helper.js  –  MMM-FIFAWorldCup (bracket edition, v6)
 *
 * Data source: FIFA's own internal bracket API
 *   https://api.fifa.com/api/v3/seasonbracket/season/285023?language=en
 *
 * This returns the complete knockout bracket in a single call:
 *   data.KnockoutStages[] — array of rounds in order
 *     .Name[0].Description — round name (e.g. "Round of 32")
 *     .Matches[] — array of matches
 *       .HomeTeam / .AwayTeam — team objects with name, abbreviation, score
 *       .HomeTeamPenaltyScore / .AwayTeamPenaltyScore — penalty shootout scores
 *       .Winner — IdTeam of winner (or null if not yet played)
 *       .MatchStatus — 0=complete, 1=upcoming, 3=live
 *       .Date — UTC kickoff time
 *
 * No date-window guessing, no round misclassification, no ESPN flakiness.
 * One URL, one fetch, clean structured data.
 */

const NodeHelper = require("node_helper");
let _fetch;
try { _fetch = fetch; } catch { _fetch = require("node-fetch"); }

const FIFA_BRACKET_URL =
  "https://api.fifa.com/api/v3/seasonbracket/season/285023?language=en";

// Map FIFA round name strings to our internal IDs
const ROUND_ID_MAP = {
  "round of 32":          "R32",
  "round of 16":          "R16",
  "quarter-final":        "QF",
  "semi-final":           "SF",
  "play-off for third place": "3RD",
  "final":                "F",
};

module.exports = NodeHelper.create({

  start() {
    console.log(`[${this.name}] started (v6 — FIFA bracket API)`);
  },

  socketNotificationReceived(notification) {
    if (notification === "WC_GET_BRACKET") this.fetchBracket();
  },

  async fetchBracket() {
    try {
      const res = await _fetch(FIFA_BRACKET_URL, {
        headers: {
          "User-Agent": "MagicMirror/MMM-FIFAWorldCup",
          "Accept":     "application/json",
        },
        timeout: 15000,
      });

      if (!res.ok) throw new Error(`FIFA API HTTP ${res.status}`);
      const data = await res.json();

      const bracket = this.parseBracket(data);
      console.log(`[${this.name}] parsed ${bracket.length} rounds from FIFA API`);
      bracket.forEach(r => console.log(`[${this.name}]   ${r.id}: ${r.matches.length} matches`));

      this.sendSocketNotification("WC_BRACKET_RESULT", { bracket });

    } catch (err) {
      console.error(`[${this.name}] fetch failed:`, err.message);
      this.sendSocketNotification("WC_BRACKET_ERROR", err.message);
    }
  },

  parseBracket(data) {
    const stages = data?.KnockoutStages ?? [];
    const bracket = [];

    for (const stage of stages) {
      const rawName = (stage.Name?.[0]?.Description ?? "").trim();
      const id = ROUND_ID_MAP[rawName.toLowerCase()] ?? null;
      if (!id) {
        console.warn(`[${this.name}] skipping unknown stage: "${rawName}"`);
        continue;
      }
      // Skip the 3rd place playoff — not shown in the main bracket
      if (id === "3RD") continue;

      const matches = (stage.Matches ?? [])
        .sort((a, b) => new Date(a.Date) - new Date(b.Date))
        .map(m => this.parseMatch(m));

      bracket.push({ id, name: rawName, matches });
    }

    return bracket;
  },

  parseMatch(m) {
    const home = m.HomeTeam;
    const away = m.AwayTeam;

    // Determine status from MatchStatus:
    //   0 = complete, 1 = upcoming/scheduled, 3 = live
    const status =
      m.MatchStatus === 0 ? "final" :
      m.MatchStatus === 3 ? "live"  : "scheduled";

    // Scores — use penalty score if it exists (went to penalties)
    const scoreH = home?.Score ?? null;
    const scoreA = away?.Score ?? null;
    const penH   = m.HomeTeamPenaltyScore ?? null;
    const penA   = m.AwayTeamPenaltyScore ?? null;

    // Winner — FIFA gives us the IdTeam of the winner
    const winnerId = m.Winner ?? null;
    let winnerAbbr = null;
    if (winnerId) {
      if (home?.IdTeam === winnerId) winnerAbbr = home?.Abbreviation ?? null;
      else if (away?.IdTeam === winnerId) winnerAbbr = away?.Abbreviation ?? null;
    }

    // Format date nicely
    const dateStr = m.Date
      ? new Date(m.Date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : null;

    return {
      id:      m.IdMatch,
      status,
      date:    dateStr,
      teamA: home ? {
        name: home.TeamName?.[0]?.Description ?? home.ShortClubName ?? "TBD",
        abbr: home.Abbreviation ?? "TBD",
      } : { name: "TBD", abbr: "TBD" },
      teamB: away ? {
        name: away.TeamName?.[0]?.Description ?? away.ShortClubName ?? "TBD",
        abbr: away.Abbreviation ?? "TBD",
      } : { name: "TBD", abbr: "TBD" },
      scoreA: scoreH,
      scoreB: scoreA,
      penA:   penH,
      penB:   penA,
      winner: winnerAbbr,
    };
  },
});
