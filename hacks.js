const path = require("path");
const crypto = require("crypto");
const fs = require("fs");

const { downloadFile } = require("./download");
const { setupFFDec, exportScripts, importScripts, verifyJava } = require("./ffdec");
const { availableHacks, currentConfig } = require("./config");

// Track temp directories for cleanup on exit
const activeTempDirs = new Set();

const cleanupTempDirs = () => {
  for (const dir of activeTempDirs) {
    try {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
        console.log("Cleaned up temp directory:", dir);
      }
    } catch (err) {
      console.error("Failed to clean up temp directory:", dir, err.message);
    }
  }
  activeTempDirs.clear();
};

// Register cleanup handlers
process.on("exit", cleanupTempDirs);
process.on("SIGINT", () => {
  cleanupTempDirs();
  process.exit(0);
});
process.on("SIGTERM", () => {
  cleanupTempDirs();
  process.exit(0);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
  cleanupTempDirs();
  process.exit(1);
});

const deployHack = async (hack) => {
  console.log("Deploying " + hack.title + "...");

  const serverFilePath = path.join(__dirname, "server", new URL(hack.url).pathname);

  if (fs.existsSync(serverFilePath)) {
    console.log("SKIPPED (already deployed)");
    return { success: true, skipped: true };
  }

  const tmpDir = path.join(__dirname, crypto.randomUUID());
  activeTempDirs.add(tmpDir);

  try {
    fs.mkdirSync(tmpDir);

    const swfFileName = path.basename(new URL(hack.url).pathname);
    const swfFilePath = path.join(tmpDir, swfFileName);
    const scriptsDir = path.join(tmpDir, "scripts_export");

    fs.mkdirSync(path.dirname(serverFilePath), {
      recursive: true,
    });

    // Download the original SWF
    console.log("Downloading SWF...");
    await downloadFile(hack.url, swfFilePath);

    if (!fs.existsSync(swfFilePath)) {
      throw new Error("Failed to download SWF file");
    }

    // Export scripts using FFDec
    console.log("Exporting scripts...");
    await exportScripts(swfFilePath, scriptsDir);

    if (!fs.existsSync(scriptsDir)) {
      throw new Error("Failed to export scripts from SWF");
    }

    // Apply replacements to the script file(s)
    const scriptPaths = hack.scriptPaths || [hack.scriptPath];
    let anyModified = false;
    const modifiedFiles = [];

    for (const scriptPath of scriptPaths) {
      const scriptFilePath = path.join(scriptsDir, scriptPath);
      if (!fs.existsSync(scriptFilePath)) {
        console.warn("Script file not found:", scriptPath);
        continue;
      }

      let scriptContent = fs.readFileSync(scriptFilePath, "utf8");
      let modified = false;

      for (const replacement of hack.replacements) {
        if (scriptContent.includes(replacement.find)) {
          scriptContent = scriptContent.replace(replacement.find, replacement.replace);
          modified = true;
          anyModified = true;
        }
      }

      if (modified) {
        fs.writeFileSync(scriptFilePath, scriptContent);
        modifiedFiles.push(scriptPath);
        console.log("Applied replacement in:", scriptPath);
      }
    }

    if (!anyModified) {
      throw new Error(
        "Could not apply any replacements. The game may have been updated. " +
        "Searched in: " + scriptPaths.join(", ")
      );
    }

    // Import modified scripts back into SWF
    console.log("Importing modified scripts...");
    const outputSwf = path.join(tmpDir, "modified_" + swfFileName);
    await importScripts(swfFilePath, outputSwf, scriptsDir);

    if (!fs.existsSync(outputSwf)) {
      throw new Error("Failed to create modified SWF");
    }

    // Copy the modified SWF to the server directory
    fs.copyFileSync(outputSwf, serverFilePath);

    console.log("DONE - Modified", modifiedFiles.length, "file(s)");
    return { success: true, modifiedFiles };

  } catch (err) {
    console.error("Failed to deploy hack:", hack.title, "-", err.message);
    // Clean up server file if partially created
    if (fs.existsSync(serverFilePath)) {
      try {
        fs.unlinkSync(serverFilePath);
      } catch {}
    }
    return { success: false, error: err.message };

  } finally {
    // Always clean up temp directory
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
    activeTempDirs.delete(tmpDir);
  }
};

const undeployHack = (hack) => {
  console.log("Undeploying " + hack.title + "...");

  const serverFilePath = path.join(__dirname, "server", new URL(hack.url).pathname);

  if (!fs.existsSync(serverFilePath)) {
    console.log("SKIPPED (not deployed)");
    return { success: true, skipped: true };
  }

  try {
    fs.unlinkSync(serverFilePath);
    console.log("DONE");
    return { success: true };
  } catch (err) {
    console.error("Failed to undeploy hack:", err.message);
    return { success: false, error: err.message };
  }
};

exports.syncHacksOnLocalServer = async () => {
  // Verify Java is available before proceeding
  const javaCheck = await verifyJava();
  if (!javaCheck.available) {
    console.error("Java is not available:", javaCheck.error);
    console.error("Please install Java (OpenJDK) to use hacks.");
    return { success: false, error: "Java not available: " + javaCheck.error };
  }
  console.log("Java found:", javaCheck.version);

  await setupFFDec();

  const results = {};
  for (const key in availableHacks) {
    if (!Object.prototype.hasOwnProperty.call(availableHacks, key)) continue;

    const hack = availableHacks[key];
    if (currentConfig[key]) {
      results[key] = await deployHack(hack);
    } else {
      results[key] = undeployHack(hack);
    }
  }
  return results;
};
