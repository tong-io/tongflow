import { type NextRequest, NextResponse } from "next/server";
import { stopRemoteInvoke } from "@/lib/task/remote-invoke.server";

/** POST /api/engine/invoke/stop `{invocationId}`: cancel a remote-executor call. */
export async function POST(request: NextRequest) {
    let invocationId: unknown;
    try {
        ({ invocationId } = (await request.json()) as {
            invocationId?: unknown;
        });
    } catch {
        // handled below
    }
    if (typeof invocationId !== "string" || !invocationId) {
        return NextResponse.json(
            { error: "invocationId is required", code: "invalid_request" },
            { status: 400 },
        );
    }
    return NextResponse.json(stopRemoteInvoke(invocationId));
}
