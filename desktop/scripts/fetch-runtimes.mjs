// Download the bundled runtimes into resources/{node,uv,python} for one target.
//
//   node scripts/fetch-runtimes.mjs            # host platform + arch
//   TONGFLOW_TARGET_ARCH=x64 node scripts/fetch-runtimes.mjs   # cross-arch (mac)
//
// Layouts produced (consumed by src/paths.ts):
//   resources/node/{node|node.exe}
//   resources/uv/{uv|uv.exe}
//   resources/python/{bin/python3 | python.exe}
//
// Versions are pinned; bump deliberately. assemble-app.mjs re-fetches
// better-sqlite3's native binary for this Node's ABI, so the builder's own Node
// version need not match — but keeping CI's Node aligned with NODE_VERSION
// avoids a rebuild and keeps dev/build/runtime on one major.

import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const NODE_VERSION = "24.12.0";
const UV_VERSION = "0.5.11";
const PY_TAG = "20241219"; // python-build-standalone release tag
const PY_VERSION = "3.12.8";

const here = path.dirname(fileURLToPath(import.meta.url));
const resourcesDir = path.resolve(here, "..", "resources");

const platform = process.platform; // darwin | win32
const arch = process.env.TONGFLOW_TARGET_ARCH || os.arch(); // arm64 | x64

const isWin = platform === "win32";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tf-runtimes-"));

function sh(cmd) {
    execSync(cmd, { stdio: "inherit" });
}

async function download(url, dest) {
    console.log("[fetch]", url);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`download failed ${res.status}: ${url}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(dest, buf);
}

function extract(archive, into) {
    fs.mkdirSync(into, { recursive: true });
    if (archive.endsWith(".zip")) {
        // `tar` ships with Windows 10+ and macOS and can read zips.
        sh(`tar -xf "${archive}" -C "${into}"`);
    } else {
        sh(`tar -xzf "${archive}" -C "${into}"`);
    }
}

// ---- Node -----------------------------------------------------------------
async function fetchNode() {
    const out = path.join(resourcesDir, "node");
    fs.rmSync(out, { recursive: true, force: true });
    fs.mkdirSync(out, { recursive: true });

    if (isWin) {
        const name = `node-v${NODE_VERSION}-win-${arch}`;
        const zip = path.join(tmp, `${name}.zip`);
        await download(
            `https://nodejs.org/dist/v${NODE_VERSION}/${name}.zip`,
            zip,
        );
        extract(zip, tmp);
        fs.copyFileSync(
            path.join(tmp, name, "node.exe"),
            path.join(out, "node.exe"),
        );
    } else {
        const name = `node-v${NODE_VERSION}-darwin-${arch}`;
        const tgz = path.join(tmp, `${name}.tar.gz`);
        await download(
            `https://nodejs.org/dist/v${NODE_VERSION}/${name}.tar.gz`,
            tgz,
        );
        extract(tgz, tmp);
        fs.copyFileSync(
            path.join(tmp, name, "bin", "node"),
            path.join(out, "node"),
        );
        fs.chmodSync(path.join(out, "node"), 0o755);
    }
    console.log("[fetch] node ready");
}

// ---- uv -------------------------------------------------------------------
async function fetchUv() {
    const out = path.join(resourcesDir, "uv");
    fs.rmSync(out, { recursive: true, force: true });
    fs.mkdirSync(out, { recursive: true });

    const target = isWin
        ? "x86_64-pc-windows-msvc"
        : arch === "arm64"
          ? "aarch64-apple-darwin"
          : "x86_64-apple-darwin";
    const ext = isWin ? "zip" : "tar.gz";
    const file = `uv-${target}.${ext}`;
    const archive = path.join(tmp, file);
    await download(
        `https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/${file}`,
        archive,
    );
    extract(archive, tmp);
    const binName = isWin ? "uv.exe" : "uv";
    // tarball extracts into a uv-<target>/ dir; zip extracts flat.
    const candidates = [
        path.join(tmp, `uv-${target}`, binName),
        path.join(tmp, binName),
    ];
    const src = candidates.find((p) => fs.existsSync(p));
    if (!src) throw new Error("uv binary not found after extraction");
    fs.copyFileSync(src, path.join(out, binName));
    if (!isWin) fs.chmodSync(path.join(out, binName), 0o755);
    console.log("[fetch] uv ready");
}

// ---- Python (python-build-standalone) -------------------------------------
async function fetchPython() {
    const out = path.join(resourcesDir, "python");
    fs.rmSync(out, { recursive: true, force: true });
    fs.mkdirSync(out, { recursive: true });

    const target = isWin
        ? "x86_64-pc-windows-msvc"
        : arch === "arm64"
          ? "aarch64-apple-darwin"
          : "x86_64-apple-darwin";
    const file = `cpython-${PY_VERSION}+${PY_TAG}-${target}-install_only.tar.gz`;
    const archive = path.join(tmp, file);
    await download(
        `https://github.com/astral-sh/python-build-standalone/releases/download/${PY_TAG}/${file}`,
        archive,
    );
    // Extract straight into resources/ so the archive's top-level `python/` dir
    // becomes resources/python with its RELATIVE symlinks intact. (Copying via
    // fs.cpSync would resolve those symlinks to the temp path and break them.)
    extract(archive, resourcesDir);
    console.log("[fetch] python ready");
}

async function main() {
    console.log(`[fetch] target: ${platform}/${arch}`);
    await fetchNode();
    await fetchUv();
    await fetchPython();
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log("[fetch] all runtimes ready in", resourcesDir);
}

main().catch((e) => {
    console.error("[fetch] failed:", e);
    process.exit(1);
});
