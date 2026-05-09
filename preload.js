const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  getHacks: () => ipcRenderer.invoke("get-hacks"),
  changeConfig: (cfg) => ipcRenderer.send("change-config", cfg),
});
