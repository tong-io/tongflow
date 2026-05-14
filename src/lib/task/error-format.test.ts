import { describe, expect, it } from "vitest";

import { formatStoredTaskErrorForDisplay } from "./error-format";

describe("formatStoredTaskErrorForDisplay", () => {
    it("reads SerializedTaskError.message", () => {
        expect(
            formatStoredTaskErrorForDisplay(
                JSON.stringify({
                    message: "hello",
                    ajvErrors: [{ instancePath: "/x", message: "bad" }],
                }),
            ),
        ).toBe("hello");
    });

    it("returns plain strings unchanged (legacy plaintext rows)", () => {
        expect(formatStoredTaskErrorForDisplay("no json")).toBe("no json");
    });

    it("falls back to raw for JSON lacking envelope message", () => {
        expect(
            formatStoredTaskErrorForDisplay(
                JSON.stringify({ success: false, error: "boom" }),
            ),
        ).toBe(JSON.stringify({ success: false, error: "boom" }));
    });
});
