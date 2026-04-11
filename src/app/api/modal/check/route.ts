import { NextRequest, NextResponse } from "next/server";
import { ModalClient } from "modal";
import { requireAuth } from "@/lib/auth-stub";
import { getModalProbeForHandler } from "@/lib/modal-deployment-registry";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
    await requireAuth();

    let body: { type?: string; function?: string };
    try {
        body = (await request.json()) as { type?: string; function?: string };
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const type = body.type?.trim();
    const fn = body.function?.trim();
    if (!type || !fn) {
        return NextResponse.json(
            { error: "Missing type or function" },
            { status: 400 },
        );
    }

    const probe = getModalProbeForHandler(type, fn);
    if (!probe) {
        return NextResponse.json({ modal: false, deployed: true });
    }

    try {
        const client = new ModalClient();
        if (probe.kind === "function") {
            await client.functions.fromName(probe.appName, probe.name);
        } else {
            await client.cls.fromName(probe.appName, probe.name);
        }
        return NextResponse.json({
            modal: true,
            deployed: true,
            appName: probe.appName,
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({
            modal: true,
            deployed: false,
            appName: probe.appName,
            error: msg,
        });
    }
}
