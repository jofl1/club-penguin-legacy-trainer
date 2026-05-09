const path = require("path");
const crypto = require("crypto");
const fs = require("fs");

const { downloadFile } = require("./download");
const { setupFFDec, exportScripts, importScripts, verifyJava } = require("./ffdec");
const { availableHacks, currentConfig } = require("./config");
const { applyReplacements, excerptAroundAnchor } = require("./matcher");

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

const readMeta = (metaPath) => {
  try {
    return JSON.parse(fs.readFileSync(metaPath, "utf8"));
  } catch {
    return null;
  }
};

const logExcerpt = (scriptFilePath, content, replacement) => {
  const result = excerptAroundAnchor(content, replacement);
  if (!result.found) {
    console.warn("  no anchor in", scriptFilePath, "(anchor:", JSON.stringify(result.anchor.slice(0, 60)), ")");
    return;
  }
  console.warn("  found anchor in", scriptFilePath, "but find did not match. Context:");
  console.warn("    " + JSON.stringify(result.excerpt));
};

const deployHack = async (hack) => {
  console.log("Deploying " + hack.title + "...");

  const serverFilePath = path.join(__dirname, "server", new URL(hack.url).pathname);
  const metaPath = serverFilePath + ".meta.json";

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
    const { sha256: upstreamSha256 } = await downloadFile(hack.url, swfFilePath, {
      expectedSha256: hack.sha256,
    });

    if (!fs.existsSync(swfFilePath)) {
      throw new Error("Failed to download SWF file");
    }

    // Skip if deploy is up-to-date with current upstream
    if (fs.existsSync(serverFilePath)) {
      const meta = readMeta(metaPath);
      if (meta && meta.upstreamSha256 === upstreamSha256) {
        console.log("SKIPPED (already deployed for current upstream)");
        return { success: true, skipped: true };
      }
      console.log("Upstream changed since last deploy, re-deploying...");
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
    const noMatchExcerpts = [];

    for (const scriptPath of scriptPaths) {
      const scriptFilePath = path.join(scriptsDir, scriptPath);
      if (!fs.existsSync(scriptFilePath)) {
        console.warn("Script file not found:", scriptPath);
        continue;
      }

      const rawContent = fs.readFileSync(scriptFilePath, "utf8");
      const result = applyReplacements(rawContent, hack.replacements);

      if (result.modified) {
        fs.writeFileSync(scriptFilePath, result.content);
        modifiedFiles.push(scriptPath);
        anyModified = true;
        console.log("Applied replacement in:", scriptPath);
      }
      for (const um of result.unmatched) {
        noMatchExcerpts.push({ scriptPath, content: um.content, replacement: um.replacement });
      }
    }

    if (!anyModified) {
      console.warn("No replacements applied. Diagnostic excerpts:");
      for (const { scriptPath, content, replacement } of noMatchExcerpts) {
        logExcerpt(scriptPath, content, replacement);
      }
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

    // Copy the modified SWF to the server directory and write deploy metadata
    fs.copyFileSync(outputSwf, serverFilePath);
    fs.writeFileSync(metaPath, JSON.stringify({
      upstreamSha256,
      deployedAt: new Date().toISOString(),
      modifiedFiles,
    }, null, 2));

    console.log("DONE - Modified", modifiedFiles.length, "file(s)");
    return { success: true, modifiedFiles, upstreamSha256 };

  } catch (err) {
    console.error("Failed to deploy hack:", hack.title, "-", err.message);
    // Clean up server file and meta if partially created
    for (const p of [serverFilePath, metaPath]) {
      if (fs.existsSync(p)) {
        try { fs.unlinkSync(p); } catch {}
      }
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
  const metaPath = serverFilePath + ".meta.json";

  if (!fs.existsSync(serverFilePath) && !fs.existsSync(metaPath)) {
    console.log("SKIPPED (not deployed)");
    return { success: true, skipped: true };
  }

  try {
    for (const p of [serverFilePath, metaPath]) {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    console.log("DONE");
    return { success: true };
  } catch (err) {
    console.error("Failed to undeploy hack:", err.message);
    return { success: false, error: err.message };
  }
};

let syncInFlight = null;

exports.syncHacksOnLocalServer = async () => {
  if (syncInFlight) return syncInFlight;

  syncInFlight = (async () => {
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
    for (const key of Object.keys(availableHacks)) {
      const hack = availableHacks[key];
      if (currentConfig[key]) {
        results[key] = await deployHack(hack);
      } else {
        results[key] = undeployHack(hack);
      }
    }
    return results;
  })();

  try {
    return await syncInFlight;
  } finally {
    syncInFlight = null;
  }
};
