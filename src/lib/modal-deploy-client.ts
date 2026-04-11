/**
 * Browser client: stream deploy logs from POST /api/modal/deploy (NDJSON).
 */

export type ModalSetupClientEvent =
    | { type: "starting" }
    | { type: "already_configured"; path: string }
    | { type: "log"; line: string }
    | { type: "auth_url"; url: string }
    | { type: "done"; path: string }
    | { type: "error"; message: string };

/**
 * Local Next.js: run `modal setup` on the server (same machine as `pnpm dev`).
 */
export async function setupModalViaNextApi(
    opts: { profile?: string | null },
    onEvent: (e: ModalSetupClientEvent) => void,
): Promise<void> {
    const res = await fetch("/api/modal/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: opts.profile ?? null }),
        credentials: "same-origin",
    });

    if (!res.ok) {
        let msg = await res.text();
        try {
            const j = JSON.parse(msg) as { error?: string };
            msg = j.error ?? msg;
        } catch {
            // plain text
        }
        throw new Error(msg.trim() || `HTTP ${res.status}`);
    }

    const reader = res.body?.getReader();
    if (!reader) {
        throw new Error("No response body");
    }

    const dec = new TextDecoder();
    let buf = "";

    for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
            if (!part.trim()) continue;
            const obj = JSON.parse(part) as Record<string, unknown>;
            if (obj.type === "error") {
                throw new Error(String(obj.message ?? "Modal setup failed"));
            }
            onEvent(obj as ModalSetupClientEvent);
        }
    }

    if (buf.trim()) {
        const obj = JSON.parse(buf) as Record<string, unknown>;
        if (obj.type === "error") {
            throw new Error(String(obj.message ?? "Modal setup failed"));
        }
        onEvent(obj as ModalSetupClientEvent);
    }
}

export async function deployModalViaNextApi(
    onLine: (line: string) => void,
): Promise<void> {
    const res = await fetch("/api/modal/deploy", {
        method: "POST",
        credentials: "same-origin",
    });

    if (!res.ok) {
        let msg = await res.text();
        try {
            const j = JSON.parse(msg) as { error?: string };
            msg = j.error ?? msg;
        } catch {
            // plain text body
        }
        throw new Error(msg.trim() || `HTTP ${res.status}`);
    }

    const reader = res.body?.getReader();
    if (!reader) {
        throw new Error("No response body");
    }

    const dec = new TextDecoder();
    let buf = "";

    for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
            if (!part.trim()) continue;
            const obj = JSON.parse(part) as {
                line?: string;
                done?: boolean;
                error?: string;
            };
            if (obj.error) throw new Error(obj.error);
            if (obj.line) onLine(obj.line);
            if (obj.done) return;
        }
    }

    if (buf.trim()) {
        const obj = JSON.parse(buf) as {
            line?: string;
            done?: boolean;
            error?: string;
        };
        if (obj.error) throw new Error(obj.error);
        if (obj.line) onLine(obj.line);
    }
}
