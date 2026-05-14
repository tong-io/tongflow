import type { SerializedTaskError } from "@/lib/task/error-envelope";

/** Human line from persisted `tasks.error` JSON (`SerializedTaskError`); returns the raw string on parse failure. */
export function formatStoredTaskErrorForDisplay(
    raw: string | null | undefined,
): string {
    if (!raw) return "";

    try {
        const o = JSON.parse(raw) as Partial<SerializedTaskError>;
        if (typeof o.message === "string" && o.message.trim()) {
            return o.message.trim();
        }
    } catch {
        /* Malformed write — best-effort display below. */
    }

    return raw;
}
