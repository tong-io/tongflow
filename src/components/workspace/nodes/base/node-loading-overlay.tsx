import { Loader2 } from "lucide-react";

interface NodeLoadingOverlayProps {
    loading: boolean;
    elapsedSeconds: number;
}

export function NodeLoadingOverlay({
    loading,
    elapsedSeconds,
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
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                <div className="mt-1 text-lg font-semibold text-gray-700 dark:text-gray-300">
                    {elapsedSeconds}s
                </div>
            </div>
        </>
    );
}
