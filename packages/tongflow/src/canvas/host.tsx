"use client";

/**
 * Canvas host configuration.
 *
 * The canvas talks to a TongFlow-compatible HTTP API (`/api/task/create`,
 * `/api/task/wait` SSE, `/api/upload`, `/api/plugins/registry`, …) and
 * resolves asset `file_key`s to URLs. A host points it at that API through
 * `configureCanvasHost` / `<CanvasProvider>`; by default everything is
 * same-origin, which is what the TongFlow app itself uses.
 *
 * A host can also take over task execution (`taskTransport`) and offer a
 * whole-workflow runner (`workflowRunner`); see docs/edge-runtime.md,
 * "Canvas host transport & workflow runner".
 */

import { type ReactNode, useEffect, useSyncExternalStore } from "react";
import { setCanvasLocale } from "./i18n/client";
import type { CanvasTaskTransport } from "./lib/task/transport";
import type { CanvasWorkflowRunner } from "./lib/workflow/runner";

export interface CanvasHostConfig {
    /**
     * Prefix for every API request (no trailing slash), e.g.
     * `"https://app.tongflow.com"`. Empty string = same origin.
     */
    apiBaseUrl: string;
    /**
     * Resolve a stored asset `file_key` to a fetchable URL. Defaults to
     * `${apiBaseUrl}/api/uploads/<file_key>`.
     */
    resolveAssetUrl?: (fileKey: string) => string;
    /** Custom fetch (auth headers, credentials, …). Defaults to global fetch. */
    fetch?: typeof fetch;
    /**
     * Replaces task create / wait / stop / update-status for single-node
     * runs. Defaults to `httpTaskTransport` (the HTTP API + `EventSource`).
     */
    taskTransport?: CanvasTaskTransport;
    /**
     * Runs a whole workflow. When set, the canvas shows a "Run workflow"
     * toolbar action that delegates to it; absent = no such action.
     */
    workflowRunner?: CanvasWorkflowRunner;
}

const host: CanvasHostConfig = { apiBaseUrl: "" };

// Notified (deferred) after every `configureCanvasHost`, so React consumers
// such as `useCanvasWorkflowRunner` see values configured after mount.
const hostListeners = new Set<() => void>();

/** Replace the host configuration (merges with the current one). */
export function configureCanvasHost(config: Partial<CanvasHostConfig>): void {
    Object.assign(host, config);
    if (hostListeners.size === 0) return;
    // Deferred: `CanvasProvider` configures during render, and listeners
    // must not update other components mid-render.
    queueMicrotask(() => {
        for (const listener of hostListeners) listener();
    });
}

export function getCanvasHost(): Readonly<CanvasHostConfig> {
    return host;
}

function subscribeCanvasHost(listener: () => void): () => void {
    hostListeners.add(listener);
    return () => {
        hostListeners.delete(listener);
    };
}

const getWorkflowRunner = () => host.workflowRunner;

/** The host's workflow runner (reactive); `undefined` when none is configured. */
export function useCanvasWorkflowRunner(): CanvasWorkflowRunner | undefined {
    return useSyncExternalStore(
        subscribeCanvasHost,
        getWorkflowRunner,
        getWorkflowRunner,
    );
}

/** Absolute (or origin-relative) URL for an API path such as `/api/task/create`. */
export function apiUrl(path: string): string {
    return `${host.apiBaseUrl}${path}`;
}

/** The fetch implementation the canvas should use. */
export function hostFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
): Promise<Response> {
    return (host.fetch ?? fetch)(input, init);
}

/** URL for an asset `file_key` (private uploads endpoint by default). */
export function assetUrl(fileKey: string): string {
    // Already absolute: a workflow may reference an asset that does not live
    // behind this app at all, such as the bundled example's results on the
    // public CDN. Prefixing those would produce /api/uploads/https://...
    if (/^https?:\/\//.test(fileKey)) return fileKey;
    return host.resolveAssetUrl
        ? host.resolveAssetUrl(fileKey)
        : `${host.apiBaseUrl}/api/uploads/${fileKey}`;
}

export interface CanvasProviderProps extends Partial<CanvasHostConfig> {
    /** Active UI locale for non-React translations (toasts, thrown errors). */
    locale?: string;
    children?: ReactNode;
}

/**
 * Applies host configuration + locale for the canvas subtree. Message
 * catalogs are NOT provided here — wrap the tree in `use-intl`'s
 * `IntlProvider` (or next-intl's provider) with `canvasMessages[locale]`
 * merged into your messages.
 */
export function CanvasProvider({
    locale,
    children,
    ...config
}: CanvasProviderProps) {
    // Configure synchronously on first render so child effects/fetches see it.
    if (Object.keys(config).length > 0) configureCanvasHost(config);
    if (locale) setCanvasLocale(locale);
    useEffect(() => {
        if (locale) setCanvasLocale(locale);
    }, [locale]);
    return <>{children}</>;
}
