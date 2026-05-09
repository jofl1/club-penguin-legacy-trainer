const path = require("path");
const { app, BrowserWindow, session } = require("electron");
const { syncHacksOnLocalServer } = require("./hacks");
const { setupIpcHandlers } = require("./ipc");

const { setupLocalServer } = require("./server");

setupIpcHandlers();

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 820,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.loadFile("public/index.html");

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("file://")) event.preventDefault();
  });

  if (app.isPackaged) {
    mainWindow.webContents.on("devtools-opened", () => {
      mainWindow.webContents.closeDevTools();
    });
  }
};

app.on("web-contents-created", (_, contents) => {
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
});

app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));

  await setupLocalServer();
  createWindow();

  await syncHacksOnLocalServer();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
