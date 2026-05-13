import "server-only";

import type { NodeSlot } from "@/generated/abi";
import { getPluginConfig } from "@/lib/plugins/plugins-registry.server";
import type { PluginExecRequest, PluginExecResult } from "./types";

export async function executePlugin<S extends NodeSlot = NodeSlot>(
    req: PluginExecRequest<S>,
): Promise<PluginExecResult<S>> {
    const cfg = getPluginConfig(req.pluginId);
    if (!cfg) throw new Error(`Unknown plugin: ${req.pluginId}`);

    if (cfg.runner === "modal") {
        const { execModalPlugin } = await import("./runners/modal");
        return await execModalPlugin(req);
    }

    if (cfg.runner === "llm") {
        const { execLlmPlugin } = await import("./runners/llm");
        return await execLlmPlugin(req);
    }

    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    throw new Error(`Unsupported runner: ${(cfg as any).runner}`);
}
