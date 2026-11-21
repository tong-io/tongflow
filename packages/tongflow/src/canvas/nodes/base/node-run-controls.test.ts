import { describe, expect, it } from "vitest";
import { implementationChoices } from "./node-run-controls";

const OCR_MODELS = ["pp-ocrv6-small", "pp-ocrv6-tiny", "glm-ocr"];

describe("implementationChoices", () => {
    it("offers the current plugin's models, marking the node's model", () => {
        const choices = implementationChoices({
            pluginIds: ["tongflow-edge-essentials", "tongflow-api-ocr"],
            currentPluginId: "tongflow-edge-essentials",
            models: OCR_MODELS,
            currentModel: "pp-ocrv6-tiny",
            pluginName: (id) =>
                id === "tongflow-api-ocr" ? "Cloud OCR" : undefined,
        });
        expect(choices.models).toEqual([
            { model: "pp-ocrv6-small", current: false },
            { model: "pp-ocrv6-tiny", current: true },
            { model: "glm-ocr", current: false },
        ]);
        expect(choices.alternatives).toEqual([
            { pluginId: "tongflow-api-ocr", label: "Cloud OCR" },
        ]);
    });

    it("marks the default (first) model when the node has none or a stale one", () => {
        for (const currentModel of ["", "gone"]) {
            const { models } = implementationChoices({
                pluginIds: ["tongflow-edge-essentials"],
                currentPluginId: "",
                models: OCR_MODELS,
                currentModel,
            });
            expect(models.filter((m) => m.current)).toEqual([
                { model: "pp-ocrv6-small", current: true },
            ]);
        }
    });

    it("lists no models for a plugin with fewer than two", () => {
        for (const models of [[], ["pp-ocrv6"]]) {
            const choices = implementationChoices({
                pluginIds: ["tongflow-edge-essentials", "tongflow-api-ocr"],
                currentPluginId: "tongflow-edge-essentials",
                models,
                currentModel: "",
            });
            expect(choices.models).toEqual([]);
            expect(choices.alternatives.map((a) => a.pluginId)).toEqual([
                "tongflow-api-ocr",
            ]);
        }
    });
});
