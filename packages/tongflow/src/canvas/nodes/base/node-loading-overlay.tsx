import { Download, Loader2, Square } from "lucide-react";
import { useTranslations } from "use-intl";

import type { NodeRunProgress } from "../../hooks/use-task";
import { cn } from "../../lib/utils";

interface NodeLoadingOverlayProps {
    loading: boolean;
    elapsedSeconds: number;
    progressLabel?: string | null;
    /** Completed fraction in [0, 1] (workflow runner); null = indeterminate. */
    progressFraction?: number | null;
    /** Model download in progress (workflow runner). */
    download?: NodeRunProgress["download"] | null;
    /** When set, hovering the spinner reveals a stop button that cancels the run. */
    onCancel?: () => void;
}

const MB = 1024 * 1024;

/** Bytes → MB for display: one decimal below 10 MB, whole numbers above. */
export function formatMegabytes(bytes: number): string {
    const mb = Math.max(0, bytes) / MB;
    return mb < 10 ? mb.toFixed(1) : String(Math.round(mb));
}

function clampFraction(value: number): number {
    return Math.min(1, Math.max(0, value));
}

function ProgressBar({
    fraction,
    className,
}: {
    fraction: number | null;
    className: string;
}) {
    return (
        <div className="mt-2 h-1.5 w-3/4 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div
                className={cn(
                    "h-full rounded-full transition-[width] duration-300",
                    fraction === null && "w-1/3 animate-pulse",
                    className,
                )}
                style={
                    fraction === null
                        ? undefined
                        : { width: `${clampFraction(fraction) * 100}%` }
                }
            />
        </div>
    );
}

export function NodeLoadingOverlay({
    loading,
    elapsedSeconds,
    progressLabel,
    progressFraction = null,
    download = null,
    onCancel,
}: NodeLoadingOverlayProps) {
    const t = useTranslations("Workspace.nodes.base");
    if (!loading) return null;

    if (download) {
        const hasTotal = download.total !== undefined && download.total > 0;
        const text = hasTotal
            ? t("downloadingModel", {
                  loaded: formatMegabytes(download.loaded),
                  total: formatMegabytes(download.total as number),
              })
            : t("downloadingModelNoTotal", {
                  loaded: formatMegabytes(download.loaded),
              });
        return (
            <div
                className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-emerald-400 bg-white/85 dark:border-emerald-500 dark:bg-gray-800/85"
                data-testid="node-download-overlay"
            >
                <Download className="h-7 w-7 animate-bounce text-emerald-500" />
                <div className="mt-2 text-sm font-semibold text-gray-700 tabular-nums dark:text-gray-200">
                    {text}
                </div>
                {download.label && (
                    <div
                        className="mt-0.5 max-w-[80%] truncate text-xs text-gray-500 dark:text-gray-400"
                        title={download.label}
                    >
                        {download.label}
                    </div>
                )}
                <ProgressBar
                    fraction={
                        hasTotal
                            ? download.loaded / (download.total as number)
                            : null
                    }
                    className="bg-emerald-500"
                />
            </div>
        );
    }

    return (
        <>
            {/* Rotating border effect */}
            <div
                className="pointer-events-none absolute -inset-[1px] z-50 rounded-[inherit]"
                style={{
                    padding: "3px",
                    background:
                        "conic-gradient(from var(--angle, 0deg), transparent 0%, transparent 75%, #ef4444 78%, #f97316 82%, #eab308 86%, #22c55e 90%, #3b82f6 94%, #8b5cf6 98%, transparent 100%)",
                    mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                    WebkitMask:
                        "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                    WebkitMaskComposite: "xor",
                    maskComposite: "exclude",
                    animation: "rotate-border 4s linear infinite",
                }}
            />

            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-lg bg-white/80 dark:bg-gray-800/80 group/loading">
                {progressLabel && (
                    <div
                        className={cn(
                            "mb-2 max-w-[80%] truncate px-2 text-center text-xs",
                            "bg-clip-text text-transparent",
                            "animate-[shimmer_2.4s_linear_infinite]",
                        )}
                        style={{
                            backgroundImage:
                                "linear-gradient(90deg, rgb(107 114 128) 0%, rgb(107 114 128) 45%, rgb(229 231 235) 50%, rgb(107 114 128) 55%, rgb(107 114 128) 100%)",
                            backgroundSize: "200% 100%",
                        }}
                        title={progressLabel}
                    >
                        {progressLabel}
                    </div>
                )}
                {onCancel ? (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onCancel();
                        }}
                        title={t("cancelExecution")}
                        aria-label={t("cancelExecution")}
                        className="nodrag group/cancel relative flex h-12 w-12 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-red-500/10 dark:hover:bg-red-500/15"
                    >
                        <Loader2 className="h-8 w-8 animate-spin text-blue-500 transition-opacity duration-150 group-hover/cancel:opacity-0" />
                        <Square className="absolute h-4 w-4 fill-red-500 text-red-500 opacity-0 transition-opacity duration-150 group-hover/cancel:opacity-100" />
                    </button>
                ) : (
                    <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                )}
                <div className="mt-1 text-lg font-semibold text-gray-700 dark:text-gray-300">
                    {elapsedSeconds}s
                </div>
                {progressFraction !== null && (
                    <>
                        <ProgressBar
                            fraction={progressFraction}
                            className="bg-blue-500"
                        />
                        <div className="mt-1 text-xs text-gray-500 tabular-nums dark:text-gray-400">
                            {Math.round(clampFraction(progressFraction) * 100)}%
                        </div>
                    </>
                )}
            </div>
        </>
    );
}
