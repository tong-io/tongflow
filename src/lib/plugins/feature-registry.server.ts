import "server-only";

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { logger } from "@/lib/logger";
import { buildFeatureRegistry } from "@/lib/plugins/feature-registry";
import {
    type FeatureDefinition,
    type FeatureRegistryBundle,
    FeatureRegistryBundleSchema,
    validateFeatureRegistryBundle,
} from "@/lib/plugins/feature-registry-schema";
import { loadPluginsRegistry } from "@/lib/plugins/plugins-registry.server";
import { dataDir } from "@/lib/runtime/paths.server";
import { TONGFLOW_ABI_NODES } from "@/lib/schema/tongflow-abi";

function mergeBundles(
    base: FeatureRegistryBundle,
    overlay: Partial<FeatureRegistryBundle>,
): FeatureRegistryBundle {
    const byName = new Map<string, FeatureDefinition>();
    for (const f of base.features) {
        byName.set(f.name, f);
    }
    for (const f of overlay.features ?? []) {
        byName.set(f.name, f);
    }
    return {
        features: Array.from(byName.values()),
        aliases: {
            canonical: {
                ...base.aliases.canonical,
                ...(overlay.aliases?.canonical ?? {}),
            },
            labelLookup: {
                ...base.aliases.labelLookup,
                ...(overlay.aliases?.labelLookup ?? {}),
            },
        },
    };
}

function readJsonFile(path: string): unknown {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function featureDefinitionForSlot(nodeSlot: string): FeatureDefinition {
    const reg = loadPluginsRegistry();
    const ids = reg.nodePluginMap[nodeSlot] ?? [];
    if (ids.length === 0) {
        logger.warn(
            `[feature-registry] No plugins in nodePluginMap for nodeSlot="${nodeSlot}"; using type=function=unregistered`,
        );
        return {
            name: nodeSlot,
            type: "unregistered",
            function: "unregistered",
        };
    }
    const pid = ids[0].trim();
    const p = reg.plugins[pid];
    if (!p) {
        throw new Error(
            `[feature-registry] nodePluginMap lists ${pid} for ${nodeSlot} but plugins.${pid} is missing`,
        );
    }
    // One plugin kind, one runner. The implementing plugin id is the "function".
    return {
        name: nodeSlot,
        type: "plugin",
        function: pid,
    };
}

function deriveBundleFromPluginsRegistry(): FeatureRegistryBundle {
    return validateFeatureRegistryBundle({
        features: TONGFLOW_ABI_NODES.map((n) =>
            featureDefinitionForSlot(n.nodeSlot),
        ),
        aliases: {
            canonical: {},
            labelLookup: {},
        },
    });
}

function loadMergedServerBundle(
    defaultBundle: FeatureRegistryBundle,
): FeatureRegistryBundle {
    let merged = validateFeatureRegistryBundle(defaultBundle);

    const localPath = join(dataDir(), ".tongflow", "features.local.json");
    if (existsSync(localPath)) {
        try {
            const local = validateFeatureRegistryBundle(
                readJsonFile(localPath),
            );
            merged = mergeBundles(merged, local);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (process.env.NODE_ENV === "development") {
                throw new Error(
                    `[feature-registry] Invalid .tongflow/features.local.json: ${msg}`,
                );
            }
            logger.error(
                "[feature-registry] Ignoring invalid features.local.json:",
                msg,
            );
        }
    }

    const extraPath = process.env.FEATURES_CONFIG_PATH;
    if (extraPath && existsSync(extraPath)) {
        const raw = readJsonFile(extraPath);
        const extra = FeatureRegistryBundleSchema.partial().parse(raw);
        merged = mergeBundles(merged, extra);
    }

    const names = new Set<string>();
    for (const f of merged.features) {
        if (names.has(f.name)) {
            throw new Error(
                `[feature-registry] Duplicate feature name: ${f.name}`,
            );
        }
        names.add(f.name);
    }

    return merged;
}

const mergedBundle = loadMergedServerBundle(deriveBundleFromPluginsRegistry());

const serverRegistry = buildFeatureRegistry(mergedBundle);

/** Server-side bundle merges features.local.json plus FEATURES_CONFIG_PATH overrides */
export const getAllFeatures = serverRegistry.getAllFeatures;
export const resolveCanonicalFeatureName =
    serverRegistry.resolveCanonicalFeatureName;
export const resolveLabelLookupFeatureName =
    serverRegistry.resolveLabelLookupFeatureName;
export const getFeatureByName = serverRegistry.getFeatureByName;
export const getFeatureRegistryAliases =
    serverRegistry.getFeatureRegistryAliases;
