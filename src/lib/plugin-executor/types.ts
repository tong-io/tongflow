export type PluginExecRequest = {
    pluginId: string;
    nodeSlot: string;
    /** Strong typed input object (validated by ABI on build-time + scan). */
    input: Record<string, unknown>;
    /** Task id for streaming notifyTask */
    taskId: string;
    /** Abort signal (cancellation) */
    signal: AbortSignal;
};

export type PluginExecResult = Record<string, unknown>;

export type PluginRunner = "modal" | "llm";

