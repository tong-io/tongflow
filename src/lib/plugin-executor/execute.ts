import "server-only";

import type { NodeSlot } from "@/generated/abi";
import { getPluginConfig } from "@/lib/plugins/plugins-registry.server";
import { convertAssetOutputsToFileRefs } from "./convert-output-fileref";
import type { PluginExecRequest, PluginExecResult } from "./types";

export async function executePlugin<S extends NodeSlot = NodeSlot>(
    req: PluginExecRequest<S>,
): Promise<PluginExecResult<S>> {
    const cfg = getPluginConfig(req.pluginId);
    if (!cfg) throw new Error(`Unknown plugin: ${req.pluginId}`);

    // One generic runner for every plugin: spawn the plugin's local entry and
    // exchange ABI JSON. Where the work actually runs (local, Modal, another
    // cloud) is the plugin's own concern.
    const { execPlugin } = await import("./runners/generic");
    const raw = await execPlugin(req);

    // Persist any binary `Asset` outputs into `{file_key}` refs, uniformly for
    // every plugin. ABI-driven (walks the slot's output schema for
    // `$ref:FileRef`); a no-op for slots with no FileRef fields.
    const converted = await convertAssetOutputsToFileRefs(
        req.nodeSlot,
        raw,
        req.taskId,
    );
    return converted as PluginExecResult<S>;
}
