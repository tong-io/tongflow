/** Base64 helpers on `atob` / `btoa`, available in browsers, workers and Node ≥ 16. */

const CHUNK = 0x8000;

export function bytesToBase64(bytes: Uint8Array): string {
    let binary = "";
    for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
}

/**
 * Decodes standard base64. Like Python's non-validating `b64decode`,
 * characters outside the alphabet (whitespace, stray padding) are dropped.
 */
export function base64ToBytes(b64: string): Uint8Array {
    const clean = b64.replace(/[^A-Za-z0-9+/]/g, "");
    const binary = atob(clean.padEnd(Math.ceil(clean.length / 4) * 4, "="));
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
}

export function utf8ToBase64(text: string): string {
    return bytesToBase64(new TextEncoder().encode(text));
}

export function base64ToUtf8(b64: string): string {
    return new TextDecoder().decode(base64ToBytes(b64));
}
