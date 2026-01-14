const fs = require("fs");
const http = require("http");
const https = require("https");
const { pipeline } = require("stream/promises");

const DEFAULT_TIMEOUT = 30000;
const MAX_REDIRECTS = 5;

const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * Download a file from a URL to a local path
 * @param {string} url - The URL to download from
 * @param {string} targetFile - The local file path to save to
 * @param {object} options - Optional settings
 * @param {number} options.timeout - Request timeout in ms (default: 30000)
 * @param {number} options.redirectCount - Internal redirect counter
 */
exports.downloadFile = async (url, targetFile, options = {}) => {
  const { timeout = DEFAULT_TIMEOUT, redirectCount = 0 } = options;

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
        response.resume(); // Consume response to free up memory
        try {
          await exports.downloadFile(headers.location, targetFile, {
            timeout,
            redirectCount: redirectCount + 1,
          });
          resolve();
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

      // Stream response to file
      const fileStream = fs.createWriteStream(targetFile);

      try {
        await pipeline(response, fileStream);
        resolve();
      } catch (err) {
        // Clean up partial file on error
        fs.unlink(targetFile, () => {});
        reject(new Error(`Failed to write file: ${err.message}`));
      }
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
