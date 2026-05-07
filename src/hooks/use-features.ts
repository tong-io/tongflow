/**
 * Feature list management hook
 * Request once on page load, then read from the store
 */

import { useEffect } from "react";
import { create } from "zustand";
import {
    type Feature,
    type FeatureRegistryAliasesPayload,
    listFeatures,
} from "@/lib/api/feature";

// -------------------- Zustand Store --------------------

const emptyAliases: FeatureRegistryAliasesPayload = {
    canonical: {},
    labelLookup: {},
};

interface FeaturesState {
    features: Feature[];
    aliases: FeatureRegistryAliasesPayload;
    isLoaded: boolean;
    isLoading: boolean;
    error: Error | null;
    getFeatureByName: (name: string) => Feature | undefined;
}

// Request deduplication
let fetchPromise: Promise<void> | null = null;

export const useFeaturesStore = create<FeaturesState>((_set, get) => ({
    features: [],
    aliases: emptyAliases,
    isLoaded: false,
    isLoading: false,
    error: null,
    getFeatureByName: (name) => {
        const { canonical } = get().aliases;
        const key = canonical[name] ?? name;
        return (
            get().features.find((f) => f.name === key) ??
            get().features.find((f) => f.name === name)
        );
    },
}));

/**
 * Load the feature list (only once)
 */
async function loadFeatures(): Promise<void> {
    const state = useFeaturesStore.getState();

    // Already loaded or loading; return directly
    if (state.isLoaded || fetchPromise) {
        return fetchPromise ?? Promise.resolve();
    }

    useFeaturesStore.setState({ isLoading: true });

    fetchPromise = (async () => {
        try {
            const { features, aliases } = await listFeatures();
            useFeaturesStore.setState({
                features,
                aliases: aliases ?? emptyAliases,
                isLoaded: true,
                isLoading: false,
                error: null,
            });
        } catch (err) {
            useFeaturesStore.setState({
                isLoading: false,
                error:
                    err instanceof Error
                        ? err
                        : new Error("Failed to fetch features"),
            });
        } finally {
            fetchPromise = null;
        }
    })();

    return fetchPromise;
}

// -------------------- Hooks --------------------

/**
 * Preload the feature list (place in a top-level component)
 */
export function usePreloadFeatures() {
    useEffect(() => {
        void loadFeatures();
    }, []);
}

/**
 * Get the feature list
 */
export function useFeatures() {
    const features = useFeaturesStore((s) => s.features);
    const isLoading = useFeaturesStore((s) => s.isLoading);
    const isLoaded = useFeaturesStore((s) => s.isLoaded);
    const error = useFeaturesStore((s) => s.error);
    const getFeatureByName = useFeaturesStore((s) => s.getFeatureByName);

    // Ensure it is loaded
    useEffect(() => {
        void loadFeatures();
    }, []);

    return {
        features,
        isLoading,
        isLoaded,
        error,
        getFeatureByName,
    };
}

/**
 * Get a single feature
 */
export function useFeature(name: string) {
    const { isLoading, error, getFeatureByName } = useFeatures();

    return {
        feature: getFeatureByName(name),
        isLoading,
        error,
    };
}
