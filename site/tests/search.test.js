// The car search (site/public/assets/search.js): words and brand names, and the ranking of hits.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function load(lang) {
  const doc = { documentElement: { lang }, readyState: "complete", querySelectorAll: () => [], getElementById: () => null, addEventListener() {} };
  const ctx = { document: doc, window: {}, localStorage: { getItem: () => null }, fetch: null };
  ctx.window = ctx;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../public/assets/search.js"), "utf8"), ctx);
  return ctx.AlloFind;
}

test("Chinese and long brand names turn into the catalog's make", () => {
  const F = load("zh-Hans");
  assert.deepStrictEqual([...F.words("大众 ID.3")], ["vw", "id3"]);
  assert.deepStrictEqual([...F.words("比亚迪")], ["byd"]);
  assert.deepStrictEqual([...F.words("Volkswagen Golf")], ["vw", "golf"]);
  assert.deepStrictEqual([...F.words("Škoda Enyaq")], ["skoda", "enyaq"]);
});

test("words are normalised the way the catalog is", () => {
  const F = load("en");
  assert.strictEqual(F.norm("Citroën ë-C3"), "citroenec3");
  assert.deepStrictEqual([...F.words("  ex30,  cross ")], ["ex30", "cross"]);
});
