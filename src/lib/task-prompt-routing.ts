import { extractAbiBusinessInput } from "@/lib/abi-schema-validate";
import { normalizeLegacyPluginId } from "@/lib/legacy-plugin-id-map";

/**
 * Resolve plugin id from nested `routing.pluginId` or legacy flat `prompt.pluginId`.
 */
export function resolveRoutingPluginId(params: Record<string, unknown>): string {
    const r = params.routing;
    if (r && typeof r === "object" && !Array.isArray(r)) {
        const pid = (r as Record<string, unknown>).pluginId;
        if (typeof pid === "string" && pid.trim()) {
            return normalizeLegacyPluginId(pid.trim());
        }
    }
    const flat = params.pluginId;
    if (typeof flat === "string" && flat.trim()) {
        return normalizeLegacyPluginId(flat.trim());
    }
    return "";
}

/**
 * Stored task.prompt JSON: `{ routing: { pluginId }, ...business }` (no routing keys in business).
 */
export function buildPersistedTaskPrompt(
    prompt: Record<string, unknown>,
    resolvedPluginId: string,
): Record<string, unknown> {
    const business = extractAbiBusinessInput(prompt);
    return {
        routing: { pluginId: resolvedPluginId },
        ...business,
    };
}
