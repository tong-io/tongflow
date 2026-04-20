import "server-only";

import defaultBundleJson from "../../config/features.default.json";
import { buildFeatureRegistry } from "@/lib/feature-registry";
import { validateFeatureRegistryBundle } from "@/lib/feature-registry-schema";
import { loadMergedServerBundle } from "@/lib/load-feature-registry.server";

const defaultBundle = validateFeatureRegistryBundle(defaultBundleJson);
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
