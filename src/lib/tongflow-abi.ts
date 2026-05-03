import { z } from "zod";
import tongflowAbi from "../../config/tongflow.abi.json";

const AbiNodeSchema = z.object({
    nodeSlot: z.string().min(1),
    inputs: z.unknown(),
    outputs: z.unknown(),
});

const TongflowAbiFileSchema = z.object({
    version: z.literal(1),
    source: z.string().optional(),
    $defs: z.record(z.string(), z.unknown()).optional(),
    nodes: z.array(AbiNodeSchema),
});

export type TongflowAbiNode = z.infer<typeof AbiNodeSchema>;

const parsed = TongflowAbiFileSchema.parse(tongflowAbi);

const bySlot = new Map<string, TongflowAbiNode>();
for (const n of parsed.nodes) {
    bySlot.set(n.nodeSlot, n);
}

export const TONGFLOW_ABI_VERSION = parsed.version;
export const TONGFLOW_ABI_NODES: readonly TongflowAbiNode[] = parsed.nodes;

export function getAbiNodeBySlot(nodeSlot: string): TongflowAbiNode | undefined {
    return bySlot.get(nodeSlot);
}
