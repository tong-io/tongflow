/**
 * Feature API 客户端
 * 用于获取功能列表
 */

export interface Feature {
    name: string;
    type: string;
    function: string;
    price: number;
    isFree: boolean;
    minTier: string;
    processingTime: number;
}

export interface ListFeaturesResponse {
    features: Feature[];
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
    const { features } = await listFeatures();
    return features.find((f) => f.name === name) || null;
}

/**
 * 获取免费功能列表
 */
export async function listFreeFeatures(): Promise<Feature[]> {
    const { features } = await listFeatures();
    return features.filter((f) => f.isFree);
}

/**
 * 获取付费功能列表
 */
export async function listPaidFeatures(): Promise<Feature[]> {
    const { features } = await listFeatures();
    return features.filter((f) => !f.isFree);
}
