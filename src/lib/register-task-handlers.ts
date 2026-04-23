/**
 * Legacy handler registry has been retired.
 *
 * Openflow core is platform/model-agnostic: all execution is routed via
 * `pluginId + nodeSlot` through the plugin executor.
 */

export function ensureHandlersRegistered(): void {
    // no-op (kept to avoid breaking older dynamic imports)
}
