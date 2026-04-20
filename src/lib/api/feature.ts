/**
 * Feature API 客户端
 * 用于获取功能列表
 */

export interface Feature {
    name: string;
    type: string;
    function: string;
    processingTime: number;
}

export interface FeatureRegistryAliasesPayload {
    canonical: Record<string, string>;
    labelLookup: Record<string, string>;
}

export interface ListFeaturesResponse {
    features: Feature[];
    /** 与服务器合并后的别名；客户端用于解析旧 id / 展示映射 */
    aliases?: FeatureRegistryAliasesPayload;
}

/**
 * 获取功能列表
 */
export async function listFeatures(): Promise<ListFeaturesResponse> {
    const response = await fetch("/api/feature/list");

    if (!response.ok) {
        const error = (await response.json()) as { error?: string };
        throw new Error(error.error || "Failed to list features");
    }

    return await response.json();
}

/**
 * 根据名称获取功能
 */
export async function getFeatureByName(name: string): Promise<Feature | null> {
    const { features, aliases } = await listFeatures();
    const key = aliases?.canonical[name] ?? name;
    return (
        features.find((f) => f.name === key) ??
        features.find((f) => f.name === name) ??
        null
    );
}

