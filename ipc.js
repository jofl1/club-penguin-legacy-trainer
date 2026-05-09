const { ipcMain } = require("electron");
const { updateConfig, availableHacks, currentConfig } = require("./config");
const { syncHacksOnLocalServer } = require("./hacks");
const { sanitizeConfig } = require("./validate");

const isFromMainFrame = (event) => {
  const sender = event.sender;
  return event.senderFrame === sender.mainFrame;
};

exports.setupIpcHandlers = () => {
  ipcMain.on("change-config", (event, arg) => {
    if (!isFromMainFrame(event)) {
      console.warn("Rejecting change-config from non-main frame");
      return;
    }
    const clean = sanitizeConfig(arg, availableHacks);
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
