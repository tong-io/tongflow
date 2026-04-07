/**
 * Simplified file loader queue for open-source version.
 * Since files are served locally, no complex queuing is needed.
 */

export type LoadPriority = "high" | "normal" | "low";

export interface LoadTask {
    id: string;
    fileKey: string;
    url: string;
    priority: LoadPriority;
    retryCount: number;
    maxRetries: number;
    timestamp: number;
    onSuccess: (url: string) => void;
    onError: (error: Error) => void;
}

class R2LoaderQueue {
    private changeCallback: (() => void) | null = null;

    enqueue(task: LoadTask): void {
        // For local files, immediately resolve with the URL
        task.onSuccess(task.url);
    }

    enqueueBatch(tasks: LoadTask[]): void {
        for (const task of tasks) {
            task.onSuccess(task.url);
        }
    }

    cancel(_taskId: string): void {
        // No-op for local files
    }

    getStats() {
        return {
            pending: 0,
            active: 0,
            completed: 0,
            failed: 0,
        };
    }

    setChangeCallback(callback: () => void): void {
        this.changeCallback = callback;
    }
}

let globalQueue: R2LoaderQueue | null = null;

export function getGlobalR2Queue(): R2LoaderQueue {
    if (!globalQueue) {
        globalQueue = new R2LoaderQueue();
    }
    return globalQueue;
}
