/**
 * Feature Registry（客户端与通用逻辑）
 *
 * 仅打包默认 JSON + 校验，不含 `node:fs`。服务端合并后的列表见 `feature-registry.server.ts`。
 */

import defaultBundleJson from "../../config/features.default.json";
import {
    validateFeatureRegistryBundle,
    type FeatureRegistryBundle,
    type FeatureDefinition,
} from "@/lib/feature-registry-schema";

export type { FeatureDefinition, FeatureRegistryBundle } from "@/lib/feature-registry-schema";

const defaultBundle = validateFeatureRegistryBundle(defaultBundleJson);

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

/** 客户端 / 同步工具：基于默认 JSON（不含 features.local 合并） */
export const getAllFeatures = clientRegistry.getAllFeatures;
export const resolveCanonicalFeatureName =
    clientRegistry.resolveCanonicalFeatureName;
export const resolveLabelLookupFeatureName =
    clientRegistry.resolveLabelLookupFeatureName;
export const getFeatureByName = clientRegistry.getFeatureByName;
export const getFeatureRegistryAliases = clientRegistry.getFeatureRegistryAliases;
