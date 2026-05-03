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

// Minimal starter ABI: only two slots; mirrors `config/tongflow.abi.json` shape (nodeSlot + inputs + outputs + $defs.Asset).
const Asset = { $ref: "#/$defs/Asset" };
const nodes = [
    {
        nodeSlot: "transcribe",
        inputs: {
            type: "object",
            required: ["audio"],
            properties: {
                audio: Asset,
                context: { type: "string" },
                language: { type: "string" },
                max_new_tokens: { type: "number" },
            },
            additionalProperties: false,
        },
        outputs: {
            type: "object",
            required: ["text"],
            properties: {
                text: { type: "string", minLength: 1 },
                language: { type: "string" },
            },
            additionalProperties: false,
        },
    },
    {
        nodeSlot: "transcribe_timestamp",
        inputs: {
            type: "object",
            required: ["audio"],
            properties: {
                audio: Asset,
                context: { type: "string" },
                language: { type: "string" },
                max_new_tokens: { type: "number" },
            },
            additionalProperties: false,
        },
        outputs: {
            type: "object",
            required: ["text"],
            properties: {
                text: { type: "string", minLength: 1 },
                language: { type: "string" },
                time_stamps: {
                    type: "array",
                    items: {
                        type: "object",
                        required: ["text", "start_time", "end_time"],
                        properties: {
                            text: { type: "string", minLength: 1 },
                            start_time: { type: "number" },
                            end_time: { type: "number" },
                        },
                        additionalProperties: false,
                    },
                },
            },
            additionalProperties: false,
        },
    },
];

const abi = {
    version: 1,
    $defs: {
        Asset: {
            type: "object",
            required: ["bytesBase64"],
            properties: {
                bytesBase64: { type: "string", minLength: 1 },
                filename: { type: "string" },
                mime: { type: "string" },
            },
            additionalProperties: false,
        },
    },
    nodes,
};

fs.writeFileSync(outPath, `${JSON.stringify(abi, null, 2)}\n`);
console.log(`Wrote ${path.relative(root, outPath)} (${nodes.length} nodes)`);
