/**
 * Small dev/prod-aware logger. Use `debug` for trace noise; it no-ops in production.
 * Use `info` for messages that must appear in all environments (e.g. CLI success lines).
 * Prefer over raw `console.*` in app code.
 */
const isVerbose =
    typeof process !== "undefined" && process.env.NODE_ENV === "development";

export const logger = {
    debug: (...args: unknown[]) => {
        if (isVerbose) {
            console.log(...args);
        }
    },

    info: (...args: unknown[]) => {
        console.log(...args);
    },

    warn: (...args: unknown[]) => {
        console.warn(...args);
    },

    error: (...args: unknown[]) => {
        console.error(...args);
    },
};
