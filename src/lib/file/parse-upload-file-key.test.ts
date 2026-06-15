import { describe, expect, it } from "vitest";

import { parseUploadFileKeyReference } from "./parse-upload-file-key";

describe("parseUploadFileKeyReference", () => {
    it("accepts bare keys from POST /api/upload", () => {
        expect(parseUploadFileKeyReference("V1StGXR8_Z5jdHi6B-myT.wav")).toBe(
            "V1StGXR8_Z5jdHi6B-myT.wav",
        );
    });

    it("strips /api/uploads/ prefix", () => {
        expect(parseUploadFileKeyReference("/api/uploads/tasks/t1/a.wav")).toBe(
            "tasks/t1/a.wav",
        );
    });

    it("accepts relative paths with slashes", () => {
        expect(parseUploadFileKeyReference("uploads/ref.wav")).toBe(
            "uploads/ref.wav",
        );
    });

    it("rejects non-upload URLs", () => {
        expect(
            parseUploadFileKeyReference("https://cdn.example.com/x.wav"),
        ).toBeNull();
    });
});
