/**
 * Static JSON bracket provider for offline testing and custom brackets.
 */
const fs = require("fs");
const path = require("path");
const BaseProvider = require("./BaseProvider");

class StaticProvider extends BaseProvider {
  get name() {
    return "static";
  }

  async fetchBracket() {
    let data;

    if (this.config.bracketData) {
      data =
        typeof this.config.bracketData === "string"
          ? JSON.parse(this.config.bracketData)
          : this.config.bracketData;
    } else {
      const filePath =
        this.config.filePath ||
        path.join(__dirname, "..", "data", "placeholder-bracket.json");

      const resolved = path.isAbsolute(filePath)
        ? filePath
        : path.resolve(filePath);

      const raw = fs.readFileSync(resolved, "utf8");
      data = JSON.parse(raw);
    }

    if (!data.meta?.updatedAt) {
      data.meta = { ...data.meta, updatedAt: new Date().toISOString() };
    }

    return data;
  }
}

module.exports = StaticProvider;
