/**
 * useFileAsyncLoader Hook
 *
 * Integrates cache and queue, provides local file async loading hooks.
 */

import { useEffect, useRef, useState } from "react";
import { getGlobalFileQueue, type LoadPriority } from "@/lib/file/loader-queue";
import { getFileUrl } from "@/lib/file/url";
import { getGlobalFileCache } from "@/lib/file/url-cache";

export interface UseFileAsyncLoaderOptions {
    priority?: LoadPriority;
    onProgress?: (loaded: number, total: number) => void;
}

export function useFileAsyncLoader(
    fileKey: string | null | undefined,
    options: UseFileAsyncLoaderOptions = {},
) {
    const { priority = "normal" } = options;
    const [url, setUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const taskIdRef = useRef<string | null>(null);

    const cache = getGlobalFileCache();
    const queue = getGlobalFileQueue();

    useEffect(() => {
        if (!fileKey) {
            setUrl(null);
            setIsLoading(false);
            return;
        }

        const cachedUrl = cache.get(fileKey);
        if (cachedUrl) {
            setUrl(cachedUrl);
            setIsLoading(false);
            return;
        }

        // biome-ignore lint/correctness/useHookAtTopLevel: useFileUrl is a utility function, not a React hook
        const fileUrl = useFileUrl(fileKey);

        if (taskIdRef.current) queue.cancel(taskIdRef.current);

        const taskId = `loader-${fileKey}-${Date.now()}-${Math.random()}`;
        taskIdRef.current = taskId;

        setIsLoading(true);
        setError(null);

        queue.enqueue({
            id: taskId,
            fileKey,
            url: fileUrl,
            priority,
            retryCount: 0,
            maxRetries: 2,
            timestamp: Date.now(),
            onSuccess: (loadedUrl: string) => {
                setUrl(loadedUrl);
                setIsLoading(false);
            },
            onError: (err: Error) => {
                setUrl(fileUrl);
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

    return { url, isLoading, error };
}

export function useFileAsyncLoaderBatch(
    fileKeys: string[],
    options: UseFileAsyncLoaderOptions = {},
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

    const cache = getGlobalFileCache();
    const queue = getGlobalFileQueue();

    useEffect(() => {
        if (fileKeys.length === 0) {
            setUrls(new Map());
            setIsLoading(false);
            return;
        }

        const newUrls = new Map<string, string>();
        const tasksToEnqueue = [];
        let loadedCount = 0;

        for (const fileKey of fileKeys) {
            const cachedUrl = cache.get(fileKey);
            if (cachedUrl) {
                newUrls.set(fileKey, cachedUrl);
                loadedCount += 1;
            } else {
                // biome-ignore lint/correctness/useHookAtTopLevel: useFileUrl is a utility function, not a React hook
                const fileUrl = useFileUrl(fileKey);

                const taskId = `batch-loader-${fileKey}-${Date.now()}-${Math.random()}`;
                taskIdsRef.current.set(fileKey, taskId);

                tasksToEnqueue.push({
                    id: taskId,
                    fileKey,
                    url: fileUrl,
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
                        newUrls.set(fileKey, fileUrl);
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
            setUrls(newUrls);
            setIsLoading(false);
            updateProgress(fileKeys.length, fileKeys.length);
        } else {
            setIsLoading(true);
            setUrls(newUrls);
            updateProgress(loadedCount, fileKeys.length);
            if (tasksToEnqueue.length > 0) queue.enqueueBatch(tasksToEnqueue);
        }

        return () => {
            for (const taskId of taskIdsRef.current.values())
                queue.cancel(taskId);
            taskIdsRef.current.clear();
        };
    }, [fileKeys.length, priority, cache, queue, onProgress]);

    return { urls, isLoading, errors, progress };
}

export function useFileUrl(fileKey: string | null | undefined) {
    const cache = getGlobalFileCache();
    if (fileKey) {
        const cachedUrl = cache.get(fileKey);
        if (cachedUrl) return cachedUrl;
    }

    if (fileKey) {
        const url = getFileUrl(fileKey);
        cache.set(fileKey, url);
        return url;
    }

    return "";
}

export function useFileLoaderStats() {
    const [stats] = useState(() => getGlobalFileQueue().getStats());
    return stats;
}
