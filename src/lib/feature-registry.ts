/**
 * Feature Registry (client and shared logic)
 *
 * IMPORTANT: `config/` must only contain `tongflow.abi.json`.
 * We derive the feature registry from ABI nodes (featureName + defaultHandler).
 */

import { TONGFLOW_ABI_NODES } from "@/lib/tongflow-abi";
import {
    validateFeatureRegistryBundle,
    type FeatureRegistryBundle,
    type FeatureDefinition,
} from "@/lib/feature-registry-schema";

export type {
    FeatureDefinition,
    FeatureRegistryBundle,
} from "@/lib/feature-registry-schema";

function deriveBundleFromAbi(): FeatureRegistryBundle {
    const features: FeatureDefinition[] = TONGFLOW_ABI_NODES.map((n) => ({
        name: n.featureName,
        type: n.defaultHandler.type,
        function: n.defaultHandler.function,
        processingTime: n.processingTime ?? 0,
    }));
    return validateFeatureRegistryBundle({
        features,
        aliases: { canonical: {}, labelLookup: {} },
    });
}

const defaultBundle = deriveBundleFromAbi();

function buildMap(features: FeatureDefinition[]): Map<string, FeatureDefinition> {
    return new Map(features.map((f) => [f.name, f]));
}

export function buildFeatureRegistry(bundle: FeatureRegistryBundle) {
    const map = buildMap(bundle.features);
    const canonical = bundle.aliases.canonical;
    const labelLookup = bundle.aliases.labelLookup;

    return {
        bundle,
        getAllFeatures: (): FeatureDefinition[] => bundle.features.slice(),
        resolveCanonicalFeatureName: (name: string): string =>
            canonical[name] ?? name,
        resolveLabelLookupFeatureName: (name: string): string | undefined =>
            labelLookup[name],
        getFeatureByName: (name: string): FeatureDefinition | undefined => {
            const key = canonical[name] ?? name;
            return map.get(key) ?? map.get(name);
        },
        getFeatureRegistryAliases: () => ({
            canonical: { ...canonical },
            labelLookup: { ...labelLookup },
        }),
    };
}

const clientRegistry = buildFeatureRegistry(defaultBundle);

/** Client / sync tools: based on the default JSON (without features.local merging) */
export const getAllFeatures = clientRegistry.getAllFeatures;
export const resolveCanonicalFeatureName =
    clientRegistry.resolveCanonicalFeatureName;
export const resolveLabelLookupFeatureName =
    clientRegistry.resolveLabelLookupFeatureName;
export const getFeatureByName = clientRegistry.getFeatureByName;
export const getFeatureRegistryAliases = clientRegistry.getFeatureRegistryAliases;
