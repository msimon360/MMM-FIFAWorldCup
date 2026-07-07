/**
 * FIFA knockout bracket provider.
 * Data source: https://api.fifa.com/api/v3/seasonbracket/season/{seasonId}
 */
const BaseProvider = require("./BaseProvider");

let _fetch;
try {
  _fetch = fetch;
} catch {
  _fetch = require("node-fetch");
}

const ROUND_ID_MAP = {
  "round of 32": "R32",
  "round of 16": "R16",
  "quarter-final": "QF",
  "semi-final": "SF",
  "play-off for third place": "3RD",
  final: "F",
};

const VALID_ROUND_IDS = ["R32", "R16", "QF", "SF", "3RD", "F"];

class FifaProvider extends BaseProvider {
  get name() {
    return "fifa";
  }

  get seasonId() {
    return this.config.seasonId || "285023";
  }

  get language() {
    return this.config.language || "en";
  }

  get bracketUrl() {
    return (
      this.config.url ||
      `https://api.fifa.com/api/v3/seasonbracket/season/${this.seasonId}?language=${this.language}`
    );
  }

  async fetchBracket() {
    const res = await _fetch(this.bracketUrl, {
      headers: {
        "User-Agent": "MagicMirror/MMM-BracketEngine",
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      throw new Error(`FIFA API HTTP ${res.status}`);
    }

    const data = await res.json();
    const rounds = this.parseBracket(data);

    return {
      meta: {
        title: this.config.title || "FIFA World Cup",
        sport: "soccer",
        icon: "⚽",
        updatedAt: new Date().toISOString(),
      },
      rounds,
    };
  }

  parseBracket(data) {
    const stages = [...(data.KnockoutStages || [])].sort(
      (a, b) => a.SequenceOrder - b.SequenceOrder
    );

    const getDescription = value => {
      if (!value) return "";
      if (typeof value === "string") return value;
      if (Array.isArray(value)) return value[0]?.Description || "";
      return value.Description || "";
    };

    const resolveRoundId = stageName =>
      ROUND_ID_MAP[stageName.toLowerCase()] ?? null;

    const roundIdByStageId = {};
    const stageByRoundId = {};
    stages.forEach(stage => {
      const stageName = getDescription(stage.Name);
      const roundId = resolveRoundId(stageName);
      roundIdByStageId[stage.IdStage] = roundId;
      if (roundId) stageByRoundId[roundId] = stage;
    });

    const reorderR32FromNextRound = (r32Matches, nextStage) => {
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
    };

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
          const r16 =
            nextStage && roundIdByStageId[nextStage.IdStage] === "R16"
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
          matches: matches.map(m => this.parseMatch(m)),
        };
      })
      .filter(Boolean)
      .filter(round => VALID_ROUND_IDS.includes(round.id));
  }

  parseMatch(m) {
    const home = m.HomeTeam;
    const away = m.AwayTeam;

    const status =
      m.MatchStatus === 0 ? "final" : m.MatchStatus === 3 ? "live" : "scheduled";

    const scoreH = home?.Score ?? null;
    const scoreA = away?.Score ?? null;
    const penH = m.HomeTeamPenaltyScore ?? null;
    const penA = m.AwayTeamPenaltyScore ?? null;

    const winnerId = m.Winner ?? null;
    let winnerAbbr = null;
    if (winnerId) {
      if (home?.IdTeam === winnerId) winnerAbbr = home?.Abbreviation ?? null;
      else if (away?.IdTeam === winnerId) winnerAbbr = away?.Abbreviation ?? null;
    }

    const dateStr = m.Date
      ? new Date(m.Date).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })
      : null;

    return {
      id: m.IdMatch,
      status,
      date: dateStr,
      teamA: home
        ? {
            name:
              home.TeamName?.[0]?.Description ??
              home.ShortClubName ??
              "TBD",
            abbr: home.Abbreviation ?? "TBD",
            isPlaceholder: false,
          }
        : {
            name: m.PlaceHolderA || "TBD",
            abbr: m.PlaceHolderA || "TBD",
            isPlaceholder: true,
          },
      teamB: away
        ? {
            name:
              away.TeamName?.[0]?.Description ??
              away.ShortClubName ??
              "TBD",
            abbr: away.Abbreviation ?? "TBD",
            isPlaceholder: false,
          }
        : {
            name: m.PlaceHolderB || "TBD",
            abbr: m.PlaceHolderB || "TBD",
            isPlaceholder: true,
          },
      scoreA: scoreH,
      scoreB: scoreA,
      penA: penH,
      penB: penA,
      winner: winnerAbbr,
    };
  }
}

module.exports = FifaProvider;
