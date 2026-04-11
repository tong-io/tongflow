import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth-stub";
import { runModalSetup } from "@/lib/modal-setup-server";

export const runtime = "nodejs";
export const maxDuration = 600;

export async function POST(request: NextRequest) {
    await requireAuth();

    let body: { profile?: string | null } = {};
    try {
        body = (await request.json()) as { profile?: string | null };
    } catch {
        body = {};
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            const send = (
                obj:
                    | Record<string, unknown>
                    | { type: string; message?: string },
            ) => {
                controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
            };

            await runModalSetup(
                { profile: body.profile ?? null },
                (e) => {
                    send(e as Record<string, unknown>);
                },
            );
            controller.close();
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "application/x-ndjson; charset=utf-8",
            "Cache-Control": "no-store",
        },
    });
}
