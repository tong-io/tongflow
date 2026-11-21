import { z } from "zod";

/**
 * Plugins registry produced by the Python scanner over `plugins/*`.
 *
 * Plugins come in two runtimes:
 * - `python` (default; `tongflow-modal-*` / `-api-*` / `-router-*` /
 *   `-local-*`): the platform spawns the plugin's local entry and exchanges
 *   ABI JSON over stdin/stdout. Where the work actually runs (locally, on
 *   Modal, on another cloud) is the plugin's own concern — the platform binds
 *   to no backend.
 * - `browser` (`tongflow-edge-*`): a TypeScript ESM module the browser edge
 *   runtime loads; the Python engine never runs it. Its slots come from the
 *   plugin's `tongflow.plugin.json` instead of Python sources.
 *
 * - nodePluginMap: nodeSlot -> list of `pluginId` (directory name under `plugins/`).
 *   The head of each list is that slot's **default implementation**: what a
 *   freshly added node preselects and what the plugin picker lists first. A
 *   plugin claims it with `@node_slot(..., default=True)` and the scanner
 *   hoists it; with no claim (or the claimant not installed) the head is just
 *   the first plugin in directory order.
 * - plugins[pluginId]: how to launch that plugin's entry
 */
/**
 * One entry of a plugin's `TONGFLOW_SLOT_PARAMS` declaration: a plugin-specific
 * run-time knob the node offers under its collapsed "Advanced" section. These
 * are never ABI fields — the canvas sends the user's picks top-level as
 * `params` and the plugin reads them via `tongflow.slots.current_params()`,
 * falling back to its own defaults for anything unset.
 */
const paramLiteral = z.union([z.string(), z.number(), z.boolean()]);
export const PluginParamSpecSchema = z.object({
    type: z.enum(["select", "number", "integer", "boolean", "text"]),
    label: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    default: paramLiteral.optional(),
    /** `select` only. */
    options: z
        .array(z.union([z.string(), z.number()]))
        .min(1)
        .optional(),
    /** `number` / `integer` only. */
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.number().optional(),
    /** When set, only offered while one of these router models is selected. */
    models: z.array(z.string().min(1)).min(1).optional(),
});

export const PluginMethodSchema = z.object({
    methodName: z.string().min(1),
    /** Optional per-slot model ids a router-style plugin exposes
     * (`TONGFLOW_SLOT_MODELS` in the plugin source); first entry is the
     * default. Absent for single-model plugins. */
    models: z.array(z.string().min(1)).optional(),
    /** Optional per-slot advanced parameters (`TONGFLOW_SLOT_PARAMS` in the
     * plugin source), in declared order. Absent when the plugin exposes none. */
    params: z.record(z.string().min(1), PluginParamSpecSchema).optional(),
});

/**
 * Optional live model catalog (`TONGFLOW_MODEL_CATALOG` in the plugin source).
 * The canvas GETs `url` in the browser (public, CORS-enabled, no auth) — or,
 * when `authEnv` names the env key holding a bearer token, through the app's
 * `/api/plugins/model-catalog` route, which injects the stored key server-side
 * — reads the record array at dot-path `items`, each model id at dot-path `id`, drops
 * records where an `exclude` field equals its literal, and keeps a record for
 * a slot when every `slots[slot]` token is a substring of the named field
 * (arrays/objects are JSON-serialized before matching; a token prefixed with
 * `!` must be absent instead). Matching ids extend
 * that slot's dropdown after the static `models` shortlist.
 */
export const PluginModelCatalogSchema = z.object({
    url: z.string().url(),
    /** Env key whose value is sent as `Authorization: Bearer …`; the fetch is
     * proxied server-side so the key never reaches the browser. */
    authEnv: z.string().min(1).optional(),
    items: z.string().min(1).default("data"),
    id: z.string().min(1).default("id"),
    exclude: z
        .record(
            z.string().min(1),
            z.union([z.string(), z.boolean(), z.number()]),
        )
        .optional(),
    /** slot -> field -> token(s). Every token must be a substring of the
     * field's JSON; a token prefixed with `!` must be absent. */
    slots: z.record(
        z.string().min(1),
        z.record(
            z.string().min(1),
            z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
        ),
    ),
});

/** Where a plugin's slot handlers execute. Absent means `python`. */
export const PluginRuntimeSchema = z.enum(["python", "browser"]);

export const PluginConfigSchema = z.object({
    /** Relative to repo root, e.g. `plugins/tongflow-<runner>-foo` */
    localSubdir: z.string().min(1),
    /** nodeSlot -> handler that implements it (informational; the plugin
     * dispatches in-process by nodeSlot). */
    methodsByNodeSlot: z.record(z.string().min(1), PluginMethodSchema),
    /** Python plugins: the generic runner executes `python <entryFile>`
     * (every Python plugin ships its own entry.py). Browser plugins: the ESM
     * module the edge runtime imports, relative to `localSubdir`. */
    entryFile: z.string().min(1).optional(),
    /** `python` (default when absent) or `browser` (`tongflow-edge-*`, run by
     * the browser edge runtime only). Read it through `pluginRuntime()`. */
    runtime: PluginRuntimeSchema.optional(),
    /** True when the plugin's class is marked `@deploy` (a deploy-first backend
     * such as Modal): its entry.py deploys once before invoking. Informational —
     * the deploy step lives inside the plugin's entry.py. */
    needsDeploy: z.boolean().optional(),
    /** Live model catalog the canvas can fetch to extend the model dropdown. */
    modelCatalog: PluginModelCatalogSchema.optional(),
    /** Presentation-only metadata merged in from `tongflow.plugin.json`'s
     * top-level `plugin` block (name/description/icon). Not produced by the
     * scanner; attached by the registry API route for the node picker. */
    name: z.string().optional(),
    description: z.string().optional(),
    icon: z.string().optional(),
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
export type PluginModelCatalog = z.infer<typeof PluginModelCatalogSchema>;
export type PluginParamSpec = z.infer<typeof PluginParamSpecSchema>;
export type PluginRuntime = z.infer<typeof PluginRuntimeSchema>;

/** A plugin's runtime, defaulting to `python` for registries that predate the
 * field (scanner < 9) and for an unknown / missing plugin. */
export function pluginRuntime(
    plugin: Pick<PluginConfig, "runtime"> | null | undefined,
): PluginRuntime {
    return plugin?.runtime ?? "python";
}

/** True when the plugin runs in the browser edge runtime (never in the Python
 * engine). */
export function isBrowserPlugin(
    plugin: Pick<PluginConfig, "runtime"> | null | undefined,
): boolean {
    return pluginRuntime(plugin) === "browser";
}
