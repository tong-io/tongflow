import "server-only";

import { buildFeatureRegistry } from "@/lib/feature-registry";
import { loadMergedServerBundle } from "@/lib/load-feature-registry.server";
import { validateFeatureRegistryBundle } from "@/lib/feature-registry-schema";
import { TONGFLOW_ABI_NODES } from "@/lib/tongflow-abi";

const defaultBundle = validateFeatureRegistryBundle({
    features: TONGFLOW_ABI_NODES.map((n) => ({
        name: n.featureName,
        type: n.defaultHandler.type,
        function: n.defaultHandler.function,
        processingTime: n.processingTime ?? 0,
    })),
    aliases: { canonical: {}, labelLookup: {} },
});
const serverRegistry = buildFeatureRegistry(
    loadMergedServerBundle(defaultBundle),
);

/** 服务端：含 features.local.json / FEATURES_CONFIG_PATH 合并 */
export const getAllFeatures = serverRegistry.getAllFeatures;
export const resolveCanonicalFeatureName =
    serverRegistry.resolveCanonicalFeatureName;
export const resolveLabelLookupFeatureName =
    serverRegistry.resolveLabelLookupFeatureName;
export const getFeatureByName = serverRegistry.getFeatureByName;
export const getFeatureRegistryAliases =
    serverRegistry.getFeatureRegistryAliases;
