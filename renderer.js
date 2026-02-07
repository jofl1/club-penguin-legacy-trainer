const ipcRenderer = require("electron").ipcRenderer;

const goToTab = (tab) => {
  document.getElementById("tab-holder").className = "show-" + tab;
};

document
  .getElementById("btn-play")
  .addEventListener("click", () => goToTab("play"));

document
  .getElementById("btn-hacks")
  .addEventListener("click", () => goToTab("hacks"));

const getHacks = () => {
  const hacksContainer = document.getElementById("hacks");
  ipcRenderer.invoke("get-hacks").then((hacks) => {
    for (let i = 0; i < hacks.length; i++) {
      const hack = hacks[i];
      const hackElement = document.createElement("div");
      hackElement.className = "hack";

      const checkboxElement = document.createElement("input");
      checkboxElement.type = "checkbox";
      checkboxElement.id = "chk-hack-" + hack.id;
      checkboxElement.className = "hack-checkbox";
      checkboxElement.checked = hack.enabled;

      const labelElement = document.createElement("label");
      labelElement.setAttribute("for", "chk-hack-" + hack.id);
      labelElement.textContent = hack.title;

      const descriptionElement = document.createElement("div");
      descriptionElement.className = "hack-description";
      descriptionElement.textContent = hack.description;

      hackElement.appendChild(checkboxElement);
      hackElement.appendChild(labelElement);
      hackElement.appendChild(descriptionElement);
      
      hacksContainer.appendChild(hackElement);
    }
  });
};

const saveHacks = () => {
  const checkboxes = document.getElementsByClassName("hack-checkbox");
  const config = {};
  for (let i = 0; i < checkboxes.length; i++) {
    const checkbox = checkboxes[i];
    config[checkbox.id.replace("chk-hack-", "")] = checkbox.checked;
  }
  ipcRenderer.send("change-config", config);
}

document.getElementById("btn-save-hacks").addEventListener("click", () => {
  saveHacks();
});

getHacks();