import { NextResponse } from "next/server";
import { loadPluginsRegistry } from "@/lib/plugins/plugins-registry.server";

export const runtime = "nodejs";

/**
 * GET /api/plugins/registry
 * Returns generated plugin registry (no-store).
 */
export async function GET() {
    return NextResponse.json(loadPluginsRegistry(), {
        headers: { "Cache-Control": "no-store" },
    });
}
