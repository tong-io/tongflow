import { z } from "zod";

/**
 * Optional per-plugin env declaration file: `tongflow.plugin.json` at the
 * plugin repo root. For Python plugins it only feeds the Settings UI
 * (per-plugin env var cards); handler registration stays annotation-driven.
 * Edge (browser) plugins also declare `runtime` / `entry` / `slots` here — the
 * Python scanner reads those keys; this schema ignores them.
 */
export const PluginEnvVarSchema = z.object({
    /** Env key, conventional UPPER_SNAKE. */
    key: z
        .string()
        .min(1)
        .regex(/^[A-Z][A-Z0-9_]*$/),
    /** Required keys render flat in the card; optional ones go under "Advanced". */
    required: z.boolean().optional(),
    /** Short human hint shown under the input. */
    description: z.string().optional(),
    /** Default the plugin uses when unset; shown as the input placeholder. */
    default: z.string().optional(),
    /** Where to obtain the key (e.g. the provider's API-keys page). */
    url: z.url().optional(),
    /** Value shape; drives the input widget in the settings dialog. When
     * absent, the app-side registry / suffix heuristics decide. */
    type: z
        .enum(["secret", "select", "boolean", "number", "url", "text"])
        .optional(),
    /** Allowed values for `type: "select"`. */
    options: z.array(z.string()).optional(),
});

/**
 * Optional plugin-level presentation metadata declared under the top-level
 * `plugin` key of `tongflow.plugin.json`. Surfaced in the node plugin picker
 * and the plugin manager dialog. Purely cosmetic — never read for discovery
 * or execution.
 */
export const PluginMetaSchema = z.object({
    /** Human display name; falls back to an id-derived label when absent. */
    name: z.string().optional(),
    /** Short blurb: what this plugin does / which model or service backs it. */
    description: z.string().optional(),
    /** Icon reference: an app-root path (e.g. `/plugins/<id>.svg`) or an
     * absolute https URL to the backing model/service logo. */
    icon: z.string().optional(),
});

export const PluginEnvManifestSchema = z.object({
    /** Presentation-only plugin metadata (name/description/icon). */
    plugin: PluginMetaSchema.optional(),
    env: z.array(PluginEnvVarSchema).default([]),
});

export type PluginEnvVar = z.infer<typeof PluginEnvVarSchema>;
export type PluginMeta = z.infer<typeof PluginMetaSchema>;
export type PluginEnvManifest = z.infer<typeof PluginEnvManifestSchema>;

/** Loader output: one entry per installed plugin that ships a manifest. */
export interface PluginEnvDecl {
    pluginId: string;
    /** Present when the manifest declares a top-level `plugin` block. */
    meta?: PluginMeta;
    env: PluginEnvVar[];
}
