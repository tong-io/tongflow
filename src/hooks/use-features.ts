/**
 * 功能列表管理 Hook
 * 页面加载时请求一次，之后从 store 获取
 */

import { useEffect } from "react";
import { create } from "zustand";
import {
    listFeatures,
    type Feature,
    type FeatureRegistryAliasesPayload,
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

// 请求去重
let fetchPromise: Promise<void> | null = null;

export const useFeaturesStore = create<FeaturesState>((set, get) => ({
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
 * 加载功能列表（只执行一次）
 */
async function loadFeatures(): Promise<void> {
    const state = useFeaturesStore.getState();

    // 已加载或正在加载，直接返回
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
 * 预加载功能列表（放在顶层组件）
 */
export function usePreloadFeatures() {
    useEffect(() => {
        void loadFeatures();
    }, []);
}

/**
 * 获取功能列表
 */
export function useFeatures() {
    const features = useFeaturesStore((s) => s.features);
    const isLoading = useFeaturesStore((s) => s.isLoading);
    const isLoaded = useFeaturesStore((s) => s.isLoaded);
    const error = useFeaturesStore((s) => s.error);
    const getFeatureByName = useFeaturesStore((s) => s.getFeatureByName);

    // 确保已加载
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
 * 获取单个功能
 */
export function useFeature(name: string) {
    const { isLoading, error, getFeatureByName } = useFeatures();

    return {
        feature: getFeatureByName(name),
        isLoading,
        error,
    };
}
