/**
 * Normalize canvas / API file references to a `data/uploads/` relative fileKey.
 */

export function parseUploadFileKeyReference(raw: string): string | null {
    const t = raw.trim();
    if (!t) return null;
    const prefix = "/api/uploads/";
    if (t.startsWith(prefix)) {
        return t.slice(prefix.length);
    }
    if (t.startsWith("http://") || t.startsWith("https://")) {
        try {
            const u = new URL(t);
            if (u.pathname.startsWith(prefix)) {
                return u.pathname.slice(prefix.length);
            }
        } catch {
            return null;
        }
        return null;
    }
    if (t.includes("://")) return null;
    const relative = t.replace(/^\/+/, "");
    return relative || null;
}
