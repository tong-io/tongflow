import { NextResponse } from "next/server";
import { edgePluginsInfo } from "@/lib/plugins/edge-plugin-files.server";
import { loadPluginsRegistry } from "@/lib/plugins/plugins-registry.server";
import { pluginsDir } from "@/lib/runtime/paths.server";

export const runtime = "nodejs";

/**
 * GET /api/plugins/edge
 * The installed browser edge plugins (`runtime: "browser"`) with the
 * versioned same-origin URLs the browser edge runtime loads them from, and
 * the model base they download weights from. Empty `plugins` = the canvas
 * runs everything on the server, as without the edge runtime.
 */
export async function GET() {
    return NextResponse.json(
        await edgePluginsInfo(loadPluginsRegistry(), pluginsDir()),
        { headers: { "Cache-Control": "no-store" } },
    );
}
