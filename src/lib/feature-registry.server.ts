import "server-only";

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { buildFeatureRegistry } from "@/lib/feature-registry";
import {
    validateFeatureRegistryBundle,
    FeatureRegistryBundleSchema,
    type FeatureRegistryBundle,
    type FeatureDefinition,
} from "@/lib/feature-registry-schema";
import { TONGFLOW_ABI_NODES } from "@/lib/tongflow-abi";
import { logger } from "@/lib/logger";

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

function loadMergedServerBundle(
    defaultBundle: FeatureRegistryBundle,
): FeatureRegistryBundle {
    let merged = validateFeatureRegistryBundle(defaultBundle);

    const localPath = join(process.cwd(), ".tongflow", "features.local.json");
    if (existsSync(localPath)) {
        try {
            const local = validateFeatureRegistryBundle(readJsonFile(localPath));
            merged = mergeBundles(merged, local);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (process.env.NODE_ENV === "development") {
                throw new Error(
                    `[feature-registry] Invalid config/features.local.json: ${msg}`,
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

const defaultBundle = validateFeatureRegistryBundle({
    features: TONGFLOW_ABI_NODES.map((n) => ({
        name: n.featureName,
        type: n.defaultHandler.type,
        function: n.defaultHandler.function,
        processingTime: n.processingTime ?? 0,
    })),
    aliases: { canonical: {}, labelLookup: {} },
});

const serverRegistry = buildFeatureRegistry(loadMergedServerBundle(defaultBundle));

/** Server-side bundle merges features.local.json plus FEATURES_CONFIG_PATH overrides */
export const getAllFeatures = serverRegistry.getAllFeatures;
export const resolveCanonicalFeatureName =
    serverRegistry.resolveCanonicalFeatureName;
export const resolveLabelLookupFeatureName =
    serverRegistry.resolveLabelLookupFeatureName;
export const getFeatureByName = serverRegistry.getFeatureByName;
export const getFeatureRegistryAliases =
    serverRegistry.getFeatureRegistryAliases;
