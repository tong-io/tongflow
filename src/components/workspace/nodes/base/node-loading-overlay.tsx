import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

interface NodeLoadingOverlayProps {
    loading: boolean;
    elapsedSeconds: number;
    progressLabel?: string | null;
}

export function NodeLoadingOverlay({
    loading,
    elapsedSeconds,
    progressLabel,
}: NodeLoadingOverlayProps) {
    if (!loading) return null;

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
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                <div className="mt-1 text-lg font-semibold text-gray-700 dark:text-gray-300">
                    {elapsedSeconds}s
                </div>
            </div>
        </>
    );
}
