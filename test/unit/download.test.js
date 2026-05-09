const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const { downloadFile } = require("../../download");

const startServer = (handler) =>
  new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, port, url: `http://127.0.0.1:${port}` });
    });
  });

const stop = (server) => new Promise((resolve) => server.close(resolve));

const tmpFile = () =>
  path.join(os.tmpdir(), `cp-test-${crypto.randomUUID()}.bin`);

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

test("downloadFile: writes body and returns sha256 + bytes", async () => {
  const body = Buffer.from("hello world");
  const { server, url } = await startServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/octet-stream" });
    res.end(body);
  });
  const target = tmpFile();
  try {
    const r = await downloadFile(url + "/x", target);
    assert.equal(fs.readFileSync(target, "utf8"), "hello world");
    assert.equal(r.sha256, sha256(body));
    assert.equal(r.bytes, body.length);
  } finally {
    fs.rmSync(target, { force: true });
    await stop(server);
  }
});

test("downloadFile: rejects on SHA-256 mismatch and unlinks file", async () => {
  const { server, url } = await startServer((_req, res) => {
    res.writeHead(200);
    res.end("payload");
  });
  const target = tmpFile();
  try {
    await assert.rejects(
      downloadFile(url + "/x", target, { expectedSha256: "0".repeat(64) }),
      /SHA-256 mismatch/
    );
    assert.equal(fs.existsSync(target), false, "file must be unlinked on mismatch");
  } finally {
    fs.rmSync(target, { force: true });
    await stop(server);
  }
});

test("downloadFile: accepts matching SHA-256", async () => {
  const body = Buffer.from("trusted-payload");
  const { server, url } = await startServer((_req, res) => {
    res.writeHead(200);
    res.end(body);
  });
  const target = tmpFile();
  try {
    const expected = sha256(body);
    const r = await downloadFile(url + "/x", target, { expectedSha256: expected });
    assert.equal(r.sha256, expected);
    assert.equal(fs.readFileSync(target, "utf8"), "trusted-payload");
  } finally {
    fs.rmSync(target, { force: true });
    await stop(server);
  }
});

test("downloadFile: SHA verify is case-insensitive on hex digest", async () => {
  const body = Buffer.from("case-test");
  const { server, url } = await startServer((_req, res) => {
    res.writeHead(200);
    res.end(body);
  });
  const target = tmpFile();
  try {
    const expected = sha256(body).toUpperCase();
    const r = await downloadFile(url + "/x", target, { expectedSha256: expected });
    assert.equal(r.sha256, expected.toLowerCase());
  } finally {
    fs.rmSync(target, { force: true });
    await stop(server);
  }
});

test("downloadFile: rejects zero-byte response", async () => {
  const { server, url } = await startServer((_req, res) => {
    res.writeHead(200, { "Content-Length": "0" });
    res.end();
  });
  const target = tmpFile();
  try {
    await assert.rejects(downloadFile(url + "/x", target), /zero bytes/);
    assert.equal(fs.existsSync(target), false, "zero-byte file must be unlinked");
  } finally {
    fs.rmSync(target, { force: true });
    await stop(server);
  }
});

test("downloadFile: follows 302 redirect", async () => {
  const body = Buffer.from("after-redirect");
  let hits = 0;
  const { server, url } = await startServer((req, res) => {
    hits++;
    if (req.url === "/start") {
      res.writeHead(302, { Location: url + "/end" });
      res.end();
      return;
    }
    res.writeHead(200);
    res.end(body);
  });
  const target = tmpFile();
  try {
    const r = await downloadFile(url + "/start", target);
    assert.equal(r.sha256, sha256(body));
    assert.equal(hits, 2, "expected 2 hits: /start then /end");
  } finally {
    fs.rmSync(target, { force: true });
    await stop(server);
  }
});

test("downloadFile: rejects 404 with HTTP error", async () => {
  const { server, url } = await startServer((_req, res) => {
    res.writeHead(404);
    res.end("nope");
  });
  const target = tmpFile();
  try {
    await assert.rejects(downloadFile(url + "/x", target), /HTTP 404/);
  } finally {
    fs.rmSync(target, { force: true });
    await stop(server);
  }
});

test("downloadFile: rejects redirect loop after MAX_REDIRECTS", async () => {
  const { server, url } = await startServer((_req, res) => {
    res.writeHead(302, { Location: url + "/loop" });
    res.end();
  });
  const target = tmpFile();
  try {
    await assert.rejects(downloadFile(url + "/loop", target), /Too many redirects/);
  } finally {
    fs.rmSync(target, { force: true });
    await stop(server);
  }
});
