import {
    getFeatureByName,
    resolveCanonicalFeatureName,
    resolveLabelLookupFeatureName,
    type FeatureDefinition,
} from "@/lib/feature-registry";

function pickDefinition(feature: string): FeatureDefinition | undefined {
    const canon = resolveCanonicalFeatureName(feature);
    const labelTarget = resolveLabelLookupFeatureName(feature);
    return (
        getFeatureByName(canon) ??
        getFeatureByName(feature) ??
        (labelTarget ? getFeatureByName(labelTarget) : undefined)
    );
}

/**
 * 下拉项文案：只展示注册表中的后端模型名（`function`），不展示内部 feature 名（`name`）。
 * 无注册表时退回传入的 feature id。
 */
export function registryModelOptionLabel(feature: string): string {
    const def = pickDefinition(feature);
    if (!def) return feature;

    return def.function;
}

/** @deprecated 使用 registryModelOptionLabel */
export function modelLabelForFeature(
    _t: (key: string) => string,
    feature: string,
): string {
    return registryModelOptionLabel(feature);
}

export function singleModelSelectOptions(
    feature: string,
    _t?: (key: string) => string,
): { value: string; label: string }[] {
    return [{ value: feature, label: registryModelOptionLabel(feature) }];
}

export function multiModelSelectOptions(
    features: readonly string[],
    _t?: (key: string) => string,
): { value: string; label: string }[] {
    return features.map((f) => ({
        value: f,
        label: registryModelOptionLabel(f),
    }));
}
