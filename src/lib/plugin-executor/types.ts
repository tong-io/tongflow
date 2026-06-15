import type { NodeSlot, SlotInput, SlotOutput } from "@/generated/abi";

export type PluginExecRequest<S extends NodeSlot = NodeSlot> = {
    pluginId: string;
    nodeSlot: S;
    /** Strong typed input object (ABI compile-time + Phase 2.4 ajv at boundaries). */
    input: SlotInput<S>;
    /** Task id for streaming notifyTask */
    taskId: string;
    /** Abort signal (cancellation) */
    signal: AbortSignal;
};

export type PluginExecResult<S extends NodeSlot = NodeSlot> = SlotOutput<S> & {
    success: boolean;
    file_key?: string;
    error?: string;
};
