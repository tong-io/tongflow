import "server-only";

import type { PluginExecRequest, PluginExecResult } from "./types";
import { getPluginConfig } from "@/lib/plugins-registry.server";

export async function executePlugin(
    req: PluginExecRequest,
): Promise<PluginExecResult> {
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

