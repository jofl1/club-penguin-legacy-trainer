const { session } = require("electron");
const path = require("path");
const http = require("http");
const fs = require("fs");
const net = require("net");

const { CDN_URL } = require("./consts");
const { availableHacks, currentConfig } = require("./config");

const DEFAULT_PORT = 8420;
const PORT_RANGE = 10; // Try up to 10 ports

let activePort = null;

// Check if a port is available
const isPortAvailable = (port) =>
  new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close();
      resolve(true);
    });
    server.listen(port, "127.0.0.1");
  });

// Find an available port starting from DEFAULT_PORT
const findAvailablePort = async () => {
  for (let port = DEFAULT_PORT; port < DEFAULT_PORT + PORT_RANGE; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
    console.log(`Port ${port} is in use, trying next...`);
  }
  throw new Error(
    `No available ports found in range ${DEFAULT_PORT}-${DEFAULT_PORT + PORT_RANGE - 1}. ` +
    `Please close other applications using these ports.`
  );
};

const setupRequestListener = () => {
  if (activePort === null) {
    console.error("Cannot setup request listener: server not started");
    return;
  }

  const hacksByUrl = {};
  for (const key in availableHacks) {
    if (Object.prototype.hasOwnProperty.call(availableHacks, key)) {
      const hack = availableHacks[key];
      hacksByUrl[hack.url] = hack;
    }
  }

  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const hack = hacksByUrl[details.url];
    if (!hack || !currentConfig[hack.id]) {
      callback({});
      return;
    }
    callback({
      redirectURL: details.url.replace(CDN_URL, `http://127.0.0.1:${activePort}`),
    });
  });
};

exports.setupLocalServer = async () => {
  try {
    const port = await findAvailablePort();

    const server = http.createServer((req, res) => {
      const filePath = path.join(__dirname, "server", req.url);

      // Security: prevent directory traversal
      const resolvedPath = path.resolve(filePath);
      const serverDir = path.resolve(path.join(__dirname, "server"));
      if (!resolvedPath.startsWith(serverDir)) {
        console.error("Blocked directory traversal attempt:", req.url);
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }

      fs.readFile(filePath, (err, file) => {
        if (err) {
          console.error("Failed to serve:", req.url, err.message);
          res.writeHead(404);
          res.end("File not found");
          return;
        }
        res.setHeader("Content-Type", "application/x-shockwave-flash");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.writeHead(200);
        res.end(file);
      });
    });

    server.on("error", (err) => {
      console.error("Server error:", err.message);
    });

    await new Promise((resolve, reject) => {
      server.listen(port, "127.0.0.1", () => {
        activePort = port;
        console.log(`Local server started on port ${port}`);
        resolve();
      });
      server.once("error", reject);
    });

    setupRequestListener();
    return { success: true, port };

  } catch (err) {
    console.error("Failed to start local server:", err.message);
    return { success: false, error: err.message };
  }
};

exports.getActivePort = () => activePort;
