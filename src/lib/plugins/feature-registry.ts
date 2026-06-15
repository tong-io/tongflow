/**
 * Feature Registry (shared wiring)
 *
 * Runtime feature metadata (type / function) is derived on the server from
 * the plugin scanner registry + ABI `nodeSlot` names. This module only builds the
 * generic registry helper; the default bundle is a stable fallback so client
 * bundles that import this file do not need filesystem access.
 */

import {
    type FeatureDefinition,
    type FeatureRegistryBundle,
    validateFeatureRegistryBundle,
} from "@/lib/plugins/feature-registry-schema";
import { TONGFLOW_ABI_NODES } from "@/lib/schema/tongflow-abi";

export type {
    FeatureDefinition,
    FeatureRegistryBundle,
} from "@/lib/plugins/feature-registry-schema";

/** Placeholder until `/api/feature/list` hydrates the client store. */
function deriveFallbackBundleFromAbiSlots(): FeatureRegistryBundle {
    const features: FeatureDefinition[] = TONGFLOW_ABI_NODES.map((n) => ({
        name: n.nodeSlot,
        type: "unregistered",
        function: "unregistered",
    }));
    return validateFeatureRegistryBundle({
        features,
        aliases: { canonical: {}, labelLookup: {} },
    });
}

const defaultBundle = deriveFallbackBundleFromAbiSlots();

function buildMap(
    features: FeatureDefinition[],
): Map<string, FeatureDefinition> {
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

/** Client / sync tools: fallback only; prefer features from `/api/feature/list`. */
export const getAllFeatures = clientRegistry.getAllFeatures;
export const resolveCanonicalFeatureName =
    clientRegistry.resolveCanonicalFeatureName;
export const resolveLabelLookupFeatureName =
    clientRegistry.resolveLabelLookupFeatureName;
export const getFeatureByName = clientRegistry.getFeatureByName;
export const getFeatureRegistryAliases =
    clientRegistry.getFeatureRegistryAliases;
