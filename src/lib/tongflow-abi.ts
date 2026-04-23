import { z } from "zod";
import tongflowAbi from "../../config/tongflow.abi.json";

const AbiNodeSchema = z.object({
    nodeSlot: z.string().min(1),
    featureName: z.string().min(1),
    defaultHandler: z.object({
        type: z.string().min(1),
        function: z.string().min(1),
    }),
    processingTime: z.number().optional(),
    taskPromptSchema: z.unknown(),
    resultSchema: z.unknown(),
});

const TongflowAbiFileSchema = z.object({
    version: z.literal(1),
    generatedAt: z.string().optional(),
    source: z.string().optional(),
    nodes: z.array(AbiNodeSchema),
});

export type TongflowAbiNode = z.infer<typeof AbiNodeSchema>;

const parsed = TongflowAbiFileSchema.parse(tongflowAbi);

const bySlot = new Map<string, TongflowAbiNode>();
const byFeature = new Map<string, TongflowAbiNode>();
for (const n of parsed.nodes) {
    bySlot.set(n.nodeSlot, n);
    byFeature.set(n.featureName, n);
}

export const TONGFLOW_ABI_VERSION = parsed.version;
export const TONGFLOW_ABI_NODES: readonly TongflowAbiNode[] = parsed.nodes;

export function getAbiNodeBySlot(nodeSlot: string): TongflowAbiNode | undefined {
    return bySlot.get(nodeSlot);
}

export function getAbiNodeByFeatureName(
    featureName: string,
): TongflowAbiNode | undefined {
    return byFeature.get(featureName);
}

/** ASR feature names that share the same Qwen3 plugin implementation. */
export const NODE_TRANSCRIBE_SLOTS: readonly [string, string] = [
    "transcribe",
    "transcribe_timestamp",
];

/**
 * Zod object for the subset of `task.prompt` used on transcribe nodes + plugins.
 * (Openflow still passes extra fields; this is for compile-time shape hints.)
 */
export const TranscribePluginPromptSchema = z
    .object({
        audio: z.string().optional(),
        video: z.string().optional(),
        audioUrl: z.string().optional(),
        videoUrl: z.string().optional(),
        context: z.string().optional(),
        prompt: z.string().optional(),
        text: z.string().optional(),
        language: z.string().optional(),
        max_new_tokens: z.number().optional(),
        pluginId: z.string().optional(),
        nodeSlot: z.string().optional(),
        pluginRepo: z.string().optional(),
    })
    .passthrough();

export type TranscribePluginPrompt = z.infer<typeof TranscribePluginPromptSchema>;
