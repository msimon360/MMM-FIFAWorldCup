/* node_helper.js  –  MMM-FIFAWorldCup (bracket edition)
 *
 * Fetches the FIFA World Cup 2026 knockout bracket from ESPN's public API.
 * No API key required.
 */

const NodeHelper = require("node_helper");
let _fetch;
try { _fetch = fetch; } catch { _fetch = require("node-fetch"); }

const ESPN_BRACKET   = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/bracket?season=2026";
const ESPN_SCOREBOARD = "https://site.api.espn.com/apis/v2/sports/soccer/fifa.world/scoreboard?dates=20260628-20260727&limit=100";

module.exports = NodeHelper.create({
  start() { console.log(`[${this.name}] started`); },

  socketNotificationReceived(notification) {
    if (notification === "WC_GET_BRACKET") this.fetchBracket();
  },

  async fetchBracket() {
    try {
      let bracket = await this.fetchESPNBracket();
      if (!bracket || !bracket.length) bracket = await this.buildFromScoreboard();
      if (!bracket || !bracket.length) bracket = this.buildPlaceholderBracket();
      this.sendSocketNotification("WC_BRACKET_RESULT", { bracket });
    } catch (err) {
      console.error(`[${this.name}]`, err.message);
      // Always send placeholder so the module shows something
      this.sendSocketNotification("WC_BRACKET_RESULT", { bracket: this.buildPlaceholderBracket() });
    }
  },

  async fetchESPNBracket() {
    try {
      const res = await _fetch(ESPN_BRACKET, { headers: { "User-Agent": "MagicMirror/MMM-FIFAWorldCup" }, timeout: 10000 });
      if (!res.ok) return null;
      const data = await res.json();
      const rounds = data?.bracket?.rounds ?? data?.rounds ?? [];
      if (!rounds.length) return null;
      return this.parseESPNRounds(rounds);
    } catch { return null; }
  },

  parseESPNRounds(rounds) {
    const IDS   = ["R32","R16","QF","SF","F"];
    const NAMES = ["Round of 32","Round of 16","Quarter-Finals","Semi-Finals","Final"];
    return rounds.map((round, i) => ({
      id:   IDS[i]   || `R${i+1}`,
      name: NAMES[i] || round.displayName || `Round ${i+1}`,
      matches: (round.matchups ?? round.games ?? []).map(m => this.parseESPNMatchup(m)),
    }));
  },

  parseESPNMatchup(m) {
    const competitors = m.competitors ?? m.teams ?? [];
    const [a, b] = competitors;
    const state = m.status?.type?.state ?? "pre";
    return {
      id: m.id,
      status: state === "in" ? "live" : state === "post" ? "final" : "scheduled",
      date: m.date ? new Date(m.date).toLocaleDateString("en-US",{month:"short",day:"numeric"}) : null,
      teamA: a ? { name: a.team?.displayName ?? a.team?.abbreviation ?? "TBD", abbr: a.team?.abbreviation ?? "TBD" } : { name:"TBD", abbr:"TBD" },
      teamB: b ? { name: b.team?.displayName ?? b.team?.abbreviation ?? "TBD", abbr: b.team?.abbreviation ?? "TBD" } : { name:"TBD", abbr:"TBD" },
      scoreA: a?.score ?? null,
      scoreB: b?.score ?? null,
      winner: competitors.find(c => c.winner)?.team?.abbreviation ?? null,
    };
  },

  async buildFromScoreboard() {
    const res = await _fetch(ESPN_SCOREBOARD, { headers: { "User-Agent": "MagicMirror/MMM-FIFAWorldCup" }, timeout: 10000 });
    if (!res.ok) return null;
    const data = await res.json();
    const events = data?.events ?? [];
    const roundMap = {};
    for (const ev of events) {
      const name = ev.competitions?.[0]?.type?.text ?? ev.season?.type?.name ?? "Unknown";
      if (!roundMap[name]) roundMap[name] = [];
      roundMap[name].push(ev);
    }
    const ORDER = ["Round of 32","Round of 16","Quarter-Final","Semi-Final","Final"];
    const IDS   = ["R32","R16","QF","SF","F"];
    const sorted = ORDER.map((name, i) => {
      const key = Object.keys(roundMap).find(k => k.toLowerCase().includes(name.toLowerCase().split(" ")[0]));
      return key ? { id: IDS[i], name, matches: roundMap[key].map(e => this.parseESPNEvent(e)) } : null;
    }).filter(Boolean);
    return sorted.length ? sorted : null;
  },

  parseESPNEvent(ev) {
    const comp = ev.competitions?.[0];
    const competitors = comp?.competitors ?? [];
    const [a, b] = competitors;
    const state = comp?.status?.type?.state ?? "pre";
    return {
      id: ev.id,
      status: state === "in" ? "live" : state === "post" ? "final" : "scheduled",
      date: comp?.date ? new Date(comp.date).toLocaleDateString("en-US",{month:"short",day:"numeric"}) : null,
      teamA: a ? { name: a.team?.displayName ?? "TBD", abbr: a.team?.abbreviation ?? "TBD" } : { name:"TBD", abbr:"TBD" },
      teamB: b ? { name: b.team?.displayName ?? "TBD", abbr: b.team?.abbreviation ?? "TBD" } : { name:"TBD", abbr:"TBD" },
      scoreA: a?.score ?? null,
      scoreB: b?.score ?? null,
      winner: competitors.find(c => c.winner)?.team?.abbreviation ?? null,
    };
  },

  buildPlaceholderBracket() {
    const TBD = (d) => ({ id: Math.random().toString(36).slice(2), status:"scheduled", date:d, teamA:{name:"TBD",abbr:"TBD"}, teamB:{name:"TBD",abbr:"TBD"}, scoreA:null, scoreB:null, winner:null });
    const match = (an, aa, bn, ba, d) => ({ id: Math.random().toString(36).slice(2), status:"scheduled", date:d, teamA:{name:an,abbr:aa}, teamB:{name:bn,abbr:ba}, scoreA:null, scoreB:null, winner:null });

    return [
      { id:"R32", name:"Round of 32", matches:[
        match("England","ENG","Congo DR","COD","Jul 1"),
        match("Belgium","BEL","Senegal","SEN","Jul 1"),
        match("USA","USA","Bosnia-Herz","BIH","Jul 2"),
        match("Spain","ESP","Austria","AUT","Jul 2"),
        match("France","FRA","Sweden","SWE","Jul 2"),
        match("Mexico","MEX","Ecuador","ECU","Jul 3"),
        match("Netherlands","NED","Morocco","MAR","Jul 3"),
        match("Germany","GER","Paraguay","PAR","Jul 3"),
        match("Brazil","BRA","Japan","JPN","Jul 4"),
        match("Ivory Coast","CIV","Norway","NOR","Jul 4"),
        match("Colombia","COL","Portugal","POR","Jul 4"),
        match("Argentina","ARG","TBD","TBD","Jul 5"),
        match("Switzerland","SUI","Canada","CAN","Jul 5"),
        match("S. Africa","RSA","TBD","TBD","Jul 5"),
        match("Croatia","CRO","TBD","TBD","Jul 6"),
        match("Egypt","EGY","TBD","TBD","Jul 6"),
      ]},
      { id:"R16", name:"Round of 16",    matches: Array.from({length:8},  (_,i) => TBD(`Jul ${9+Math.floor(i/2)}`)) },
      { id:"QF",  name:"Quarter-Finals", matches: Array.from({length:4},  (_,i) => TBD(`Jul ${17+Math.floor(i/2)}`)) },
      { id:"SF",  name:"Semi-Finals",    matches: Array.from({length:2},  (_,i) => TBD(`Jul ${22+i}`)) },
      { id:"F",   name:"Final",          matches: [TBD("Jul 27")] },
    ];
  },
});
