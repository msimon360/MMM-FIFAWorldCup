/**
 * Lightweight validation smoke test for bracket schema.
 * Run: npm test
 */
const fs = require("fs");
const path = require("path");
const { validateBracket } = require("../schemas/bracket");

const placeholderPath = path.join(
  __dirname,
  "..",
  "data",
  "placeholder-bracket.json"
);

const data = JSON.parse(fs.readFileSync(placeholderPath, "utf8"));
const result = validateBracket(data);

if (!result.valid) {
  console.error("Validation failed:", result.errors);
  process.exit(1);
}

console.log("Placeholder bracket: valid");

const bad = validateBracket({ rounds: [] });
if (bad.valid) {
  console.error("Expected invalid payload to fail validation");
  process.exit(1);
}

console.log("Invalid payload rejection: ok");
console.log("All tests passed.");
