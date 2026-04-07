"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2, CheckCircle2, XCircle, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    TaskStatus,
    WorkflowStatus,
    NodeStatus,
} from "@/constants/task-status";
import { useTranslations } from "next-intl";

interface NodeInfo {
    id: string;
    label: string;
    feature: string;
}

interface SSEMessage {
    id: string;
    status: string; // 使用 string 以兼容所有状态
    nodeId: string | null;
    data?: {
        // 工作流相关
        totalNodes?: number;
        levels?: number;
        nodes?: NodeInfo[]; // WORKFLOW_STARTED 时包含所有节点信息
        level?: number;
        feature?: string;
        label?: string; // 节点的显示名称
        output?: Record<string, unknown>;
        duration?: number;
        totalDuration?: number;
        // 普通任务相关
        message?: string; // 任务进度消息
        code?: number; // 状态码
        error?: string;
        status?: string;
        file_key?: string;
    };
}

interface NodeProgress {
    nodeId: string;
    label: string; // 节点显示名称
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
    const [statusMessage, setStatusMessage] = useState<string | null>(null); // 普通任务的进度消息
    const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // 隐藏动画处理
    const hideWithAnimation = (delay: number) => {
        hideTimeoutRef.current = setTimeout(() => {
            setIsAnimatingOut(true);
            setTimeout(() => {
                setIsVisible(false);
                setIsAnimatingOut(false);
            }, 300); // 动画持续时间
        }, delay);
    };

    // 监听全局 SSE 消息事件
    useEffect(() => {
        const handleSSEMessage = (event: CustomEvent<SSEMessage>) => {
            const message = event.detail;

            // 清除之前的隐藏定时器
            if (hideTimeoutRef.current) {
                clearTimeout(hideTimeoutRef.current);
                hideTimeoutRef.current = null;
            }

            console.log("[TaskProgressToast] Received message:", message);

            switch (message.status) {
                case "SSE_CONNECTED":
                    // SSE 连接建立时显示
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
                    // 普通任务状态
                    if (!isVisible) {
                        setIsAnimatingOut(false);
                        setIsVisible(true);
                        setTaskId(message.id);
                        setFinalStatus(null);
                    }
                    // 更新进度消息
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
                        setStatusMessage(null); // 工作流模式清除普通消息
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
                                // 检查是否已存在该节点，避免重复添加
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
                                // 检查是否已存在该节点，避免重复添加
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
                    setStatusMessage(message.data?.message || "已取消");
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

    // 格式化时长
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

            {/* 头部 */}
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
                    {/* 取消按钮 - 只在运行中显示 */}
                    {finalStatus === null &&
                        !statusMessage?.includes("取消中") && (
                            <button
                                onClick={() => {
                                    // 触发取消事件
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

            {/* 进度条 */}
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

            {/* 内容区域 */}
            <div className="p-3 max-h-48 overflow-y-auto">
                {/* 普通任务的进度消息（非工作流模式）或终态消息 */}
                {statusMessage && !currentNode && totalNodes === 0 && (
                    <div
                        className={cn(
                            "flex items-center gap-2 p-2 rounded-md mb-2",
                            finalStatus === "cancelled" ||
                                statusMessage.includes("取消中")
                                ? "bg-yellow-500/10 border border-yellow-500/20"
                                : finalStatus === "failed"
                                  ? "bg-red-500/10 border border-red-500/20"
                                  : "bg-primary/10 border border-primary/20",
                        )}
                    >
                        {finalStatus === null &&
                        statusMessage.includes("取消中") ? (
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

                {/* 当前执行的节点（工作流模式） */}
                {currentNode && (
                    <div className="flex items-center gap-2 p-2 rounded-md bg-primary/10 border border-primary/20 mb-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium truncate">
                                {currentNode.label}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                                Level {currentNode.level}
                            </div>
                        </div>
                    </div>
                )}

                {/* 已完成的节点列表 */}
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

                {/* 总耗时 */}
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

// 触发 SSE 消息的辅助函数（供 use-task.ts 调用）
export function emitSSETaskMessage(message: SSEMessage) {
    if (typeof window !== "undefined") {
        console.log("[emitSSETaskMessage] Emitting:", message);
        const event = new CustomEvent("sse-task-message", { detail: message });
        window.dispatchEvent(event);
    }
}

// SSE 连接建立时调用
export function emitSSEConnected(taskId: string) {
    emitSSETaskMessage({
        id: taskId,
        status: "SSE_CONNECTED",
        nodeId: null,
    });
}
