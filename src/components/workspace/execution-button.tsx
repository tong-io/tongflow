"use client";

import { Play, Square } from "lucide-react";
import { cn } from "@/lib/utils";

interface ExecutionButtonProps {
    isRunning: boolean;
    onExecute: () => void;
    onCancel?: () => void;
}

/**
 * Play / "running" button shown in execute mode.
 *
 * When idle, renders a play affordance. When a workflow is running, renders a
 * Siri-style multicolor breathing ball; clicking it cancels the execution
 * (a stop icon fades in on hover to make this discoverable).
 */
export function ExecutionButton({
    isRunning,
    onExecute,
    onCancel,
}: ExecutionButtonProps) {
    return (
        <div className="flex items-center justify-center">
            <div
                className={cn(
                    "relative flex items-center justify-center",
                    "w-14 h-14 rounded-full",
                )}
            >
                {isRunning && (
                    <div
                        className="absolute inset-0 rounded-full"
                        style={{
                            background:
                                "conic-gradient(from 0deg, transparent, transparent 60%, #10b981 80%, #10b981 100%)",
                            animation: "spin 1.5s linear infinite",
                        }}
                    />
                )}

                <div
                    className={cn(
                        "relative flex items-center justify-center",
                        "border border-gray-200/50 dark:border-gray-500/60",
                        "backdrop-blur-md bg-white/80 dark:bg-gray-800/90",
                        "w-10 h-10 rounded-full",
                    )}
                >
                    {isRunning ? (
                        <button
                            type="button"
                            onClick={onCancel}
                            className="group relative w-full h-full rounded-full flex items-center justify-center overflow-hidden bg-white/20"
                            title="Click to cancel"
                        >
                            <div
                                className="absolute inset-[-50%] blur-xl opacity-70 animate-[spin_3s_linear_infinite]"
                                style={{
                                    background:
                                        "conic-gradient(from 0deg, #22d3ee, #c084fc, #f472b6, #fde047, #4ade80, #22d3ee)",
                                }}
                            />
                            <div
                                className="absolute inset-[-50%] blur-lg opacity-50 mix-blend-overlay animate-[spin_4s_linear_infinite_reverse]"
                                style={{
                                    background:
                                        "conic-gradient(from 180deg, #22d3ee, #c084fc, #f472b6, #fde047, #4ade80, #22d3ee)",
                                }}
                            />
                            <div className="absolute inset-1 bg-white/40 rounded-full blur-md animate-pulse" />
                            <Square
                                className={cn(
                                    "relative w-4 h-4 text-red-500 fill-red-500",
                                    "opacity-0 group-hover:opacity-100 transition-opacity",
                                )}
                            />
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={onExecute}
                            className="w-full h-full rounded-full flex flex-col items-center justify-center gap-1 hover:bg-emerald-500/20 transition-colors"
                        >
                            <Play className="w-6 h-6 text-emerald-500 fill-emerald-500" />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
