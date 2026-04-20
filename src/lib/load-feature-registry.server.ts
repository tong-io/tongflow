import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
    validateFeatureRegistryBundle,
    FeatureRegistryBundleSchema,
    type FeatureRegistryBundle,
    type FeatureDefinition,
} from "@/lib/feature-registry-schema";

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
    const text = readFileSync(path, "utf8");
    return JSON.parse(text) as unknown;
}

/**
 * Server-only: merge default (imported) + config/features.local.json + FEATURES_CONFIG_PATH.
 */
export function loadMergedServerBundle(
    defaultBundle: FeatureRegistryBundle,
): FeatureRegistryBundle {
    let merged = validateFeatureRegistryBundle(defaultBundle);

    const localPath = join(process.cwd(), "config/features.local.json");
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
            console.error(
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
            throw new Error(`[feature-registry] Duplicate feature name: ${f.name}`);
        }
        names.add(f.name);
    }

    return merged;
}
