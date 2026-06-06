/**
 * Date utility functions
 * Handles second-level or millisecond-level timestamps that may exist in the database
 */

/**
 * Safely convert a timestamp to a Date object
 * Handles the following cases:
 * 1. Already a Date object
 * 2. ISO date string
 * 3. Second-level timestamp (correct database format)
 * 4. Millisecond-level timestamp (incorrectly stored data)
 *
 * @param value - Timestamp value (can be Date, string, or number)
 * @returns Date object
 */
export function toSafeDate(
    value: Date | string | number | null | undefined,
): Date {
    if (!value) {
        return new Date();
    }

    // Already a Date object
    if (value instanceof Date) {
        // Check for an abnormal date (year > 3000)
        if (value.getFullYear() > 3000) {
            // The millisecond timestamp may have been treated as seconds; correction needed.
            // Drizzle's timestamp mode multiplies seconds by 1000, so divide by 1000 before converting.
            const correctedMs = value.getTime() / 1000;
            return new Date(correctedMs);
        }
        return value;
    }

    // String type
    if (typeof value === "string") {
        const date = new Date(value);
        if (!Number.isNaN(date.getTime())) {
            return toSafeDate(date); // Recursively check the result
        }
        return new Date();
    }

    // Number type
    if (typeof value === "number") {
        // Determine whether it is a second-level or millisecond-level timestamp.
        // Second-level timestamps are usually less than 10^10 (after 2001, ~10^9).
        // Millisecond-level timestamps are usually greater than 10^12 (after 2001, ~10^12).
        if (value > 1e11) {
            // Millisecond-level timestamp
            return new Date(value);
        } else {
            // Second-level timestamp
            return new Date(value * 1000);
        }
    }

    return new Date();
}

/**
 * Format a date as a locale date string
 *
 * @param value - Timestamp value
 * @param locale - Locale, auto-detected by default
 * @returns Formatted date string
 */
export function formatDate(
    value: Date | string | number | null | undefined,
    locale?: string,
): string {
    const date = toSafeDate(value);
    return date.toLocaleDateString(locale);
}

/**
 * Format a date-time as a locale date-time string
 *
 * @param value - Timestamp value
 * @param locale - Locale, auto-detected by default
 * @returns Formatted date-time string
 */
export function formatDateTime(
    value: Date | string | number | null | undefined,
    locale?: string,
): string {
    const date = toSafeDate(value);
    return date.toLocaleString(locale);
}
