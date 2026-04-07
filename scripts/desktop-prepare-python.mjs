import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

function mkdirp(p) {
  fs.mkdirSync(p, { recursive: true });
}

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function run(cmd, args, opts = {}) {
  execFileSync(cmd, args, { stdio: "inherit", ...opts });
}

// We only support:
// - macOS Apple Silicon (arm64)
// - Windows x64
const platform = process.platform;
const arch = process.arch;

if (platform === "darwin" && arch !== "arm64") {
  throw new Error("This desktop build only supports macOS arm64 (Apple Silicon).");
}
if (platform === "win32" && arch !== "x64") {
  throw new Error("This desktop build only supports Windows x64.");
}
if (platform !== "darwin" && platform !== "win32") {
  throw new Error(`Unsupported platform for desktop python: ${platform}`);
}

// Pin to a known python-build-standalone release.
// You can bump this later together with wheelhouse rebuild.
const PBS_TAG = "20260211";
const PY_VER = "3.10.19";

const asset =
  platform === "darwin"
    ? `cpython-${PY_VER}+${PBS_TAG}-aarch64-apple-darwin-install_only_stripped.tar.gz`
    : `cpython-${PY_VER}+${PBS_TAG}-x86_64-pc-windows-msvc-install_only_stripped.tar.gz`;

const url = `https://github.com/astral-sh/python-build-standalone/releases/download/${PBS_TAG}/${asset}`;

const root = process.cwd();
const cacheDir = path.join(root, "dist-electron", ".cache");
const downloadPath = path.join(cacheDir, asset);

mkdirp(cacheDir);

if (!fs.existsSync(downloadPath)) {
  console.log(`[desktop] Downloading embedded python: ${asset}`);
  // Use curl on mac, powershell on windows.
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
  console.log(`[desktop] Using cached embedded python: ${downloadPath}`);
}

const outDir = path.join(root, "dist-electron", "python", platform);
rmrf(outDir);
mkdirp(outDir);

console.log(`[desktop] Extracting embedded python to ${outDir}`);
if (platform === "darwin") {
  run("tar", ["-xzf", downloadPath, "-C", outDir]);
} else {
  run("tar", ["-xzf", downloadPath, "-C", outDir]);
}

console.log("[desktop] Embedded python prepared.");

