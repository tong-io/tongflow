import { z } from "zod";

/**
 * Plugins registry produced by the Python scanner over `plugins/*`.
 *
 * There is one kind of plugin and one way to run it: the platform spawns the
 * plugin's local entry and exchanges ABI JSON over stdin/stdout. Where the work
 * actually runs (locally, on Modal, on another cloud) is the plugin's own
 * concern — the platform binds to no backend.
 *
 * - nodePluginMap: nodeSlot -> list of `pluginId` (directory name under `plugins/`)
 * - plugins[pluginId]: how to launch that plugin's entry
 */
export const PluginMethodSchema = z.object({
    methodName: z.string().min(1),
});

export const PluginConfigSchema = z.object({
    /** Relative to repo root, e.g. `plugins/tongflow-modal-qwen3asr` */
    localSubdir: z.string().min(1),
    /** nodeSlot -> handler that implements it (informational; the plugin
     * dispatches in-process by nodeSlot). */
    methodsByNodeSlot: z.record(z.string().min(1), PluginMethodSchema),
    /** Generic runner executes `python <entryFile>` — for plugins that ship
     * their own entry. */
    entryFile: z.string().min(1).optional(),
    /** Or `python -m <entryModule>` — used by backend-bridged plugins whose
     * handlers live elsewhere (e.g. `tongflow.modal_entry` for a `deploy.py`
     * plugin). Exactly one of entryFile / entryModule is set. */
    entryModule: z.string().min(1).optional(),
});

export const PluginsRegistrySchema = z.object({
    version: z.literal(1),
    generatedAt: z.string().min(1),
    scannerVersion: z.number().int().optional(),
    nodePluginMap: z.record(z.string().min(1), z.array(z.string().min(1))),
    plugins: z.record(z.string().min(1), PluginConfigSchema),
    errors: z
        .array(
            z.object({
                pluginId: z.string().min(1),
                message: z.string().min(1),
            }),
        )
        .optional(),
});

export type PluginsRegistry = z.infer<typeof PluginsRegistrySchema>;
export type PluginConfig = z.infer<typeof PluginConfigSchema>;
