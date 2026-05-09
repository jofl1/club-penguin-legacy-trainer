const test = require("node:test");
const assert = require("node:assert/strict");

const { sanitizeConfig } = require("../../validate");

const HACKS = {
  "hack-a": { id: "hack-a" },
  "hack-b": { id: "hack-b" },
};

test("sanitizeConfig: accepts a clean payload", () => {
  const r = sanitizeConfig({ "hack-a": true, "hack-b": false }, HACKS);
  assert.deepEqual(r, { "hack-a": true, "hack-b": false });
});

test("sanitizeConfig: drops unknown hack ids", () => {
  const r = sanitizeConfig({ "hack-a": true, "hack-evil": true }, HACKS);
  assert.deepEqual(r, { "hack-a": true });
});

test("sanitizeConfig: drops non-boolean values", () => {
  const r = sanitizeConfig({ "hack-a": "true", "hack-b": 1 }, HACKS);
  assert.deepEqual(r, {});
});

test("sanitizeConfig: rejects null", () => {
  assert.equal(sanitizeConfig(null, HACKS), null);
});

test("sanitizeConfig: rejects arrays", () => {
  assert.equal(sanitizeConfig([], HACKS), null);
  assert.equal(sanitizeConfig(["hack-a"], HACKS), null);
});

test("sanitizeConfig: rejects non-objects", () => {
  assert.equal(sanitizeConfig("string", HACKS), null);
  assert.equal(sanitizeConfig(42, HACKS), null);
  assert.equal(sanitizeConfig(true, HACKS), null);
  assert.equal(sanitizeConfig(undefined, HACKS), null);
});

test("sanitizeConfig: blocks __proto__ pollution attempt", () => {
  const before = ({}).polluted;
  const malicious = JSON.parse('{"__proto__": {"polluted": true}, "hack-a": true}');
  const r = sanitizeConfig(malicious, HACKS);
  assert.deepEqual(r, { "hack-a": true });
  assert.equal(({}).polluted, before, "Object.prototype must not be polluted");
});

test("sanitizeConfig: blocks constructor and prototype keys", () => {
  const r = sanitizeConfig({
    constructor: true,
    prototype: true,
    "hack-a": true,
  }, HACKS);
  assert.deepEqual(r, { "hack-a": true });
});

test("sanitizeConfig: returns empty object for empty input", () => {
  assert.deepEqual(sanitizeConfig({}, HACKS), {});
});

test("sanitizeConfig: ignores inherited properties", () => {
  const proto = { "hack-a": true };
  const obj = Object.create(proto);
  obj["hack-b"] = false;
  const r = sanitizeConfig(obj, HACKS);
  assert.deepEqual(r, { "hack-b": false });
});
