import type { NextRequest } from "next/server";
import { serveEdgePluginFile } from "@/lib/plugins/edge-plugin-files.server";
import { loadPluginsRegistry } from "@/lib/plugins/plugins-registry.server";
import { pluginsDir } from "@/lib/runtime/paths.server";

export const runtime = "nodejs";

/**
 * GET /api/plugins/files/<pluginId>/<version>/<path>
 * One file of an installed browser edge plugin (its ESM entry, chunks, wasm
 * and other assets), for the plugin's Web Worker: same-origin, Range,
 * immutable while `<version>` is current. See edge-plugin-files.server.ts.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ path: string[] }> },
) {
    const { path } = await params;
    return serveEdgePluginFile(
        request,
        path,
        loadPluginsRegistry(),
        pluginsDir(),
    );
}

export const HEAD = GET;
