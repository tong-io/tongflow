/** SSE data is sometimes a JSON string; Modal may wrap content in markdown or nested result. */
export function normalizeTaskPayloadData(
    data: unknown,
): Record<string, unknown> | undefined {
    if (data == null) return undefined;
    if (typeof data === "object" && !Array.isArray(data)) {
        return data as Record<string, unknown>;
    }
    if (typeof data === "string") {
        try {
            const p = JSON.parse(data) as unknown;
            if (typeof p === "object" && p !== null && !Array.isArray(p)) {
                return p as Record<string, unknown>;
            }
        } catch {
            return undefined;
        }
    }
    return undefined;
}

export function pickMarkdownFromPayload(
    d: Record<string, unknown> | undefined,
): string | undefined {
    if (!d) return undefined;
    const m = d.markdown;
    if (typeof m === "string" && m.length > 0) return m;
    const res = d.result;
    if (res && typeof res === "object") {
        const rm = (res as Record<string, unknown>).markdown;
        if (typeof rm === "string" && rm.length > 0) return rm;
    }
    return undefined;
}
