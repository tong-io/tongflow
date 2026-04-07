import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

function mkdirp(p) {
  fs.mkdirSync(p, { recursive: true });
}

const platform = process.platform;
if (platform !== "darwin" && platform !== "win32") {
  throw new Error(`Unsupported platform for wheelhouse: ${platform}`);
}

const root = process.cwd();
const out = path.join(root, "dist-electron", "wheelhouse", platform);

const pythonBase = path.join(root, "dist-electron", "python", platform);
const python =
  platform === "win32"
    ? [path.join(pythonBase, "python", "python.exe"), path.join(pythonBase, "python.exe")].find(
        (p) => fs.existsSync(p),
      )
    : [
        path.join(pythonBase, "python", "bin", "python3"),
        path.join(pythonBase, "python", "bin", "python"),
      ].find((p) => fs.existsSync(p));

if (!python) {
  throw new Error(
    `Embedded python not found for ${platform}. Run \`pnpm desktop:python:prepare\` first.\n` +
      `Looked under: ${pythonBase}`,
  );
}

mkdirp(out);

function run(args) {
  execFileSync(python, args, { stdio: "inherit" });
}

// Ensure pip exists in the embedded distribution.
try {
  run(["-m", "pip", "--version"]);
} catch {
  run(["-m", "ensurepip"]);
}

// Download modal and all dependencies as wheels for THIS embedded python/platform.
// This prevents cp39/cp310 mismatches.
run([
  "-m",
  "pip",
  "download",
  "-d",
  out,
  "modal",
  "--only-binary=:all:",
]);

console.log(`[desktop] Wheelhouse prepared at ${out}`);

