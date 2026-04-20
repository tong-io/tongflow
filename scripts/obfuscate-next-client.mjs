#!/usr/bin/env node
/**
 * Post-build: obfuscate Next.js client JS under `.next/static/chunks`.
 * Run after `next build` (see `pnpm build:obfuscated`).
 * Intended for private/closed-source deployments; smoke-test after enabling.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JavaScriptObfuscator from "javascript-obfuscator";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const chunksDir = path.join(root, ".next", "static", "chunks");

/** Conservative defaults: avoid patterns that often break webpack/Next runtime. */
const OBF_OPTIONS = {
	compact: true,
	controlFlowFlattening: false,
	deadCodeInjection: false,
	debugProtection: false,
	disableConsoleOutput: false,
	identifierNamesGenerator: "hexadecimal",
	renameGlobals: false,
	selfDefending: false,
	simplify: true,
	stringArray: true,
	stringArrayEncoding: [],
	stringArrayThreshold: 0.75,
	transformObjectKeys: false,
};

async function walk(dir) {
	const entries = await fs.readdir(dir, { withFileTypes: true });
	const files = [];
	for (const e of entries) {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) {
			files.push(...(await walk(p)));
		} else if (e.isFile() && e.name.endsWith(".js")) {
			files.push(p);
		}
	}
	return files;
}

async function main() {
	if (process.env.NEXT_OBFUSCATE_SKIP === "1") {
		console.log("obfuscate-next-client: skipped (NEXT_OBFUSCATE_SKIP=1)");
		return;
	}
	try {
		await fs.access(chunksDir);
	} catch {
		console.error(
			"obfuscate-next-client: .next/static/chunks not found. Run `next build` first.",
		);
		process.exit(1);
	}
	const files = await walk(chunksDir);
	let n = 0;
	for (const file of files) {
		const src = await fs.readFile(file, "utf8");
		const result = JavaScriptObfuscator.obfuscate(src, OBF_OPTIONS);
		await fs.writeFile(file, result.getObfuscatedCode(), "utf8");
		n++;
	}
	console.log(
		`obfuscate-next-client: processed ${n} file(s) under ${path.relative(root, chunksDir)}`,
	);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
