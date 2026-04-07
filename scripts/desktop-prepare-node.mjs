import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

function mkdirp(p) {
  fs.mkdirSync(p, { recursive: true });
}

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function run(cmd, args) {
  execFileSync(cmd, args, { stdio: "inherit" });
}

const platform = process.platform;
const arch = process.arch;

if (platform === "darwin" && arch !== "arm64") {
  throw new Error("This desktop build only supports macOS arm64 (Apple Silicon).");
}
if (platform === "win32" && arch !== "x64") {
  throw new Error("This desktop build only supports Windows x64.");
}
if (platform !== "darwin" && platform !== "win32") {
  throw new Error(`Unsupported platform for embedded node: ${platform}`);
}

// Pin a Node.js version to embed.
// IMPORTANT: This must match the Node.js ABI used by native deps inside the bundled Next standalone (e.g. better-sqlite3).
// This repo currently builds with Node 24.x, so we embed Node 24.x to avoid NODE_MODULE_VERSION mismatches.
const NODE_VER = "24.12.0";
const asset =
  platform === "darwin"
    ? `node-v${NODE_VER}-darwin-arm64.tar.gz`
    : `node-v${NODE_VER}-win-x64.zip`;
const url = `https://nodejs.org/dist/v${NODE_VER}/${asset}`;

const root = process.cwd();
const cacheDir = path.join(root, "dist-electron", ".cache");
const downloadPath = path.join(cacheDir, asset);
mkdirp(cacheDir);

if (!fs.existsSync(downloadPath)) {
  console.log(`[desktop] Downloading embedded node: ${asset}`);
  if (platform === "darwin") {
    run("curl", ["-L", "-o", downloadPath, url]);
  } else {
    run("powershell", [
      "-NoProfile",
      "-Command",
      `Invoke-WebRequest -Uri "${url}" -OutFile "${downloadPath}"`,
    ]);
  }
} else {
  console.log(`[desktop] Using cached embedded node: ${downloadPath}`);
}

const outDir = path.join(root, "dist-electron", "node", platform);
rmrf(outDir);
mkdirp(outDir);

console.log(`[desktop] Extracting embedded node to ${outDir}`);
if (platform === "darwin") {
  run("tar", ["-xzf", downloadPath, "-C", outDir]);
  // Result folder: node-vX.Y.Z-darwin-arm64/
} else {
  // Use tar (bsdtar) to extract zip on GitHub runners and many Windows envs.
  run("tar", ["-xf", downloadPath, "-C", outDir]);
}

console.log("[desktop] Embedded node prepared.");

