import { NextResponse } from "next/server";
import { listOfficialPlugins } from "@/lib/plugins/official-plugins.server";

export const runtime = "nodejs";

/**
 * GET /api/plugins/official
 * Lists official plugins from config/official-plugins.json with installed state.
 */
export async function GET() {
    return NextResponse.json(listOfficialPlugins(), {
        headers: { "Cache-Control": "no-store" },
    });
}
