const fs = require("fs");
const path = require("path");

const configPath = path.join(__dirname, "config.json");
const examplePath = path.join(__dirname, "config.json.example");

// Load and validate hacks.json
let availableHacks = {};
try {
  availableHacks = require("./hacks.json");
  // Validate hack definitions
  for (const [key, hack] of Object.entries(availableHacks)) {
    if (!hack.id || !hack.title || !hack.url || !hack.replacements) {
      console.warn(`Invalid hack definition for "${key}": missing required fields`);
    }
    if (!hack.scriptPath && !hack.scriptPaths) {
      console.warn(`Invalid hack definition for "${key}": missing scriptPath or scriptPaths`);
    }
  }
} catch (err) {
  console.error("Failed to load hacks.json:", err.message);
}
exports.availableHacks = availableHacks;

// Load config with validation
const loadConfig = () => {
  // Create config.json from example if it doesn't exist
  if (!fs.existsSync(configPath) && fs.existsSync(examplePath)) {
    try {
      fs.copyFileSync(examplePath, configPath);
      console.log("Created config.json from example");
    } catch (err) {
      console.error("Failed to create config.json:", err.message);
    }
  }

  let config = {};

  // Try to load existing config
  if (fs.existsSync(configPath)) {
    try {
      const configContent = fs.readFileSync(configPath, "utf8");
      config = JSON.parse(configContent);

      // Validate config structure
      if (typeof config !== "object" || config === null || Array.isArray(config)) {
        console.warn("Invalid config.json structure, resetting to defaults");
        config = {};
      }

      // Ensure all values are booleans
      for (const [key, value] of Object.entries(config)) {
        if (typeof value !== "boolean") {
          console.warn(`Invalid config value for "${key}", setting to false`);
          config[key] = false;
        }
      }
    } catch (err) {
      console.error("Failed to parse config.json:", err.message);
      config = {};
    }
  }

  // Ensure all available hacks have a config entry
  for (const key of Object.keys(availableHacks)) {
    if (!(key in config)) {
      config[key] = false;
    }
  }

  return config;
};

const config = loadConfig();
exports.currentConfig = config;

exports.updateConfig = (newConfig) => {
  if (typeof newConfig !== "object" || newConfig === null) {
    console.error("updateConfig: Invalid config object");
    return { success: false, error: "Invalid config object" };
  }

  try {
    // Update in-memory config
    for (const key of Object.keys(newConfig)) {
      config[key] = Boolean(newConfig[key]);
    }

    // Write to disk synchronously to ensure consistency
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    return { success: true };
  } catch (err) {
    console.error("Failed to update config:", err.message);
    return { success: false, error: err.message };
  }
};
