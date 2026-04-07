/**
 * useR2AsyncLoader Hook
 *
 * 整合缓存和队列系统，提供简单易用的 R2 文件异步加载 Hook
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { getGlobalR2Cache } from "@/lib/r2-url-cache";
import { getGlobalR2Queue, LoadPriority } from "@/lib/r2-loader-queue";
import { getR2Url } from "@/lib/r2-utils";

export interface UseR2AsyncLoaderOptions {
    priority?: LoadPriority; // 加载优先级
    onProgress?: (loaded: number, total: number) => void; // 进度回调
}

/**
 * 用于单个文件加载
 */
export function useR2AsyncLoader(
    fileKey: string | null | undefined,
    options: UseR2AsyncLoaderOptions = {},
) {
    const { priority = "normal", onProgress } = options;
    const [url, setUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const taskIdRef = useRef<string | null>(null);

    const cache = getGlobalR2Cache();
    const queue = getGlobalR2Queue();

    useEffect(() => {
        if (!fileKey) {
            setUrl(null);
            setIsLoading(false);
            return;
        }

        // 检查缓存
        const cachedUrl = cache.get(fileKey);
        if (cachedUrl) {
            setUrl(cachedUrl);
            setIsLoading(false);
            return;
        }

        // 生成 R2 URL
        const r2Url = useR2Url(fileKey);

        // 如果已在队列中，不重复添加
        if (taskIdRef.current) {
            queue.cancel(taskIdRef.current);
        }

        const taskId = `loader-${fileKey}-${Date.now()}-${Math.random()}`;
        taskIdRef.current = taskId;

        setIsLoading(true);
        setError(null);

        // 添加到加载队列
        queue.enqueue({
            id: taskId,
            fileKey,
            url: r2Url,
            priority,
            retryCount: 0,
            maxRetries: 2,
            timestamp: Date.now(),
            onSuccess: (loadedUrl: string) => {
                setUrl(loadedUrl);
                setIsLoading(false);
            },
            onError: (err: Error) => {
                // 即使失败也返回 URL（让浏览器尝试加载，可能会显示错误图片）
                setUrl(r2Url);
                setError(err);
                setIsLoading(false);
            },
        });

        return () => {
            if (taskIdRef.current) {
                queue.cancel(taskIdRef.current);
                taskIdRef.current = null;
            }
        };
    }, [fileKey, priority, cache, queue]);

    return {
        url,
        isLoading,
        error,
    };
}

/**
 * 用于多个文件批量加载
 */
export function useR2AsyncLoaderBatch(
    fileKeys: string[],
    options: UseR2AsyncLoaderOptions = {},
) {
    const { priority = "normal", onProgress } = options;
    const [urls, setUrls] = useState<Map<string, string>>(new Map());
    const [isLoading, setIsLoading] = useState(false);
    const [errors, setErrors] = useState<Map<string, Error>>(new Map());
    const [progress, setProgress] = useState({
        loaded: 0,
        total: fileKeys.length,
    });
    const taskIdsRef = useRef<Map<string, string>>(new Map());

    const cache = getGlobalR2Cache();
    const queue = getGlobalR2Queue();

    useEffect(() => {
        if (fileKeys.length === 0) {
            setUrls(new Map());
            setIsLoading(false);
            return;
        }

        const newUrls = new Map<string, string>();
        const tasksToEnqueue = [];
        let loadedCount = 0;

        // 检查缓存和生成任务
        for (const fileKey of fileKeys) {
            const cachedUrl = cache.get(fileKey);
            if (cachedUrl) {
                newUrls.set(fileKey, cachedUrl);
                loadedCount += 1;
            } else {
                const r2Url = useR2Url(fileKey);

                const taskId = `batch-loader-${fileKey}-${Date.now()}-${Math.random()}`;
                taskIdsRef.current.set(fileKey, taskId);

                tasksToEnqueue.push({
                    id: taskId,
                    fileKey,
                    url: r2Url,
                    priority,
                    retryCount: 0,
                    maxRetries: 2,
                    timestamp: Date.now(),
                    onSuccess: (loadedUrl: string) => {
                        newUrls.set(fileKey, loadedUrl);
                        setUrls(new Map(newUrls));
                        updateProgress(newUrls.size, fileKeys.length);
                    },
                    onError: (err: Error) => {
                        // 即使失败也保存 URL
                        newUrls.set(fileKey, r2Url);
                        setUrls(new Map(newUrls));
                        setErrors((prev) => new Map(prev).set(fileKey, err));
                        updateProgress(newUrls.size, fileKeys.length);
                    },
                });
            }
        }

        const updateProgress = (loaded: number, total: number) => {
            setProgress({ loaded, total });
            onProgress?.(loaded, total);
        };

        if (newUrls.size === fileKeys.length) {
            // 全部缓存命中
            setUrls(newUrls);
            setIsLoading(false);
            updateProgress(fileKeys.length, fileKeys.length);
        } else {
            setIsLoading(true);
            setUrls(newUrls);
            updateProgress(loadedCount, fileKeys.length);

            // 批量添加任务
            if (tasksToEnqueue.length > 0) {
                queue.enqueueBatch(tasksToEnqueue);
            }
        }

        return () => {
            // 清理任务
            for (const taskId of taskIdsRef.current.values()) {
                queue.cancel(taskId);
            }
            taskIdsRef.current.clear();
        };
    }, [fileKeys.length, priority, cache, queue, onProgress]);

    return {
        urls,
        isLoading,
        errors,
        progress,
    };
}

/**
 * 直接获取 R2 URL（带缓存）
 */
export function useR2Url(fileKey: string | null | undefined) {
    const cache = getGlobalR2Cache();

    // 检查缓存
    if (fileKey) {
        const cachedUrl = cache.get(fileKey);
        if (cachedUrl) {
            return cachedUrl;
        }
    }

    // 生成并缓存
    if (fileKey) {
        const url = getR2Url(fileKey);
        cache.set(fileKey, url);
        return url;
    }

    return "";
}

/**
 * 获取加载队列统计信息
 */
export function useR2LoaderStats() {
    const [stats, setStats] = useState(() => getGlobalR2Queue().getStats());
    const queue = getGlobalR2Queue();

    useEffect(() => {
        const updateStats = () => {
            setStats(queue.getStats());
        };

        queue.setChangeCallback(updateStats);

        return () => {
            // 无法移除单个回调，但这不是主要问题
        };
    }, [queue]);

    return stats;
}
