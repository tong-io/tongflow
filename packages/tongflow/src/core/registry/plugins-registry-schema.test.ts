import { describe, expect, it } from "vitest";

import {
    isBrowserPlugin,
    PluginConfigSchema,
    PluginsRegistrySchema,
    pluginRuntime,
} from "./plugins-registry-schema";

const pythonPlugin = {
    localSubdir: "tongflow-api-fake",
    methodsByNodeSlot: { "gen-text": { methodName: "gen_text" } },
    entryFile: "entry.py",
    needsDeploy: false,
};

const browserPlugin = {
    localSubdir: "tongflow-edge-essentials",
    methodsByNodeSlot: {
        "ocr-image": { methodName: "ocrImage", models: ["pp-ocrv6"] },
    },
    entryFile: "dist/index.js",
    needsDeploy: false,
    runtime: "browser",
};

describe("plugin runtime", () => {
    it("accepts python and browser", () => {
        expect(
            PluginConfigSchema.parse({ ...pythonPlugin, runtime: "python" })
                .runtime,
        ).toBe("python");
        expect(PluginConfigSchema.parse(browserPlugin).runtime).toBe("browser");
    });

    it("is optional and reads as python when absent", () => {
        const parsed = PluginConfigSchema.parse(pythonPlugin);
        expect(parsed.runtime).toBeUndefined();
        expect(pluginRuntime(parsed)).toBe("python");
        expect(isBrowserPlugin(parsed)).toBe(false);
        expect(pluginRuntime(undefined)).toBe("python");
    });

    it("flags browser plugins", () => {
        expect(isBrowserPlugin(PluginConfigSchema.parse(browserPlugin))).toBe(
            true,
        );
    });

    it("keeps a browser slot's model alternatives in declared order", () => {
        const models = ["pp-ocrv6-small", "pp-ocrv6-tiny", "glm-ocr"];
        const parsed = PluginConfigSchema.parse({
            ...browserPlugin,
            methodsByNodeSlot: {
                "ocr-image": { methodName: "ocrImage", models },
            },
        });
        expect(parsed.methodsByNodeSlot["ocr-image"].models).toEqual(models);
    });

    it("rejects an unknown runtime", () => {
        expect(
            PluginConfigSchema.safeParse({ ...pythonPlugin, runtime: "wasm" })
                .success,
        ).toBe(false);
    });

    it("parses a scanner payload that mixes both runtimes", () => {
        const registry = PluginsRegistrySchema.parse({
            version: 1,
            generatedAt: "2026-11-21T00:00:00Z",
            scannerVersion: 9,
            nodePluginMap: {
                "gen-text": ["tongflow-api-fake"],
                "ocr-image": ["tongflow-edge-essentials"],
            },
            plugins: {
                "tongflow-api-fake": { ...pythonPlugin, runtime: "python" },
                "tongflow-edge-essentials": browserPlugin,
            },
            errors: [],
        });
        expect(
            Object.entries(registry.plugins)
                .filter(([, p]) => isBrowserPlugin(p))
                .map(([id]) => id),
        ).toEqual(["tongflow-edge-essentials"]);
    });
});
