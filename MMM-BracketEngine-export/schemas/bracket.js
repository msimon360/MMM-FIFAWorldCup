/**
 * Common bracket data contract for MMM-BracketEngine.
 * All providers must normalize their API output to this shape.
 */

const ROUND_ORDER = ["R32", "R16", "QF", "SF", "3RD", "F"];

const VALID_STATUSES = new Set(["scheduled", "live", "final"]);

const ROUND_LABELS = {
  R32: "Rd of 32",
  R16: "Rd of 16",
  QF: "Quarters",
  SF: "Semis",
  "3RD": "3rd Place",
  F: "Final",
  R8: "Rd of 8",
  R4: "Semis",
};

const SPORT_ICONS = {
  soccer: "⚽",
  hockey: "🏒",
  basketball: "🏀",
  football: "🏈",
  baseball: "⚾",
  tennis: "🎾",
  generic: "🏆",
};

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateTeam(team, path) {
  const errors = [];
  if (!isObject(team)) {
    errors.push(`${path}: team must be an object`);
    return errors;
  }
  if (typeof team.name !== "string" || !team.name) {
    errors.push(`${path}.name: required string`);
  }
  if (typeof team.abbr !== "string" || !team.abbr) {
    errors.push(`${path}.abbr: required string`);
  }
  return errors;
}

function validateMatch(match, path) {
  const errors = [];
  if (!isObject(match)) {
    errors.push(`${path}: match must be an object`);
    return errors;
  }
  if (match.id === undefined || match.id === null) {
    errors.push(`${path}.id: required`);
  }
  if (!VALID_STATUSES.has(match.status)) {
    errors.push(`${path}.status: must be scheduled, live, or final`);
  }
  errors.push(...validateTeam(match.teamA, `${path}.teamA`));
  errors.push(...validateTeam(match.teamB, `${path}.teamB`));
  return errors;
}

function validateRound(round, path) {
  const errors = [];
  if (!isObject(round)) {
    errors.push(`${path}: round must be an object`);
    return errors;
  }
  if (typeof round.id !== "string" || !round.id) {
    errors.push(`${path}.id: required string`);
  }
  if (typeof round.name !== "string" || !round.name) {
    errors.push(`${path}.name: required string`);
  }
  if (!Array.isArray(round.matches)) {
    errors.push(`${path}.matches: must be an array`);
    return errors;
  }
  round.matches.forEach((match, i) => {
    errors.push(...validateMatch(match, `${path}.matches[${i}]`));
  });
  return errors;
}

/**
 * @param {object} payload
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateBracket(payload) {
  const errors = [];

  if (!isObject(payload)) {
    return { valid: false, errors: ["payload must be an object"] };
  }

  if (!isObject(payload.meta)) {
    errors.push("meta: required object");
  } else {
    if (typeof payload.meta.title !== "string" || !payload.meta.title) {
      errors.push("meta.title: required string");
    }
    if (typeof payload.meta.sport !== "string" || !payload.meta.sport) {
      errors.push("meta.sport: required string");
    }
  }

  if (!Array.isArray(payload.rounds) || payload.rounds.length === 0) {
    errors.push("rounds: required non-empty array");
  } else {
    payload.rounds.forEach((round, i) => {
      errors.push(...validateRound(round, `rounds[${i}]`));
    });
  }

  return { valid: errors.length === 0, errors };
}

function sortRounds(rounds) {
  const order = new Map(ROUND_ORDER.map((id, i) => [id, i]));
  return [...rounds].sort((a, b) => {
    const ai = order.has(a.id) ? order.get(a.id) : 999;
    const bi = order.has(b.id) ? order.get(b.id) : 999;
    return ai - bi;
  });
}

function getSideRounds(rounds) {
  return sortRounds(rounds).filter(r => r.id !== "F" && r.id !== "3RD");
}

function getRoundLabel(id) {
  return ROUND_LABELS[id] || id;
}

function getSportIcon(sport) {
  return SPORT_ICONS[sport] || SPORT_ICONS.generic;
}

module.exports = {
  ROUND_ORDER,
  ROUND_LABELS,
  SPORT_ICONS,
  validateBracket,
  sortRounds,
  getSideRounds,
  getRoundLabel,
  getSportIcon,
};
