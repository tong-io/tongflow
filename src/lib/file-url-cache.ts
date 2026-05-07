/**
 * Simple URL cache for file keys.
 */

class FileUrlCache {
    private cache = new Map<string, string>();

    get(fileKey: string): string | undefined {
        return this.cache.get(fileKey);
    }

    set(fileKey: string, url: string): void {
        this.cache.set(fileKey, url);
    }

    has(fileKey: string): boolean {
        return this.cache.has(fileKey);
    }

    delete(fileKey: string): void {
        this.cache.delete(fileKey);
    }

    clear(): void {
        this.cache.clear();
    }
}

let globalCache: FileUrlCache | null = null;

export function getGlobalFileCache(): FileUrlCache {
    if (!globalCache) {
        globalCache = new FileUrlCache();
    }
    return globalCache;
}
