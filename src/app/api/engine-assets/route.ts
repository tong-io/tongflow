/**
 * Loopback asset sink for the SDK engine (see HttpStore in the Python SDK).
 *
 * GET  ?file_key=...                 -> raw bytes (404 when unknown)
 * POST ?ext=...&mime=...&filename=.. -> {"file_key": "..."} (`<id>/<filename>` when named)
 *
 * Auth: a per-run bearer token minted by the engine delegate, bound to the
 * run's tenant scope and taskId. Storage goes through the registered
 * storage driver, so with a remote driver the engine's files never touch
 * the local disk.
 */

import { type NextRequest, NextResponse } from "next/server";
import { storeKeyName } from "tongflow/engine";
import { getStorage } from "@/lib/file/storage.server";
import { runWithScope } from "@/lib/runtime/scope.server";
import { bindingForEngineAssetToken } from "@/lib/task/engine-asset-tokens.server";

async function bindingFrom(request: NextRequest) {
    const header = request.headers.get("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    return token ? await bindingForEngineAssetToken(token) : null;
}

export async function GET(request: NextRequest) {
    const binding = await bindingFrom(request);
    if (!binding) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const fileKey = request.nextUrl.searchParams.get("file_key");
    if (!fileKey) {
        return NextResponse.json(
            { error: "file_key is required" },
            { status: 400 },
        );
    }
    try {
        const buffer = await runWithScope(binding.scope, () =>
            getStorage().readFile(fileKey),
        );
        return new NextResponse(new Uint8Array(buffer), {
            headers: { "Content-Type": "application/octet-stream" },
        });
    } catch {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
}

export async function POST(request: NextRequest) {
    const binding = await bindingFrom(request);
    if (!binding) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const ext = request.nextUrl.searchParams.get("ext") ?? "bin";
    // The producer's filename stays the key's last segment (`<id>/<name>`),
    // as in every asset store (docs/edge-runtime.md, "Asset store keys").
    const name = storeKeyName(
        request.nextUrl.searchParams.get("filename") ?? undefined,
        ext,
    );
    const data = Buffer.from(await request.arrayBuffer());
    try {
        const fileKey = await runWithScope(binding.scope, () =>
            getStorage().saveFile(
                data,
                ext,
                binding.taskId,
                name ? { name } : undefined,
            ),
        );
        return NextResponse.json({ file_key: fileKey });
    } catch {
        return NextResponse.json(
            { error: "Failed to store asset" },
            { status: 500 },
        );
    }
}
