import { apiGet } from "./client";

export interface Feature {
    name: string;
    type: string;
    function: string;
}

export interface FeatureRegistryAliasesPayload {
    canonical: Record<string, string>;
    labelLookup: Record<string, string>;
}

export interface ListFeaturesResponse {
    features: Feature[];
    /** Aliases merged from the server; clients use them to resolve old ids / display mappings */
    aliases?: FeatureRegistryAliasesPayload;
}

export async function listFeatures(): Promise<ListFeaturesResponse> {
    return apiGet<ListFeaturesResponse>("/api/feature/list");
}

/**
 * Get a feature by name
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
