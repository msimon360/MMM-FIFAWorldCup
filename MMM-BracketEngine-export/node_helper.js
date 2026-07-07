const NodeHelper = require("node_helper");
const { validateBracket } = require("./schemas/bracket");
const FifaProvider = require("./providers/FifaProvider");
const StaticProvider = require("./providers/StaticProvider");

const PROVIDERS = {
  fifa: FifaProvider,
  static: StaticProvider,
};

module.exports = NodeHelper.create({
  start() {
    console.log(`[${this.name}] started — provider router`);
  },

  socketNotificationReceived(notification, payload) {
    if (notification !== "BE_GET_BRACKET") return;

    const providerName = payload?.provider || "fifa";
    const Provider = PROVIDERS[providerName];

    if (!Provider) {
      this.sendSocketNotification(
        "BE_BRACKET_ERROR",
        `Unknown provider: ${providerName}`
      );
      return;
    }

    const instance = new Provider(payload?.providerConfig || {});

    instance
      .fetchBracket()
      .then(data => {
        const result = validateBracket(data);
        if (!result.valid) {
          throw new Error(result.errors.join("; "));
        }
        this.sendSocketNotification("BE_BRACKET_RESULT", data);
      })
      .catch(err => {
        console.error(`[${this.name}] Provider "${providerName}" error:`, err);
        this.sendSocketNotification("BE_BRACKET_ERROR", err.toString());
      });
  },
});
