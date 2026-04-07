import fs from "node:fs";
import path from "node:path";

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function mkdirp(p) {
  fs.mkdirSync(p, { recursive: true });
}

function copyDir(src, dest) {
  mkdirp(dest);
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, ent.name);
    const d = path.join(dest, ent.name);
    if (ent.isDirectory()) copyDir(s, d);
    else if (ent.isSymbolicLink()) fs.symlinkSync(fs.readlinkSync(s), d);
    else fs.copyFileSync(s, d);
  }
}

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");
const staticDir = path.join(root, ".next", "static");
const publicDir = path.join(root, "public");

if (!fs.existsSync(standalone)) {
  throw new Error("Missing .next/standalone. Run `pnpm build` first.");
}

// electron-builder will copy this folder to process.resourcesPath/app
const out = path.join(root, "dist-electron", "app");
rmrf(out);
mkdirp(out);

copyDir(standalone, out);

// Next standalone expects these relative to the server working dir.
if (fs.existsSync(staticDir)) {
  copyDir(staticDir, path.join(out, ".next", "static"));
}
if (fs.existsSync(publicDir)) {
  copyDir(publicDir, path.join(out, "public"));
}

console.log(`[desktop] Prepared standalone app at ${out}`);

