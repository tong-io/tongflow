import { type NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import {
    installPlugin,
    PluginInstallError,
} from "@/lib/plugins/plugins-install.server";

export const runtime = "nodejs";

/**
 * POST /api/plugins/install
 * Body: `{ id }` for an official plugin, or `{ gitUrl }` for a custom one.
 * Clones/updates into plugins/ then rescans the registry.
 */
export async function POST(request: NextRequest) {
    try {
        const body = (await request.json()) as {
            id?: string;
            gitUrl?: string;
        };

        const result = await installPlugin({
            id: body.id,
            gitUrl: body.gitUrl,
        });

        return NextResponse.json(result, {
            headers: { "Cache-Control": "no-store" },
        });
    } catch (e) {
        if (e instanceof PluginInstallError) {
            return NextResponse.json(
                { error: e.message },
                { status: e.status },
            );
        }
        const message = e instanceof Error ? e.message : String(e);
        logger.error("[plugins] install failed:", message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
