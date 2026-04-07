/**
 * Simple URL cache for file keys.
 */

class R2UrlCache {
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

let globalCache: R2UrlCache | null = null;

export function getGlobalR2Cache(): R2UrlCache {
    if (!globalCache) {
        globalCache = new R2UrlCache();
    }
    return globalCache;
}
