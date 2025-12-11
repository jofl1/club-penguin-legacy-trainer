const fs = require("fs");
const path = require("path");

// Create config.json from example if it doesn't exist
const configPath = path.join(__dirname, "config.json");
const examplePath = path.join(__dirname, "config.json.example");
if (!fs.existsSync(configPath) && fs.existsSync(examplePath)) {
  fs.copyFileSync(examplePath, configPath);
}

const config = require("./config.json");
exports.currentConfig = config;

exports.updateConfig = (newConfig) => {
  for (key in newConfig) config[key] = newConfig[key];
  fs.writeFile("config.json", JSON.stringify(config), () => {});
};

exports.availableHacks = require("./hacks.json");