import { requireAuth } from "@/lib/auth-stub";
import { runModalDeploy } from "@/lib/modal-deploy-workers";

export const runtime = "nodejs";
export const maxDuration = 600;

export async function POST() {
    await requireAuth();

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            const send = (obj: { line?: string; done?: boolean; error?: string }) => {
                controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
            };
            try {
                await runModalDeploy((line) => send({ line }));
                send({ done: true });
            } catch (e) {
                send({
                    error: e instanceof Error ? e.message : String(e),
                });
            } finally {
                controller.close();
            }
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "application/x-ndjson; charset=utf-8",
            "Cache-Control": "no-store",
        },
    });
}
