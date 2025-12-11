const fs = require("fs");
const http = require("http");
const https = require("https");

exports.downloadFile = async (url, targetFile) =>
  await new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      port: parsedUrl.port || (parsedUrl.protocol === "https:" ? 443 : 80),
      timeout: 30000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "*/*",
      },
    };
    console.log("Downloading:", url);
    const req = (parsedUrl.protocol === "https:" ? https : http)
      .get(options, (response) => {
        const code = response.statusCode ?? 0;
        console.log("Response:", code, response.statusMessage);

        if (code >= 400) {
          return reject(new Error(response.statusMessage));
        }

        if (code > 300 && code < 400 && !!response.headers.location) {
          exports.downloadFile(response.headers.location, targetFile)
            .then(resolve)
            .catch(reject);
          return;
        }

        const fileWriter = fs.createWriteStream(targetFile).on("finish", () => {
          resolve({});
        });

        response.pipe(fileWriter);
      })
      .on("error", (error) => {
        reject(error);
      })
      .on("timeout", () => {
        req.destroy();
        reject(new Error("Request timed out"));
      });

    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error("Socket timed out"));
    });
  });
