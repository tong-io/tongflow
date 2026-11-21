"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef } from "react";
import { isBrowserPlugin, logger, type PluginsRegistry } from "tongflow";
import {
    configureCanvasHost,
    httpTaskTransport,
    usePluginsRegistryStore,
} from "tongflow/canvas";
import { loadAppEdgeRuntime } from "@/lib/plugins/edge-runtime";

/**
 * Puts the browser edge runtime behind the canvas while at least one browser
 * plugin (`tongflow-edge-*`) is installed: the canvas then offers "Run
 * workflow" on the TypeScript engine and runs single edge nodes in the
 * browser. Follows the canvas's plugins registry, so installing or removing
 * a browser plugin takes effect without a reload. With none installed the
 * canvas host config is left untouched (every node runs on the server).
 */
export function useEdgeRuntime(): void {
    const t = useTranslations("Plugins");
    const tRef = useRef(t);
    tRef.current = t;
    // The canvas store types the payload loosely; it is the full registry
    // (`/api/plugins/registry`), `runtime` and `localSubdir` included.
    const plugins = usePluginsRegistryStore((s) => s.registry?.plugins) as
        | PluginsRegistry["plugins"]
        | undefined;
    // The executors read `holder.plugins` on every call.
    const holder = useRef<Pick<PluginsRegistry, "plugins">>({ plugins: {} });
    if (plugins) holder.current.plugins = plugins;
    const browserIds = useMemo(
        () =>
            Object.entries(plugins ?? {})
                .filter(([, p]) => isBrowserPlugin(p))
                .map(([id]) => id)
                .sort()
                .join(","),
        [plugins],
    );

    useEffect(() => {
        if (!browserIds) return;
        let alive = true;
        let dispose: (() => void) | undefined;
        loadAppEdgeRuntime({
            registry: holder.current,
            fallbackTransport: httpTaskTransport,
            confirmDownload: async (r) =>
                window.confirm(
                    tRef.current("edgeDownloadConfirm", {
                        slot: r.nodeSlot,
                        label: r.label,
                    }),
                ),
        })
            .then((rt) => {
                if (!rt) return;
                if (!alive) return rt.dispose();
                configureCanvasHost({
                    workflowRunner: rt.runner,
                    taskTransport: rt.taskTransport,
                });
                dispose = () => {
                    configureCanvasHost({
                        workflowRunner: undefined,
                        taskTransport: undefined,
                    });
                    rt.dispose();
                };
            })
            .catch((e: unknown) =>
                logger.warn("[edge] Browser edge runtime unavailable:", e),
            );
        return () => {
            alive = false;
            dispose?.();
        };
    }, [browserIds]);
}
