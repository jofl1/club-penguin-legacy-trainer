const path = require("path");
const crypto = require("crypto");
const fs = require("fs");

const { downloadFile } = require("./download");
const { setupFFDec, exportScripts, importScripts } = require("./ffdec");
const { availableHacks, currentConfig } = require("./config");

const deployHack = async (hack) => {
  console.log("Deploying " + hack.title + "...");

  const serverFilePath = path.join("server", new URL(hack.url).pathname);

  if (fs.existsSync(serverFilePath)) {
    console.log("SKIPPED");
    return;
  }

  const tmpDir = crypto.randomUUID();
  fs.mkdirSync(tmpDir);

  const swfFileName = /[^/]*$/.exec(hack.url)[0];
  const swfFilePath = path.join(tmpDir, swfFileName);
  const scriptsDir = path.join(tmpDir, "scripts_export");

  fs.mkdirSync(serverFilePath.slice(0, -swfFileName.length), {
    recursive: true,
  });

  // Download the original SWF
  await downloadFile(hack.url, swfFilePath);

  // Export scripts using FFDec
  console.log("Exporting scripts...");
  await exportScripts(path.join(__dirname, swfFilePath), scriptsDir);

  // Apply replacements to the script file(s)
  const scriptPaths = hack.scriptPaths || [hack.scriptPath];
  let anyModified = false;

  for (const scriptPath of scriptPaths) {
    const scriptFilePath = path.join(scriptsDir, scriptPath);
    if (fs.existsSync(scriptFilePath)) {
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
        console.log("Applied replacement in:", scriptPath);
      }
    }
  }

  if (!anyModified) {
    console.error("Could not apply any replacements!");
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return;
  }

  // Import modified scripts back into SWF
  console.log("Importing modified scripts...");
  const outputSwf = path.join(tmpDir, "modified_" + swfFileName);
  await importScripts(
    path.join(__dirname, swfFilePath),
    path.join(__dirname, outputSwf),
    scriptsDir
  );

  // Copy the modified SWF to the server directory
  fs.copyFileSync(outputSwf, serverFilePath);
  fs.rmSync(tmpDir, { recursive: true, force: true });

  console.log("DONE.");
};

const undeployHack = (hack) => {
  console.log("Undeploying " + hack.title + "...");

  const serverFilePath = path.join("server", new URL(hack.url).pathname);

  if (!fs.existsSync(serverFilePath)) {
    console.log("SKIPPED");
    return;
  }

  fs.unlinkSync(serverFilePath);

  console.log("DONE");
};

exports.syncHacksOnLocalServer = async () => {
  await setupFFDec();
  for (const key in availableHacks) {
    const hack = availableHacks[key];
    if (currentConfig[key]) {
      await deployHack(hack);
    } else {
      undeployHack(hack);
    }
  }
};
