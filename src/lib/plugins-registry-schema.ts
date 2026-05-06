import { z } from "zod";

/**
 * Plugins registry produced by the Python scanner over `plugins/*`.
 *
 * - nodePluginMap: nodeSlot -> list of `pluginId` (directory name under `plugins/`)
 * - plugins[pluginId]: runner-agnostic config + per-runner settings
 */
export const ModalMethodSchema = z.object({
    methodName: z.string().min(1),
    /** When set, Modal `cls.fromName(appName, clsName)` uses this class for this slot. */
    clsName: z.string().min(1).optional(),
});

export const ModalPluginConfigSchema = z.object({
    appName: z.string().min(1),
    clsName: z.string().min(1).default("Inference"),
    /** Relative to repo root, e.g. `plugins/tongflow-modal-qwen3asr` */
    localSubdir: z.string().min(1),
    deployFile: z.string().min(1).default("deploy.py"),
    downloadFile: z.string().min(1).default("download.py"),
    /** nodeSlot -> which Modal @modal.method to call (instance method name). */
    methodsByNodeSlot: z.record(z.string().min(1), ModalMethodSchema),
});

export const LlmMethodSchema = z.object({
    methodName: z.string().min(1),
});

export const LlmPluginConfigSchema = z.object({
    /** nodeSlot -> which local entry.py handler implements it. */
    methodsByNodeSlot: z.record(z.string().min(1), LlmMethodSchema),
    /** Relative to repo root, e.g. `plugins/tongflow-llm-openrouter-free` */
    localSubdir: z.string().min(1),
    /** Entry file to execute for this plugin, e.g. `entry.py` */
    entryFile: z.string().min(1).default("entry.py"),
});

export const ModalPluginSchema = z.object({
    runner: z.literal("modal"),
    runners: z.object({
        modal: ModalPluginConfigSchema,
    }),
});

export const LlmPluginSchema = z.object({
    runner: z.literal("llm"),
    runners: z.object({
        llm: LlmPluginConfigSchema,
    }),
});

export const PluginConfigSchema = z.union([ModalPluginSchema, LlmPluginSchema]);

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
export type ModalPluginConfig = z.infer<typeof ModalPluginConfigSchema>;
export type LlmPluginConfig = z.infer<typeof LlmPluginConfigSchema>;
export type PluginConfig = z.infer<typeof PluginConfigSchema>;
