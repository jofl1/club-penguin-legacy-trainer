const { ipcMain } = require("electron");
const { updateConfig, availableHacks, currentConfig } = require("./config");
const { syncHacksOnLocalServer } = require("./hacks");

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const isFromMainFrame = (event) => {
  const sender = event.sender;
  return event.senderFrame === sender.mainFrame;
};

const sanitizeConfig = (arg) => {
  if (typeof arg !== "object" || arg === null || Array.isArray(arg)) return null;
  const clean = {};
  for (const key of Object.keys(arg)) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    if (!Object.prototype.hasOwnProperty.call(availableHacks, key)) continue;
    if (typeof arg[key] !== "boolean") continue;
    clean[key] = arg[key];
  }
  return clean;
};

exports.setupIpcHandlers = () => {
  ipcMain.on("change-config", (event, arg) => {
    if (!isFromMainFrame(event)) {
      console.warn("Rejecting change-config from non-main frame");
      return;
    }
    const clean = sanitizeConfig(arg);
    if (!clean) {
      console.warn("Rejecting change-config: invalid payload");
      return;
    }
    updateConfig(clean);
    syncHacksOnLocalServer();
  });

  ipcMain.handle("get-hacks", (event) => {
    if (!isFromMainFrame(event)) {
      console.warn("Rejecting get-hacks from non-main frame");
      return [];
    }
    const result = [];
    for (const key of Object.keys(availableHacks)) {
      const hack = availableHacks[key];
      result.push({
        id: hack.id,
        title: hack.title,
        description: hack.description,
        enabled: Boolean(currentConfig[key]),
      });
    }
    return result;
  });
};
