/* node_helper.js  –  MMM-FIFAWorldCup (bracket edition, v6)
 *
 * Data source: FIFA's own internal bracket API
 *   https://api.fifa.com/api/v3/seasonbracket/season/285023?language=en
 *
 * This returns the complete knockout bracket in a single call:
 *   data.KnockoutStages[] — array of rounds in order
 *     .Name[0].Description — round name (e.g. "Round of 32")
 *     .IdStage / .SequenceOrder — stable stage identity and bracket order
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
    console.log(`[${this.name}] Fetching ${FIFA_BRACKET_URL}`);

    try {
      const res = await _fetch(FIFA_BRACKET_URL, {
        headers: {
          "User-Agent": "MagicMirror/MMM-FIFAWorldCup",
          "Accept": "application/json"
        }
      });

      console.log(`[${this.name}] HTTP ${res.status}`);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();

      console.log(`[${this.name}] JSON received`);
      console.log(`[${this.name}] KnockoutStages: ${data.KnockoutStages?.length}`);

      const bracket = this.parseBracket(data);

      console.log(`[${this.name}] Parsed ${bracket.length} rounds`);

      this.sendSocketNotification("WC_BRACKET_RESULT", {
        bracket
      });

    } catch (err) {
      console.error(`[${this.name}]`);
      console.error(err);
      console.error(err.stack);

      this.sendSocketNotification(
        "WC_BRACKET_ERROR",
        err.toString()
      );
    }
  },

  parseBracket(data) {
    const stages = [...(data.KnockoutStages || [])].sort(
      (a, b) => a.SequenceOrder - b.SequenceOrder
    );

    function getDescription(value) {
      if (!value) return "";
      if (typeof value === "string") return value;
      if (Array.isArray(value)) return value[0]?.Description || "";
      return value.Description || "";
    }

    function resolveRoundId(stageName) {
      return ROUND_ID_MAP[stageName.toLowerCase()] ?? null;
    }

    // IdStage → roundId and roundId → stage lookup tables from JSON
    const roundIdByStageId = {};
    const stageByRoundId = {};
    stages.forEach(stage => {
      const stageName = getDescription(stage.Name);
      const roundId = resolveRoundId(stageName);
      roundIdByStageId[stage.IdStage] = roundId;
      if (roundId) stageByRoundId[roundId] = stage;
    });

    function reorderR32FromNextRound(r32Matches, nextStage) {
      const lookup = new Map();
      r32Matches.forEach(m => lookup.set(String(m.IdMatch), m));

      const ordered = [];
      [...(nextStage.Matches || [])]
        .sort((a, b) => a.MatchNumber - b.MatchNumber)
        .forEach(nextMatch => {
          const a = lookup.get(String(nextMatch.TeamA));
          const b = lookup.get(String(nextMatch.TeamB));
          if (a) ordered.push(a);
          if (b) ordered.push(b);
        });

      return ordered;
    }

    return stages
      .map(stage => {
        const stageName = getDescription(stage.Name);
        const roundId = resolveRoundId(stageName);
        if (!roundId) return null;

        let matches = [...(stage.Matches || [])];

        if (roundId === "R32") {
          const nextStage = stages.find(
            s => s.SequenceOrder === stage.SequenceOrder + 1
          );
          const r16 = nextStage && roundIdByStageId[nextStage.IdStage] === "R16"
            ? nextStage
            : stageByRoundId.R16;

          if (r16) {
            const ordered = reorderR32FromNextRound(matches, r16);
            if (ordered.length === matches.length) {
              matches = ordered;
            }
          }
        } else {
          matches.sort((a, b) => a.MatchNumber - b.MatchNumber);
        }

        return {
          id: roundId,
          name: stageName,
          matches: matches.map(m => this.parseMatch(m))
        };
      })
      .filter(Boolean)
      .filter(round =>
        ["R32", "R16", "QF", "SF", "3RD", "F"].includes(round.id)
      );
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
        isPlaceholder: false,
      } : {
        name: m.PlaceHolderA || "TBD",
        abbr: m.PlaceHolderA || "TBD",
        isPlaceholder: true,
      },
      teamB: away ? {
        name: away.TeamName?.[0]?.Description ?? away.ShortClubName ?? "TBD",
        abbr: away.Abbreviation ?? "TBD",
        isPlaceholder: false,
      } : {
        name: m.PlaceHolderB || "TBD",
        abbr: m.PlaceHolderB || "TBD",
        isPlaceholder: true,
      },
      scoreA: scoreH,
      scoreB: scoreA,
      penA:   penH,
      penB:   penA,
      winner: winnerAbbr,
    };
  },
});
