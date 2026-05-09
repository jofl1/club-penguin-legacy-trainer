const fs = require("fs");
const http = require("http");
const https = require("https");
const crypto = require("crypto");
const { pipeline } = require("stream/promises");

const DEFAULT_TIMEOUT = 30000;
const MAX_REDIRECTS = 5;

const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * Download a file from a URL to a local path.
 * @param {string} url
 * @param {string} targetFile
 * @param {object} [options]
 * @param {number} [options.timeout=30000]
 * @param {string} [options.expectedSha256] - lower-case hex digest; on mismatch the file is unlinked and an error is thrown
 * @param {number} [options.redirectCount] - internal redirect counter
 * @returns {Promise<{sha256: string, bytes: number}>}
 */
exports.downloadFile = async (url, targetFile, options = {}) => {
  const { timeout = DEFAULT_TIMEOUT, expectedSha256, redirectCount = 0 } = options;

  if (redirectCount > MAX_REDIRECTS) {
    throw new Error(`Too many redirects (max ${MAX_REDIRECTS})`);
  }

  console.log("Downloading:", url);

  const parsedUrl = new URL(url);
  const client = parsedUrl.protocol === "https:" ? https : http;

  const requestOptions = {
    hostname: parsedUrl.hostname,
    path: parsedUrl.pathname + parsedUrl.search,
    port: parsedUrl.port || (parsedUrl.protocol === "https:" ? 443 : 80),
    timeout,
    headers: {
      "User-Agent": USER_AGENT,
      "Accept": "*/*",
    },
  };

  return new Promise((resolve, reject) => {
    const req = client.get(requestOptions, async (response) => {
      const { statusCode, statusMessage, headers } = response;
      console.log("Response:", statusCode, statusMessage);

      // Handle redirects
      if (statusCode >= 300 && statusCode < 400 && headers.location) {
        response.resume();
        try {
          const result = await exports.downloadFile(headers.location, targetFile, {
            timeout,
            expectedSha256,
            redirectCount: redirectCount + 1,
          });
          resolve(result);
        } catch (err) {
          reject(err);
        }
        return;
      }

      // Handle errors
      if (statusCode >= 400) {
        response.resume();
        reject(new Error(`HTTP ${statusCode}: ${statusMessage}`));
        return;
      }

      const fileStream = fs.createWriteStream(targetFile);
      const hash = crypto.createHash("sha256");
      let bytes = 0;
      response.on("data", (chunk) => {
        hash.update(chunk);
        bytes += chunk.length;
      });

      const unlinkSafe = () => {
        try { fs.unlinkSync(targetFile); } catch {}
      };

      try {
        await pipeline(response, fileStream);
      } catch (err) {
        unlinkSafe();
        reject(new Error(`Failed to write file: ${err.message}`));
        return;
      }

      if (bytes === 0) {
        unlinkSafe();
        reject(new Error("Download produced zero bytes"));
        return;
      }

      const sha256 = hash.digest("hex");

      if (expectedSha256 && sha256 !== expectedSha256.toLowerCase()) {
        unlinkSafe();
        reject(new Error(
          `SHA-256 mismatch for ${url}: expected ${expectedSha256}, got ${sha256}`
        ));
        return;
      }

      resolve({ sha256, bytes });
    });

    req.on("error", (err) => {
      reject(new Error(`Request failed: ${err.message}`));
    });

    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Request timed out after ${timeout}ms`));
    });
  });
};
