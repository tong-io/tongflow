import type { SerializedTaskError } from "@/lib/abi-schema-validate";

/** Human line from persisted `tasks.error` JSON (`SerializedTaskError`) or fallback for legacy plaintext. */
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
        /* Legacy non-JSON rows (plain text — before envelope). */
    }

    return raw;
}
