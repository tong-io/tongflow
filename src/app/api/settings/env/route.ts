import { type NextRequest, NextResponse } from "next/server";
import {
    type EnvStore,
    loadEnvStore,
    saveEnvStore,
} from "@/lib/settings/env-store.server";

export const runtime = "nodejs";

/**
 * GET /api/settings/env
 * Returns the user-managed environment key/value map (settings.json).
 */
export async function GET() {
    return NextResponse.json(
        { env: loadEnvStore() },
        { headers: { "Cache-Control": "no-store" } },
    );
}

/**
 * PUT /api/settings/env
 * Replaces the entire env map. Body: `{ env: Record<string,string> }`.
 * TongFlow stays platform-agnostic: it does not validate which keys are present;
 * each plugin documents the keys it needs in its own README.
 */
export async function PUT(request: NextRequest) {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json(
            { error: "Invalid JSON body" },
            { status: 400 },
        );
    }

    const raw = (body as { env?: unknown })?.env;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return NextResponse.json(
            { error: "Body must be { env: Record<string,string> }" },
            { status: 400 },
        );
    }

    const env: EnvStore = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        if (typeof v === "string") env[k] = v;
    }

    saveEnvStore(env);
    return NextResponse.json({ env: loadEnvStore() });
}
