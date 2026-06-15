import { NextResponse } from "next/server";
import { checkOfficialPluginUpdates } from "@/lib/plugins/official-plugins.server";

export const runtime = "nodejs";

/**
 * GET /api/plugins/check-updates
 * For every installed official plugin, compare local vs remote HEAD (one
 * ls-remote each) and report which have a newer commit upstream.
 */
export async function GET() {
    const updates = await checkOfficialPluginUpdates();
    return NextResponse.json(
        { updates },
        {
            headers: { "Cache-Control": "no-store" },
        },
    );
}
