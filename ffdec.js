const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");
const https = require("https");
const AdmZip = require("adm-zip");

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

exports.setupFFDec = async () => {
  console.log("Setting up FFDec...");

  const jarPath = path.join(ffdecDir, "ffdec.jar");
  if (fs.existsSync(jarPath)) {
    console.log("SKIPPED");
    return;
  }

  console.log("Downloading FFDec...");

  if (!fs.existsSync(ffdecDir)) {
    fs.mkdirSync(ffdecDir, { recursive: true });
  }

  const zipPath = path.join(ffdecDir, "ffdec.zip");

  await new Promise((resolve, reject) => {
    const file = fs.createWriteStream(zipPath);
    https.get(ffdecUrl, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        https.get(response.headers.location, (redirectResponse) => {
          redirectResponse.pipe(file);
          file.on("finish", () => {
            file.close();
            resolve();
          });
        }).on("error", reject);
      } else {
        response.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve();
        });
      }
    }).on("error", reject);
  });

  console.log("Extracting FFDec...");
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(ffdecDir, true);
  fs.unlinkSync(zipPath);

  console.log("FFDec setup complete.");
};

exports.exportScripts = (swfFile, outputDir) =>
  new Promise((resolve, reject) => {
    const jarPath = path.join(ffdecDir, "ffdec.jar");
    const cmd = `"${javaPath}" -jar "${jarPath}" -format script:as -export script "${outputDir}" "${swfFile}"`;
    exec(cmd, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        console.error("FFDec export error:", error.message);
        return reject(error);
      }
      resolve(stdout);
    });
  });

exports.importScripts = (inputSwf, outputSwf, scriptsDir) =>
  new Promise((resolve, reject) => {
    const jarPath = path.join(ffdecDir, "ffdec.jar");
    const cmd = `"${javaPath}" -jar "${jarPath}" -importScript "${inputSwf}" "${outputSwf}" "${scriptsDir}"`;
    exec(cmd, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        console.error("FFDec import error:", error.message);
        return reject(error);
      }
      resolve(stdout);
    });
  });
