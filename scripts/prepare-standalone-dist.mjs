#!/usr/bin/env node
/**
 * Prepare a git-committable standalone output under `dist/next-standalone/`.
 *
 * Layout matches Next standalone expectations:
 * - dist/next-standalone/server.js (and related files from `.next/standalone`)
 * - dist/next-standalone/.next/static (copied from `.next/static`)
 * - dist/next-standalone/public (copied from `public/` if exists)
 *
 * Typical usage:
 *   pnpm build:obfuscated
 *   node scripts/prepare-standalone-dist.mjs
 */
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

const out = path.join(root, "dist", "next-standalone");
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

// Safety: never ship local env files inside dist.
for (const name of fs.readdirSync(out)) {
	if (name === ".env" || (name.startsWith(".env.") && name !== ".env.example")) {
		rmrf(path.join(out, name));
	}
}

// Optional pruning: standalone tracing may include unrelated folders.
// Keep this list conservative; prefer to prune only obviously non-runtime artifacts.
for (const p of [
	"dist-electron",
	"release",
	"electron-out",
	".openflow-modal-venv",
	"wheelhouse",
]) {
	const full = path.join(out, p);
	if (fs.existsSync(full)) rmrf(full);
}

console.log(`[dist] Prepared Next standalone at ${out}`);

