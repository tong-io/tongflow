"use client";

import { CheckCircle2, Loader2, Square, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import {
    NodeStatus,
    TaskStatus,
    WorkflowStatus,
} from "@/constants/task-status";
import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";
import type { SSEMessage, SSENodeInfo } from "@/types/sse";

export type { SSEMessage } from "@/types/sse";

type NodeInfo = SSENodeInfo;

interface NodeProgress {
    nodeId: string;
    label: string; // Node display name
    feature: string;
    level: number;
    status: "running" | "completed" | "failed";
    duration?: number;
}

interface TaskProgressToastProps {
    className?: string;
}

export function TaskProgressToast({ className }: TaskProgressToastProps) {
    const t = useTranslations("Workspace.toast");
    const [isVisible, setIsVisible] = useState(false);
    const [isAnimatingOut, setIsAnimatingOut] = useState(false);
    const [taskId, setTaskId] = useState<string | null>(null);
    const [totalNodes, setTotalNodes] = useState(0);
    const [completedNodes, setCompletedNodes] = useState(0);
    const [currentNode, setCurrentNode] = useState<NodeProgress | null>(null);
    const [nodeHistory, setNodeHistory] = useState<NodeProgress[]>([]);
    const [finalStatus, setFinalStatus] = useState<
        "success" | "failed" | "cancelled" | null
    >(null);
    const [totalDuration, setTotalDuration] = useState<number | null>(null);
    const [statusMessage, setStatusMessage] = useState<string | null>(null); // Progress message for regular (non-workflow) tasks
    const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Handle hide animation
    const hideWithAnimation = (delay: number) => {
        hideTimeoutRef.current = setTimeout(() => {
            setIsAnimatingOut(true);
            setTimeout(() => {
                setIsVisible(false);
                setIsAnimatingOut(false);
            }, 300); // Animation duration
        }, delay);
    };

    // Listen for global SSE message events
    useEffect(() => {
        const handleSSEMessage = (event: CustomEvent<SSEMessage>) => {
            const message = event.detail;

            // Clear any pending hide timer
            if (hideTimeoutRef.current) {
                clearTimeout(hideTimeoutRef.current);
                hideTimeoutRef.current = null;
            }

            logger.debug("[TaskProgressToast] Received message:", message);

            switch (message.status) {
                case "SSE_CONNECTED":
                    // Show when SSE connection is established
                    setIsAnimatingOut(false);
                    setIsVisible(true);
                    setTaskId(message.id);
                    setTotalNodes(0);
                    setCompletedNodes(0);
                    setCurrentNode(null);
                    setNodeHistory([]);
                    setFinalStatus(null);
                    setTotalDuration(null);
                    setStatusMessage(null);
                    break;

                case WorkflowStatus.WORKFLOW_STARTED:
                    setIsAnimatingOut(false);
                    setIsVisible(true);
                    setTaskId(message.id);
                    setTotalNodes(message.data?.totalNodes || 0);
                    setCompletedNodes(0);
                    setCurrentNode(null);
                    setNodeHistory([]);
                    setFinalStatus(null);
                    setTotalDuration(null);
                    setStatusMessage(null);
                    break;

                case TaskStatus.PENDING:
                case TaskStatus.RUNNING:
                    // Regular task status
                    if (!isVisible) {
                        setIsAnimatingOut(false);
                        setIsVisible(true);
                        setTaskId(message.id);
                        setFinalStatus(null);
                    }
                    // Update the progress message
                    if (message.data?.message) {
                        setStatusMessage(message.data.message);
                    }
                    break;

                case NodeStatus.NODE_STARTED:
                case NodeStatus.NODE_RUNNING:
                    if (message.nodeId && message.data) {
                        const node: NodeProgress = {
                            nodeId: message.nodeId,
                            label:
                                message.data.label ||
                                message.data.feature ||
                                "unknown",
                            feature: message.data.feature || "unknown",
                            level: message.data.level || 0,
                            status: "running",
                        };
                        setCurrentNode(node);
                        setStatusMessage(null); // Clear regular message in workflow mode
                    }
                    break;

                case NodeStatus.NODE_COMPLETED:
                    setCurrentNode((prev) => {
                        if (prev && message.nodeId === prev.nodeId) {
                            const completedNode: NodeProgress = {
                                ...prev,
                                status: "completed",
                                duration: message.data?.duration,
                            };
                            setNodeHistory((history) => {
                                // Check for an existing entry to avoid duplicates
                                if (
                                    history.some(
                                        (n) =>
                                            n.nodeId === completedNode.nodeId,
                                    )
                                ) {
                                    return history;
                                }
                                return [...history, completedNode];
                            });
                            setCompletedNodes((count) => count + 1);
                            return null;
                        }
                        return prev;
                    });
                    break;

                case NodeStatus.NODE_FAILED:
                    setCurrentNode((prev) => {
                        if (prev && message.nodeId === prev.nodeId) {
                            const failedNode: NodeProgress = {
                                ...prev,
                                status: "failed",
                            };
                            setNodeHistory((history) => {
                                // Check for an existing entry to avoid duplicates
                                if (
                                    history.some(
                                        (n) => n.nodeId === failedNode.nodeId,
                                    )
                                ) {
                                    return history;
                                }
                                return [...history, failedNode];
                            });
                            return null;
                        }
                        return prev;
                    });
                    break;

                case WorkflowStatus.WORKFLOW_COMPLETED:
                case TaskStatus.COMPLETED:
                    setFinalStatus("success");
                    setTotalDuration(message.data?.totalDuration || null);
                    setCurrentNode(null);
                    setStatusMessage(null);
                    hideWithAnimation(3000);
                    break;

                case WorkflowStatus.WORKFLOW_CANCELLED:
                case TaskStatus.CANCELLED:
                    setFinalStatus("cancelled");
                    setCurrentNode(null);
                    setStatusMessage(message.data?.message || t("cancelled"));
                    hideWithAnimation(3000);
                    break;

                case WorkflowStatus.WORKFLOW_FAILED:
                case TaskStatus.FAILED:
                    setFinalStatus("failed");
                    setCurrentNode(null);
                    setStatusMessage(
                        message.data?.message || message.data?.error || null,
                    );
                    hideWithAnimation(5000);
                    break;
            }
        };

        window.addEventListener(
            "sse-task-message",
            handleSSEMessage as EventListener,
        );

        return () => {
            window.removeEventListener(
                "sse-task-message",
                handleSSEMessage as EventListener,
            );
            if (hideTimeoutRef.current) {
                clearTimeout(hideTimeoutRef.current);
            }
        };
    }, []);

    // Format duration
    const formatDuration = (ms: number) => {
        if (ms < 1000) return `${ms}ms`;
        return `${(ms / 1000).toFixed(1)}s`;
    };

    if (!isVisible) return null;

    return (
        <div
            className={cn(
                "fixed top-20 right-4 z-50 w-72 bg-background/95 backdrop-blur-sm border rounded-lg shadow-lg overflow-hidden transition-all duration-300 ease-out",
                isAnimatingOut
                    ? "translate-x-80 opacity-0"
                    : "translate-x-0 opacity-100",
                className,
            )}
            style={{
                animation: !isAnimatingOut
                    ? "slideInFromRight 0.3s ease-out"
                    : undefined,
            }}
        >
            <style jsx>{`
        @keyframes slideInFromRight {
          from {
            transform: translateX(320px);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>

            {/* Header */}
            <div className="px-3 py-2 border-b bg-muted/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {finalStatus === null ? (
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    ) : finalStatus === "success" ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : finalStatus === "cancelled" ? (
                        <XCircle className="h-4 w-4 text-yellow-500" />
                    ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                    )}
                    <span className="text-sm font-medium">
                        {finalStatus === null
                            ? t("executing")
                            : finalStatus === "success"
                              ? t("completed")
                              : finalStatus === "cancelled"
                                ? t("cancelled")
                                : t("failed")}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    {totalNodes > 0 && (
                        <span className="text-xs text-muted-foreground">
                            {completedNodes}/{totalNodes} {t("nodes")}
                        </span>
                    )}
                    {/* Cancel button - only shown while running */}
                    {finalStatus === null &&
                        statusMessage !== t("cancelling") && (
                            <button
                                onClick={() => {
                                    // Dispatch cancel event
                                    if (typeof window !== "undefined") {
                                        window.dispatchEvent(
                                            new CustomEvent(
                                                "task-cancel-request",
                                                {
                                                    detail: { taskId },
                                                },
                                            ),
                                        );
                                    }
                                }}
                                className="p-1 rounded hover:bg-red-500/20 transition-colors"
                                title={t("cancelTask")}
                            >
                                <Square className="h-3.5 w-3.5 text-red-500 fill-red-500" />
                            </button>
                        )}
                </div>
            </div>

            {/* Progress bar */}
            {totalNodes > 0 && (
                <div className="h-1 bg-muted">
                    <div
                        className={cn(
                            "h-full transition-all duration-300",
                            finalStatus === "failed"
                                ? "bg-red-500"
                                : finalStatus === "cancelled"
                                  ? "bg-yellow-500"
                                  : "bg-primary",
                        )}
                        style={{
                            width: `${(completedNodes / totalNodes) * 100}%`,
                        }}
                    />
                </div>
            )}

            {/* Content area */}
            <div className="p-3 max-h-48 overflow-y-auto">
                {/* Progress message for regular tasks (non-workflow mode) or terminal status message */}
                {statusMessage && !currentNode && totalNodes === 0 && (
                    <div
                        className={cn(
                            "flex items-center gap-2 p-2 rounded-md mb-2",
                            finalStatus === "cancelled" ||
                                statusMessage === t("cancelling")
                                ? "bg-yellow-500/10 border border-yellow-500/20"
                                : finalStatus === "failed"
                                  ? "bg-red-500/10 border border-red-500/20"
                                  : "bg-primary/10 border border-primary/20",
                        )}
                    >
                        {finalStatus === null &&
                        statusMessage === t("cancelling") ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-yellow-500 flex-shrink-0" />
                        ) : finalStatus === null ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary flex-shrink-0" />
                        ) : finalStatus === "cancelled" ? (
                            <XCircle className="h-3.5 w-3.5 text-yellow-500 flex-shrink-0" />
                        ) : finalStatus === "failed" ? (
                            <XCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
                        ) : (
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium truncate">
                                {statusMessage}
                            </div>
                        </div>
                    </div>
                )}

                {/* Currently executing node (workflow mode) */}
                {currentNode && (
                    <div className="flex items-center gap-2 p-2 rounded-md bg-primary/10 border border-primary/20 mb-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium truncate">
                                {currentNode.label}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                                {t("level", { level: currentNode.level })}
                            </div>
                        </div>
                    </div>
                )}

                {/* Completed node list */}
                {nodeHistory.length > 0 && (
                    <div className="space-y-1.5">
                        {nodeHistory.slice(-3).map((node) => (
                            <div
                                key={node.nodeId}
                                className={cn(
                                    "flex items-center gap-2 p-1.5 rounded text-xs",
                                    (node.status as string) === "COMPLETED"
                                        ? "text-muted-foreground"
                                        : "text-red-500",
                                )}
                            >
                                {(node.status as string) === "COMPLETED" ? (
                                    <CheckCircle2 className="h-3 w-3 text-green-500 flex-shrink-0" />
                                ) : (
                                    <XCircle className="h-3 w-3 text-red-500 flex-shrink-0" />
                                )}
                                <span className="truncate flex-1">
                                    {node.label}
                                </span>
                                {node.duration && (
                                    <span className="text-[10px] text-muted-foreground flex-shrink-0">
                                        {formatDuration(node.duration)}
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* Total duration */}
                {finalStatus === "success" && totalDuration && (
                    <div className="mt-2 pt-2 border-t text-xs text-muted-foreground text-center">
                        {t("totalDuration")}:{" "}
                        {formatDuration(totalDuration * 1000)}
                    </div>
                )}
            </div>
        </div>
    );
}

// Helper function to emit SSE messages (called by use-task.ts)
export function emitSSETaskMessage(message: SSEMessage) {
    if (typeof window !== "undefined") {
        logger.debug("[emitSSETaskMessage] Emitting:", message);
        const event = new CustomEvent("sse-task-message", { detail: message });
        window.dispatchEvent(event);
    }
}

// Called when the SSE connection is established
export function emitSSEConnected(taskId: string) {
    emitSSETaskMessage({
        id: taskId,
        status: "SSE_CONNECTED",
        nodeId: null,
    });
}
