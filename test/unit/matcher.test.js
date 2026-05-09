const test = require("node:test");
const assert = require("node:assert/strict");

const { applyReplacements, excerptAroundAnchor } = require("../../matcher");

test("applyReplacements: matches LF find against CRLF content", () => {
  const content = "alpha\r\nbeta\r\ngamma\r\n";
  const replacements = [{ find: "alpha\nbeta", replace: "ALPHA\nBETA" }];
  const r = applyReplacements(content, replacements);
  assert.equal(r.modified, true);
  assert.equal(r.content, "ALPHA\nBETA\ngamma\n");
  assert.equal(r.unmatched.length, 0);
});

test("applyReplacements: matches LF find against LF content", () => {
  const content = "one\ntwo\nthree\n";
  const r = applyReplacements(content, [{ find: "two", replace: "TWO" }]);
  assert.equal(r.modified, true);
  assert.equal(r.content, "one\nTWO\nthree\n");
});

test("applyReplacements: no-match returns unmatched and false modified", () => {
  const content = "hello world";
  const replacement = { find: "missing", replace: "X" };
  const r = applyReplacements(content, [replacement]);
  assert.equal(r.modified, false);
  assert.equal(r.content, "hello world");
  assert.equal(r.unmatched.length, 1);
  assert.equal(r.unmatched[0].replacement, replacement);
});

test("applyReplacements: replaces only the first occurrence", () => {
  const r = applyReplacements("aa aa aa", [{ find: "aa", replace: "BB" }]);
  assert.equal(r.content, "BB aa aa");
});

test("applyReplacements: chains multiple replacements left-to-right", () => {
  const r = applyReplacements("foo bar baz", [
    { find: "foo", replace: "FOO" },
    { find: "baz", replace: "BAZ" },
  ]);
  assert.equal(r.modified, true);
  assert.equal(r.content, "FOO bar BAZ");
});

test("applyReplacements: partial-success records unmatched", () => {
  const r = applyReplacements("only-foo", [
    { find: "foo", replace: "FOO" },
    { find: "missing", replace: "X" },
  ]);
  assert.equal(r.modified, true);
  assert.equal(r.content, "only-FOO");
  assert.equal(r.unmatched.length, 1);
  assert.equal(r.unmatched[0].replacement.find, "missing");
});

test("excerptAroundAnchor: returns ±100 chars around anchor", () => {
  const padding = "x".repeat(150);
  const content = padding + "ANCHOR" + padding;
  const r = excerptAroundAnchor(content, { find: "irrelevant", anchor: "ANCHOR" });
  assert.equal(r.found, true);
  assert.equal(r.anchor, "ANCHOR");
  assert.ok(r.excerpt.includes("ANCHOR"));
  assert.equal(r.excerpt.length, 206); // 100 + "ANCHOR".length + 100
});

test("excerptAroundAnchor: falls back to first 40 chars of find", () => {
  const find = "the-quick-brown-fox-jumps-over-the-lazy-dog-extra";
  const content = "prefix " + find + " suffix";
  const r = excerptAroundAnchor(content, { find });
  assert.equal(r.found, true);
  assert.equal(r.anchor, find.slice(0, 40));
});

test("excerptAroundAnchor: returns found:false when anchor missing", () => {
  const r = excerptAroundAnchor("nothing here", { find: "missing", anchor: "absent" });
  assert.equal(r.found, false);
  assert.equal(r.anchor, "absent");
  assert.equal(r.excerpt, undefined);
});
