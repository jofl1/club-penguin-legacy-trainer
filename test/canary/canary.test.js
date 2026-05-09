/**
 * Live upstream canary.
 *
 * For each hack in hacks.json: download the upstream SWF, export with FFDec,
 * and assert that every replacement.find string matches at least one of the
 * declared scriptPaths after the matcher's CRLF→LF normalisation.
 *
 * If this test fails, the hack will fail to deploy in production for end users
 * — usually because the upstream SWF was rebuilt with different content
 * around the patch site. Update hacks.json (or the matcher) and re-run.
 *
 * Excluded from the default `npm test` because it does network + Java + ~30s.
 * Run with `npm run test:canary` locally or via the canary GitHub Action.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const { downloadFile } = require("../../download");
const { setupFFDec, exportScripts, verifyJava } = require("../../ffdec");
const { applyReplacements, excerptAroundAnchor } = require("../../matcher");
const hacks = require("../../hacks.json");

// Big timeout: 60s for the whole suite (download + JVM start + export + match).
const TIMEOUT_MS = 60_000;

let suiteTmpDir;
let javaAvailable = false;

test.before(async () => {
  suiteTmpDir = path.join(os.tmpdir(), `cp-canary-${crypto.randomUUID()}`);
  fs.mkdirSync(suiteTmpDir, { recursive: true });
  const j = await verifyJava();
  javaAvailable = j.available;
  if (javaAvailable) await setupFFDec();
});

test.after(() => {
  if (suiteTmpDir && fs.existsSync(suiteTmpDir)) {
    fs.rmSync(suiteTmpDir, { recursive: true, force: true });
  }
});

for (const [key, hack] of Object.entries(hacks)) {
  test(`canary: ${key} matches upstream`, { timeout: TIMEOUT_MS }, async (t) => {
    if (!javaAvailable) {
      t.skip("Java not available — skipping live canary");
      return;
    }

    const hackTmp = path.join(suiteTmpDir, key);
    fs.mkdirSync(hackTmp, { recursive: true });

    const swfPath = path.join(hackTmp, path.basename(new URL(hack.url).pathname));
    await downloadFile(hack.url, swfPath, { expectedSha256: hack.sha256 });
    assert.ok(fs.existsSync(swfPath), "download should produce a file");

    const exportDir = path.join(hackTmp, "scripts_export");
    await exportScripts(swfPath, exportDir);

    const scriptPaths = hack.scriptPaths || [hack.scriptPath];
    const failures = [];

    for (const replacement of hack.replacements) {
      let matchedAt = null;
      for (const scriptPath of scriptPaths) {
        const file = path.join(exportDir, scriptPath);
        if (!fs.existsSync(file)) continue;
        const content = fs.readFileSync(file, "utf8");
        const r = applyReplacements(content, [replacement]);
        if (r.modified) {
          matchedAt = scriptPath;
          break;
        }
      }
      if (!matchedAt) {
        const diagnostics = scriptPaths
          .filter((p) => fs.existsSync(path.join(exportDir, p)))
          .map((p) => {
            const content = fs.readFileSync(path.join(exportDir, p), "utf8")
              .replace(/\r\n/g, "\n");
            const e = excerptAroundAnchor(content, replacement);
            return e.found
              ? `  ${p}: anchor found, find did not match. Excerpt: ${JSON.stringify(e.excerpt)}`
              : `  ${p}: anchor "${e.anchor}" not present`;
          })
          .join("\n");
        failures.push(
          `Replacement did not match any scriptPath for ${key}.\n` +
          `find (first 80 chars): ${JSON.stringify(replacement.find.slice(0, 80))}\n` +
          `${diagnostics}`
        );
      }
    }

    assert.equal(
      failures.length, 0,
      "Hack would fail to deploy:\n\n" + failures.join("\n\n")
    );
  });
}
