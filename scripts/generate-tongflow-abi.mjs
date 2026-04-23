/**
 * Build-time helper: generate a starter `config/tongflow.abi.json`.
 *
 * NOTE: After migration, `config/tongflow.abi.json` is the only tracked config JSON.
 * This script is intentionally conservative: it will NOT read other config JSON files.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outPath = path.join(root, "config", "tongflow.abi.json");

// If user already maintains ABI, keep it as-is.
if (fs.existsSync(outPath)) {
    console.log(`Exists: ${path.relative(root, outPath)} (no changes)`);
    process.exit(0);
}

// Minimal starter ABI: includes only the transcribe slots as an example.
const list = [
    {
        name: "transcribe",
        type: "gpu",
        function: "qwen3-asr",
        processingTime: 10,
    },
    {
        name: "transcribe_timestamp",
        type: "gpu",
        function: "qwen3-asr-timestamp",
        processingTime: 10,
    },
];

const genericTaskPrompt = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "ModalTaskPrompt",
    type: "object",
    description:
        "Payload merged into task.prompt. Plugins receive the Openflow task object.",
    additionalProperties: true,
};

const genericResult = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "HandlerResult",
    type: "object",
    additionalProperties: true,
};

const transcribePrompt = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "TranscribeTaskPrompt",
    type: "object",
    additionalProperties: true,
    properties: {
        audio: { type: "string" },
        video: { type: "string" },
        audioUrl: { type: "string" },
        videoUrl: { type: "string" },
        context: { type: "string" },
        prompt: { type: "string" },
        text: { type: "string" },
        language: { type: "string" },
        max_new_tokens: { type: "number" },
        pluginId: { type: "string" },
        nodeSlot: { type: "string" },
    },
};

const transcribeResult = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "TranscribeHandlerResult",
    type: "object",
    additionalProperties: true,
    properties: {
        success: { type: "boolean" },
        text: { type: "string" },
        error: { type: "string" },
        language: { type: "string" },
        time_stamps: { type: "array" },
    },
};

const nodes = list.map((f) => {
    const name = f.name;
    const useTranscribe =
        name === "transcribe" || name === "transcribe_timestamp";
    return {
        nodeSlot: name,
        featureName: name,
        defaultHandler: {
            type: String(f.type),
            function: String(f.function),
        },
        processingTime: f.processingTime,
        taskPromptSchema: useTranscribe ? transcribePrompt : genericTaskPrompt,
        resultSchema: useTranscribe ? transcribeResult : genericResult,
    };
});

const abi = {
    version: 1,
    generatedAt: new Date().toISOString(),
    nodes,
};

fs.writeFileSync(outPath, `${JSON.stringify(abi, null, 2)}\n`);
console.log(`Wrote ${path.relative(root, outPath)} (${nodes.length} nodes)`);
