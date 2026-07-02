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

    // #region agent log
    const _dbg = (location, message, data, hypothesisId) => fetch('http://127.0.0.1:7410/ingest/b5ec576d-c6bb-49b5-8b61-41830ca1df08',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ec99f7'},body:JSON.stringify({sessionId:'ec99f7',location,message,data,timestamp:Date.now(),runId:'post-fix',hypothesisId})}).catch(()=>{});
    // #endregion

    // IdStage → stage, IdStage → roundId, roundId → stage
    const stageById = {};
    const roundIdByStageId = {};
    const stageByRoundId = {};
    stages.forEach(stage => {
        const stageName = getDescription(stage.Name);
        const roundId = resolveRoundId(stageName);
        stageById[stage.IdStage] = stage;
        roundIdByStageId[stage.IdStage] = roundId;
        if (roundId) stageByRoundId[roundId] = stage;
    });

    // #region agent log
    _dbg('node_helper.js:stageTables','Stage ID tables built',{stages:stages.map(s=>({IdStage:s.IdStage,SequenceOrder:s.SequenceOrder,name:getDescription(s.Name),roundId:roundIdByStageId[s.IdStage]})),r16IdStage:stageByRoundId.R16?.IdStage},'A');
    // #endregion

    function reorderR32FromNextRound(r32Matches, nextStage) {
        const lookup = new Map();
        r32Matches.forEach(m => lookup.set(String(m.IdMatch), m));

        const ordered = [];
        let missedRefs = 0;

        [...(nextStage.Matches || [])]
            .sort((a, b) => a.MatchNumber - b.MatchNumber)
            .forEach(nextMatch => {
                const a = lookup.get(String(nextMatch.TeamA));
                const b = lookup.get(String(nextMatch.TeamB));
                if (!a) missedRefs++;
                if (!b) missedRefs++;
                if (a) ordered.push(a);
                if (b) ordered.push(b);
            });

        return { ordered, missedRefs };
    }

    const bracket = stages
        .map(stage => {
            const stageName = getDescription(stage.Name);
            const roundId = resolveRoundId(stageName);
            if (!roundId || roundId === "3RD") return null;

            let matches = [...(stage.Matches || [])];

            if (roundId === "R32") {
                const nextStage = stages.find(
                    s => s.SequenceOrder === stage.SequenceOrder + 1
                );
                const r16 = nextStage && roundIdByStageId[nextStage.IdStage] === "R16"
                    ? nextStage
                    : stageByRoundId.R16;

                // #region agent log
                const r32Before = matches.map(m => ({id:m.IdMatch,num:m.MatchNumber,home:m.HomeTeam?.Abbreviation||m.PlaceHolderA,away:m.AwayTeam?.Abbreviation||m.PlaceHolderB}));
                _dbg('node_helper.js:R32reorder','R32 reorder inputs',{r32IdStage:stage.IdStage,r32Seq:stage.SequenceOrder,r16IdStage:r16?.IdStage,r16MatchOrderUnsorted:r16?.Matches?.map(m=>m.MatchNumber),r16MatchOrderSorted:r16?.Matches?.slice().sort((a,b)=>a.MatchNumber-b.MatchNumber).map(m=>m.MatchNumber)},'B');
                // #endregion

                if (r16) {
                    const { ordered, missedRefs } = reorderR32FromNextRound(matches, r16);

                    // #region agent log
                    _dbg('node_helper.js:R32reorderResult','R32 reorder outcome',{orderedCount:ordered.length,totalCount:matches.length,missedRefs,applied:ordered.length===matches.length,leftHalfTop8:ordered.slice(0,8).map(m=>(m.HomeTeam?.Abbreviation||'?')+' v '+(m.AwayTeam?.Abbreviation||'?'))},'C');
                    // #endregion

                    if (ordered.length === matches.length) {
                        matches = ordered;
                    }
                } else {
                    // #region agent log
                    _dbg('node_helper.js:R32reorderSkip','R32 reorder skipped - no R16 stage found',{r32Before},'D');
                    // #endregion
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
            ["R32", "R16", "QF", "SF", "F"].includes(round.id)
        );

    // #region agent log
    _dbg('node_helper.js:filterResult','Final bracket rounds after filter',{roundIds:bracket.map(r=>r.id)},'E');
    // #endregion

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
