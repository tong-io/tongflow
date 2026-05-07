/**
 * Serialize JSON for Server-Sent Events in **ASCII only** (Unicode via \\uXXXX).
 * Some clients / proxies / debuggers treat the stream as Latin-1; raw UTF-8
 * in `data: {...}` then shows mojibake (e.g. task start text -> ä»»åŠ¡å¼€å§‹æ‰§è¡Œ).
 * Escaping to \\u4efb\\u52a1… keeps the wire encoding charset-agnostic.
 */
export function jsonStringifyForSse(value: unknown): string {
    const s = JSON.stringify(value);
    return s.replace(
        // BMP code units only; CJK and most UI copy live here. Astral
        // characters in payloads are left as UTF-8 (rare in status strings).
        /[\u0080-\uFFFF]/g,
        (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`,
    );
}
