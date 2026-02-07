const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");
const AdmZip = require("adm-zip");
const { downloadFile } = require("./download");

const ffdecDir = path.join(__dirname, "ffdec");
const ffdecUrl = "https://github.com/jindrapetrik/jpexs-decompiler/releases/download/version24.1.1/ffdec_24.1.1.zip";

// Try to find Java - check common locations
const findJava = () => {
  const locations = [
    "/opt/homebrew/opt/openjdk/bin/java",
    "/usr/local/opt/openjdk/bin/java",
    "/usr/bin/java",
    "java"
  ];
  for (const loc of locations) {
    try {
      if (loc === "java" || fs.existsSync(loc)) {
        return loc;
      }
    } catch {}
  }
  return "java";
};

const javaPath = findJava();

// Verify Java is available and get version
exports.verifyJava = () =>
  new Promise((resolve) => {
    exec(`"${javaPath}" -version`, (error, stdout, stderr) => {
      if (error) {
        resolve({
          available: false,
          error: error.message,
          path: javaPath
        });
        return;
      }
      // Java version info is typically in stderr
      const versionOutput = stderr || stdout;
      const versionMatch = versionOutput.match(/version "([^"]+)"/);
      const version = versionMatch ? versionMatch[1] : "unknown";
      resolve({
        available: true,
        version,
        path: javaPath
      });
    });
  });

exports.setupFFDec = async () => {
  console.log("Setting up FFDec...");

  const jarPath = path.join(ffdecDir, "ffdec.jar");
  if (fs.existsSync(jarPath)) {
    console.log("SKIPPED (already installed)");
    return;
  }

  console.log("Downloading FFDec...");

  if (!fs.existsSync(ffdecDir)) {
    fs.mkdirSync(ffdecDir, { recursive: true });
  }

  const zipPath = path.join(ffdecDir, "ffdec.zip");

  await downloadFile(ffdecUrl, zipPath);

  console.log("Extracting FFDec...");
  try {
    const zip = new AdmZip(zipPath);
    zip.extractAllTo(ffdecDir, true);
  } catch (err) {
    throw new Error("Failed to extract FFDec: " + err.message);
  } finally {
    // Clean up zip file
    if (fs.existsSync(zipPath)) {
      fs.unlinkSync(zipPath);
    }
  }

  if (!fs.existsSync(jarPath)) {
    throw new Error("FFDec extraction failed - ffdec.jar not found");
  }

  console.log("FFDec setup complete.");
};

exports.exportScripts = (swfFile, outputDir) =>
  new Promise((resolve, reject) => {
    const jarPath = path.join(ffdecDir, "ffdec.jar");
    if (!fs.existsSync(jarPath)) {
      return reject(new Error("FFDec not installed. Run setupFFDec() first."));
    }
    const cmd = `"${javaPath}" -jar "${jarPath}" -format script:as -export script "${outputDir}" "${swfFile}"`;
    exec(cmd, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        console.error("FFDec export error:", error.message);
        if (stderr) console.error("stderr:", stderr);
        return reject(error);
      }
      resolve(stdout);
    });
  });

exports.importScripts = (inputSwf, outputSwf, scriptsDir) =>
  new Promise((resolve, reject) => {
    const jarPath = path.join(ffdecDir, "ffdec.jar");
    if (!fs.existsSync(jarPath)) {
      return reject(new Error("FFDec not installed. Run setupFFDec() first."));
    }
    const cmd = `"${javaPath}" -jar "${jarPath}" -importScript "${inputSwf}" "${outputSwf}" "${scriptsDir}"`;
    exec(cmd, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        console.error("FFDec import error:", error.message);
        if (stderr) console.error("stderr:", stderr);
        return reject(error);
      }
      resolve(stdout);
    });
  });
