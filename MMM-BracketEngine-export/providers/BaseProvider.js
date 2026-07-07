/**
 * Base provider interface for MMM-BracketEngine.
 * Subclasses implement fetchBracket() and return a normalized BracketPayload.
 */
class BaseProvider {
  constructor(config = {}) {
    this.config = config;
  }

  get name() {
    return "base";
  }

  /**
   * @returns {Promise<import("../schemas/bracket").BracketPayload>}
   */
  async fetchBracket() {
    throw new Error(`Provider "${this.name}" does not implement fetchBracket()`);
  }
}

module.exports = BaseProvider;
