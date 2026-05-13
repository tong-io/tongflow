/**
 * Simplified file loader queue for local files.
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

class FileLoaderQueue {
    enqueue(task: LoadTask): void {
        task.onSuccess(task.url);
    }

    enqueueBatch(tasks: LoadTask[]): void {
        for (const task of tasks) task.onSuccess(task.url);
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
}

let globalQueue: FileLoaderQueue | null = null;

export function getGlobalFileQueue(): FileLoaderQueue {
    if (!globalQueue) {
        globalQueue = new FileLoaderQueue();
    }
    return globalQueue;
}
