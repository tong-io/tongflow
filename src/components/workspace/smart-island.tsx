"use client";

/**
 * Smart Island 组件
 * 底部智能工具栏，根据选中节点动态显示可用操作
 * 去除所有动画效果（符合 tongflow 规范）
 */

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useReactFlow } from "@xyflow/react";
import type { FlowState, PossibleNode } from "@/hooks/use-flow";
import { useFlow } from "@/hooks/use-flow";
import { useShallow } from "zustand/react/shallow";
import { getNodeExecutionConfig } from "@/utils/node-execution-config";
import { useFeaturesStore } from "@/hooks/use-features";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { getTaskStopUrl, getTaskWaitUrl } from "@/lib/task-api-url";
import {
    Play,
    Square,
    Loader2,
    Type,
    Image,
    Music,
    Video,
    Box,
    Link,
    FileText,
} from "lucide-react";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveWorkflow } from "@/lib/api/workspace";
import { exportWorkflow } from "@/utils/workflow-exporter";
import { saveFromTask } from "@/lib/api/material";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import { useTaskStore } from "@/hooks/use-task";
import {
    WorkflowParser,
    WorkflowExecutor,
    type NodeExecutionInfo,
} from "@/utils/workflow-parser";
import {
    TaskStatus,
    WorkflowStatus,
    NodeStatus,
    isTerminalStatus,
} from "@/constants/task-status";
import {
    emitSSETaskMessage,
    emitSSEConnected,
} from "@/components/workspace/task-progress-toast";

const selector = (state: FlowState) => ({
    nodes: state.nodes,
    edges: state.edges,
    comboMode: state.comboMode,
    comboSelectedIds: state.comboSelectedIds,
    addNode: state.addNode,
    selectedNodes: state.selectedNodes,
    expands: state.expands,
    compose: state.compose,
    getCompute: state.getCompute,
    updates: state.updates,
    workflowId: state.workflowId,
    workflowName: state.workflowName,
    workflowDescription: state.workflowDescription,
    setWorkflowName: state.setWorkflowName,
    setWorkflowId: state.setWorkflowId,
    setWorkflowDescription: state.setWorkflowDescription,
});

// 按钮 ID 定义
type ButtonActionId =
    // Combo Actions
    | "merge-group"
    | "concat-video"
    | "image-fusion"
    | "first-last-frame-video"
    | "text-to-speech"
    | "motion-control"
    | "video-transfer"
    | "character-replace"
    | "merge-video-audio"
    | "lip-sync"
    | "generate-video"
    | "image-edit"
    | "clone-voice"
    // Node Actions
    | "split"
    | "generate-audio"
    | "generate-text"
    | "generate-image"
    | "generate-music"
    | "generate-3d"
    | "generate-video-node"
    | "desc-video"
    | "speech-recognize"
    | "upscale-video"
    | "extract-audio"
    | "split-video"
    | "first-frame"
    | "last-frame"
    | "video-filter"
    | "arrange-node"
    | "desc-image"
    | "image-refine"
    | "image-angles"
    | "image-segment"
    | "image-upscale"
    | "voice-to-text"
    | "separate-audio"
    | "separate-speaker"
    | "denoise-audio"
    | "convert-voice"
    | "parse-doc"
    | "desc-model";

// 按钮配置类型
interface ButtonConfig {
    text: string;
    onClick: () => void;
    id?: string;
    nodeType?: string;
}

// 动作容器组件
const ActionContainer = ({ children }: { children: React.ReactNode }) => (
    <div className="flex items-center justify-center gap-2 border border-white/20 dark:border-gray-500/30 bg-white dark:bg-zinc-800/90 h-[48px] w-max rounded-full px-4">
        {children}
    </div>
);

// 分隔线组件
const Divider = () => <div className="h-5 w-px bg-gray-200 dark:bg-gray-700" />;

// 文字按钮组件（无动画）
const TextButton = ({
    text,
    onClick,
}: {
    text: string;
    onClick?: () => void;
}) => {
    return (
        <div
            className={cn(
                "px-3 py-1.5 cursor-pointer rounded-full text-sm font-medium flex items-center gap-1",
                "bg-transparent hover:bg-gray-100 dark:hover:bg-gray-700/50",
                "transition-colors duration-200",
                "active:scale-95",
                "text-gray-600 dark:text-gray-200",
                "whitespace-nowrap",
            )}
            onClick={onClick}
        >
            {text}
        </div>
    );
};

// 图标按钮组件（带 Tooltip）
const IconButton = ({
    icon: Icon,
    tooltip,
    onClick,
}: {
    icon: React.ComponentType<{ className?: string }>;
    tooltip: string;
    onClick?: () => void;
}) => {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <button
                    type="button"
                    className={cn(
                        "w-10 h-10 flex items-center justify-center cursor-pointer rounded-full",
                        "bg-transparent hover:bg-gray-100 dark:hover:bg-gray-700/50",
                        "transition-colors duration-200",
                        "active:scale-95",
                        "text-gray-600 dark:text-gray-200",
                    )}
                    onClick={onClick}
                >
                    <Icon className="w-5 h-5" />
                </button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={8}>
                <p>{tooltip}</p>
            </TooltipContent>
        </Tooltip>
    );
};

// 动作项组件
const ActionItem = ({ buttons }: { buttons: ButtonConfig[] }) => {
    return (
        <ActionContainer>
            {buttons.map((buttonItem, index) => (
                <TextButton
                    key={index}
                    text={buttonItem.text}
                    onClick={buttonItem.onClick}
                />
            ))}
        </ActionContainer>
    );
};

export default function SmartIsland() {
    const {
        nodes,
        edges,
        addNode,
        selectedNodes,
        comboMode,
        comboSelectedIds,
        expands,
        compose,
        getCompute,
        updates,
        workflowId,
        workflowName,
        workflowDescription,
        setWorkflowName,
        setWorkflowId,
        setWorkflowDescription,
    } = useFlow(useShallow(selector));

    const t = useTranslations("Workspace.smartIsland");
    const tIndex = useTranslations("Index");
    const router = useRouter();
    const { screenToFlowPosition } = useReactFlow();

    const addNodeAtViewportCenter = useCallback(
        (node: PossibleNode) => {
            const el =
                typeof document !== "undefined"
                    ? document.querySelector(".react-flow")
                    : null;
            if (!el) {
                addNode(node);
                return;
            }
            const r = el.getBoundingClientRect();
            addNode(
                node,
                screenToFlowPosition({
                    x: r.left + r.width / 2,
                    y: r.top + r.height / 2,
                }),
            );
        },
        [addNode, screenToFlowPosition],
    );

    const workspaceMode = useTaskStore((state) => state.workspaceMode);
    const workflowExecutionStatus = useTaskStore(
        (state) => state.workflowExecutionStatus,
    );
    const setWorkflowExecutionStatus = useTaskStore(
        (state) => state.setWorkflowExecutionStatus,
    );
    const setNodeExecutionStatus = useTaskStore(
        (state) => state.setNodeExecutionStatus,
    );
    const setCurrentExecutionLevel = useTaskStore(
        (state) => state.setCurrentExecutionLevel,
    );
    const clearNodeExecutionStatus = useTaskStore(
        (state) => state.clearNodeExecutionStatus,
    );

    const [executorRef, setExecutorRef] = useState<WorkflowExecutor | null>(
        null,
    );
    const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
    const [showSaveDialog, setShowSaveDialog] = useState(false); // 执行前保存弹窗
    const [tempName, setTempName] = useState(""); // 临时保存的名称
    const [tempDescription, setTempDescription] = useState(""); // 临时保存的描述
    const [isSaving, setIsSaving] = useState(false); // 保存中状态
    const isExecuteMode = workspaceMode === "execute";
    const isRunning = workflowExecutionStatus === "running";

    // 获取 features store 中的 getFeatureByName 方法
    const getFeatureByName = useFeaturesStore(
        (state) => state.getFeatureByName,
    );

    // 计算预估费用和处理时间（基于节点类型，与节点位置无关，拖动时不重算）
    const nodeTypeKey = useMemo(
        () => nodes.map((n) => n.type ?? "").join(","),
        [nodes],
    );

    const { estimatedTime } = useMemo(() => {
        let totalTime = 0;

        for (const type of nodeTypeKey.split(",")) {
            if (!type) continue;
            const config = getNodeExecutionConfig(type);
            if (!config?.feature) continue;
            const featureInfo = getFeatureByName(config.feature);
            if (featureInfo) {
                totalTime += featureInfo.processingTime ?? 0;
            }
        }

        return {
            estimatedTime: totalTime,
        };
    }, [nodeTypeKey, getFeatureByName]);

    // 执行单个节点
    const executeNode = useCallback(
        async (
            nodeId: string,
            nodeInfo: NodeExecutionInfo,
        ): Promise<boolean> => {
            console.log(
                `[SmartIsland] Executing node: ${nodeId} (type: ${nodeInfo.type})`,
            );

            // 获取节点的 compute 函数
            const compute = getCompute(nodeId);

            if (compute) {
                try {
                    // 调用节点的 compute 方法
                    await compute();
                    console.log(
                        `[SmartIsland] Node ${nodeId} compute completed`,
                    );
                    return true;
                } catch (error) {
                    console.error(
                        `[SmartIsland] Node ${nodeId} compute failed:`,
                        error,
                    );
                    return false;
                }
            } else {
                // 没有 compute 函数的节点（如数据节点）直接标记为完成
                console.log(
                    `[SmartIsland] Node ${nodeId} has no compute function, marking as completed`,
                );
                return true;
            }
        },
        [getCompute],
    );

    // SSE 连接引用
    const [eventSourceRef, setEventSourceRef] = useState<EventSource | null>(
        null,
    );

    // 执行模式下的播放按钮点击处理 - 调用后端 API 执行 + SSE 实时更新
    // overrideWorkflowId: 保存后传入的 workflowId
    const handleExecute = useCallback(
        async (overrideWorkflowId: number) => {
            console.log(
                "[SmartIsland] Execute button clicked - 开始通过后端执行工作流 (SSE)",
            );

            // 清除之前的执行状态
            clearNodeExecutionStatus();
            setWorkflowExecutionStatus("running");

            try {
                console.log(
                    "[SmartIsland] Using workflowId:",
                    overrideWorkflowId,
                );

                // 调用 Next.js API 创建任务 - 只传 workflowId，后端从数据库获取 executable
                const response = await fetch("/api/workflow/execute", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        workflowId: overrideWorkflowId,
                    }),
                });

                if (!response.ok) {
                    // 尝试解析错误响应
                    const errorData = (await response
                        .json()
                        .catch(() => ({}))) as {
                        code?: string;
                        error?: string;
                        requiredTier?: string;
                        userTier?: string;
                    };

                    throw new Error(
                        errorData.error ||
                            `API request failed: ${response.status}`,
                    );
                }

                const { taskId } = (await response.json()) as {
                    taskId: string;
                };
                console.log("[SmartIsland] Task created:", taskId);
                setCurrentTaskId(taskId);

                // 4. 连接 SSE 获取实时执行进度
                const sseUrl = getTaskWaitUrl(taskId);
                console.log("[SmartIsland] Connecting to SSE:", sseUrl);

                const eventSource = new EventSource(sseUrl);
                setEventSourceRef(eventSource);

                eventSource.onopen = () => {
                    console.log("[SmartIsland SSE] Connection opened");
                    // 触发 SSE 连接建立事件，显示进度浮动提示
                    emitSSEConnected(taskId);
                };

                eventSource.onmessage = (event) => {
                    try {
                        const message = JSON.parse(event.data) as {
                            status: string;
                            nodeId?: string;
                            data?: Record<string, unknown>;
                        };
                        console.log("[SmartIsland SSE] Received:", message);

                        // 触发 SSE 消息事件，更新进度浮动提示
                        emitSSETaskMessage({
                            id: taskId,
                            status: message.status as any,
                            nodeId: message.nodeId || null,
                            data: message.data as any,
                        });

                        switch (message.status) {
                            // 工作流开始
                            case WorkflowStatus.WORKFLOW_STARTED:
                            case "WORKFLOW_START": // 兼容旧状态
                                console.log(
                                    "[SmartIsland] Workflow started:",
                                    message.data?.totalNodes,
                                    "nodes",
                                );
                                break;

                            // 节点开始/运行中
                            case NodeStatus.NODE_STARTED:
                            case NodeStatus.NODE_RUNNING:
                            case "NODE_START": // 兼容旧状态
                                if (message.nodeId) {
                                    console.log(
                                        "[SmartIsland] Node started:",
                                        message.nodeId,
                                    );
                                    setNodeExecutionStatus(
                                        message.nodeId,
                                        "running",
                                    );
                                }
                                break;

                            case "NODE_PROGRESS": // 保留用于进度更新
                                if (message.nodeId) {
                                    console.log(
                                        "[SmartIsland] Node progress:",
                                        message.nodeId,
                                        message.data?.progress,
                                    );
                                }
                                break;

                            // 节点完成
                            case NodeStatus.NODE_COMPLETED:
                            case "NODE_COMPLETE": // 兼容旧状态
                                if (message.nodeId) {
                                    console.log(
                                        "[SmartIsland] Node completed:",
                                        message.nodeId,
                                        message.data,
                                    );
                                    setNodeExecutionStatus(
                                        message.nodeId,
                                        "completed",
                                    );

                                    // 更新节点数据（fileKeys, texts 等）
                                    const output = message.data?.output as
                                        | {
                                              fileKeys?: string[];
                                              texts?: string[];
                                          }
                                        | undefined;
                                    if (output) {
                                        // 数据节点类型列表
                                        const DATA_NODE_TYPES = [
                                            "textNode",
                                            "imageNode",
                                            "videoNode",
                                            "audioNode",
                                            "fileNode",
                                            "modelNode",
                                        ];

                                        // 判断是否为数据节点
                                        const isDataNodeType = (
                                            type?: string,
                                        ) =>
                                            type &&
                                            DATA_NODE_TYPES.includes(type);

                                        /**
                                         * 更新直接下游的数据节点
                                         *
                                         * 工作流数据传递机制：
                                         * - 处理节点（如 image-gen-video）执行后产生输出
                                         * - 输出数据只写入到直接下游的数据节点（如 videoNode）
                                         * - 后续处理节点在执行时，会通过 paramMappings 从上游数据节点读取输入
                                         *
                                         * 只更新直接下一层的数据节点，不递归传播
                                         */
                                        const updateDownstreamDataNodes = (
                                            sourceNodeId: string,
                                            data: {
                                                fileKeys?: string[];
                                                texts?: string[];
                                            },
                                        ) => {
                                            // 获取所有直接下游边
                                            const downstreamEdges =
                                                edges.filter(
                                                    (e) =>
                                                        e.source ===
                                                        sourceNodeId,
                                                );

                                            for (const edge of downstreamEdges) {
                                                const downstreamNode =
                                                    nodes.find(
                                                        (n) =>
                                                            n.id ===
                                                            edge.target,
                                                    );
                                                if (!downstreamNode) continue;

                                                // 只更新数据节点
                                                if (
                                                    isDataNodeType(
                                                        downstreamNode.type,
                                                    )
                                                ) {
                                                    const downstreamData =
                                                        (downstreamNode.data as Record<
                                                            string,
                                                            unknown
                                                        >) || {};
                                                    const newDownstreamData: Record<
                                                        string,
                                                        unknown
                                                    > = {
                                                        ...downstreamData,
                                                    };

                                                    if (
                                                        data.fileKeys &&
                                                        data.fileKeys.length > 0
                                                    ) {
                                                        newDownstreamData.fileKeys =
                                                            data.fileKeys;
                                                    }
                                                    if (
                                                        data.texts &&
                                                        data.texts.length > 0
                                                    ) {
                                                        newDownstreamData.texts =
                                                            data.texts;
                                                    }

                                                    updates(
                                                        edge.target,
                                                        newDownstreamData,
                                                    );
                                                    console.log(
                                                        "[SmartIsland] Updated downstream data node:",
                                                        edge.target,
                                                        newDownstreamData,
                                                    );
                                                }
                                            }
                                        };

                                        // 1. 更新当前节点自身的数据
                                        const node = nodes.find(
                                            (n) => n.id === message.nodeId,
                                        );
                                        if (node) {
                                            const currentData =
                                                (node.data as Record<
                                                    string,
                                                    unknown
                                                >) || {};
                                            const newData: Record<
                                                string,
                                                unknown
                                            > = {
                                                ...currentData,
                                            };

                                            if (
                                                output.fileKeys &&
                                                output.fileKeys.length > 0
                                            ) {
                                                newData.fileKeys =
                                                    output.fileKeys;
                                            }
                                            if (
                                                output.texts &&
                                                output.texts.length > 0
                                            ) {
                                                newData.texts = output.texts;
                                            }

                                            updates(message.nodeId, newData);
                                            console.log(
                                                "[SmartIsland] Updated node data:",
                                                message.nodeId,
                                                newData,
                                            );
                                        }

                                        // 2. 递归更新所有下游数据节点
                                        updateDownstreamDataNodes(
                                            message.nodeId,
                                            output,
                                        );
                                    }
                                }
                                break;

                            // 节点失败
                            case NodeStatus.NODE_FAILED:
                                if (message.nodeId) {
                                    console.log(
                                        "[SmartIsland] Node failed:",
                                        message.nodeId,
                                        message.data?.error,
                                    );
                                    setNodeExecutionStatus(
                                        message.nodeId,
                                        "failed",
                                    );
                                }
                                break;

                            // 工作流完成
                            case WorkflowStatus.WORKFLOW_COMPLETED:
                            case TaskStatus.COMPLETED:
                            case "FINISHED": // 兼容旧状态
                                console.log(
                                    "[SmartIsland] ✅ Workflow completed successfully!",
                                );
                                console.log(
                                    "[SmartIsland] Outputs:",
                                    message.data?.outputs,
                                );
                                setWorkflowExecutionStatus("completed");
                                // 双保险：前端也更新任务状态 + 保存素材（幂等）
                                saveFromTask({
                                    taskId: taskId,
                                    status: message.status,
                                    data: message.data,
                                })
                                    .then((result) => {
                                        console.log(
                                            "[SmartIsland] Frontend backup save result:",
                                            result,
                                        );
                                    })
                                    .catch((err) => {
                                        console.warn(
                                            "[SmartIsland] Frontend backup save failed:",
                                            err,
                                        );
                                    });
                                eventSource.close();
                                setEventSourceRef(null);
                                setCurrentTaskId(null);
                                // 刷新余额（工作流完成会扣费）
                                break;

                            // 工作流取消
                            case WorkflowStatus.WORKFLOW_CANCELLED:
                            case TaskStatus.CANCELLED:
                                console.log(
                                    "[SmartIsland] ⚠️ Workflow cancelled by user",
                                );
                                // 双保险：前端也更新任务状态
                                saveFromTask({
                                    taskId: taskId,
                                    status: message.status,
                                    data: message.data,
                                }).catch(() => {});
                                // 清除取消超时定时器
                                if ((window as any).__cancelTimeoutId) {
                                    clearTimeout(
                                        (window as any).__cancelTimeoutId,
                                    );
                                    (window as any).__cancelTimeoutId = null;
                                }
                                clearNodeExecutionStatus(); // 清理节点执行状态
                                setWorkflowExecutionStatus("idle");
                                eventSource.close();
                                setEventSourceRef(null);
                                setCurrentTaskId(null);
                                // 停止执行器
                                if (executorRef) {
                                    executorRef.stop();
                                    setExecutorRef(null);
                                }
                                // 刷新余额（工作流取消会退费）
                                break;

                            // 工作流失败
                            case WorkflowStatus.WORKFLOW_FAILED:
                            case TaskStatus.FAILED:
                            case "ERROR": // 兼容旧状态
                                console.log(
                                    "[SmartIsland] ❌ Workflow failed:",
                                    message.data?.error,
                                );
                                // 双保险：前端也更新任务状态
                                saveFromTask({
                                    taskId: taskId,
                                    status: message.status,
                                    data: message.data,
                                }).catch(() => {});
                                setWorkflowExecutionStatus("failed");
                                eventSource.close();
                                setEventSourceRef(null);
                                setCurrentTaskId(null);
                                // 刷新余额（工作流失败会退费）
                                break;

                            default:
                                console.log(
                                    "[SmartIsland SSE] Unknown status:",
                                    message.status,
                                );
                        }
                    } catch (e) {
                        console.error(
                            "[SmartIsland SSE] Failed to parse message:",
                            e,
                        );
                    }
                };

                eventSource.onerror = (error) => {
                    console.error("[SmartIsland SSE] Connection error:", error);
                    setWorkflowExecutionStatus("failed");
                    eventSource.close();
                    setEventSourceRef(null);
                };
            } catch (error) {
                console.error("[SmartIsland] Execution failed:", error);
                setWorkflowExecutionStatus("failed");
            }
        },
        [
            nodes,
            edges,
            updates,
            clearNodeExecutionStatus,
            setWorkflowExecutionStatus,
            setNodeExecutionStatus,
        ],
    );

    // 点击执行按钮 - 始终弹出保存对话框（执行前需要保存最新状态）
    const handleExecuteClick = useCallback(() => {
        // 始终打开保存对话框，执行前会保存最新的工作流状态
        setTempName(workflowName || tIndex("title"));
        setTempDescription(workflowDescription || "");
        setShowSaveDialog(true);
    }, [workflowName, workflowDescription]);

    // 保存并执行工作流
    const handleSaveAndExecute = useCallback(async () => {
        // 已保存的工作流使用现有名称，新工作流需要输入名称
        const effectiveName = workflowId ? workflowName : tempName;
        const effectiveDescription = workflowId
            ? workflowDescription
            : tempDescription;

        if (!effectiveName?.trim()) {
            toast.error(t("enterWorkflowName"));
            return;
        }

        setIsSaving(true);
        try {
            // 前端生成 executable（因为需要运行时注册表中的配置）
            const executable = exportWorkflow(nodes, edges, {
                name: effectiveName,
                description: effectiveDescription || "",
                includeOriginalFlow: false,
            });

            const workflowData = {
                ...(workflowId ? { workflowId } : {}), // 已保存的工作流传入 ID 进行更新
                name: effectiveName,
                description: effectiveDescription || "",
                flow: { nodes, edges },
                executable: executable as unknown as Record<string, unknown>,
            };

            const result = await saveWorkflow(workflowData);
            setWorkflowId(result.workflowId);
            setWorkflowName(effectiveName);
            setWorkflowDescription(effectiveDescription || "");
            toast.success(t("saveSuccess"));

            // 关闭对话框并执行
            setShowSaveDialog(false);

            // 直接执行，传入新保存的 workflowId（避免等待状态更新的闭包问题）
            handleExecute(result.workflowId);
        } catch (error) {
            console.error("保存失败:", error);
            toast.error(t("saveFailed"));
        } finally {
            setIsSaving(false);
        }
    }, [
        workflowId,
        workflowName,
        workflowDescription,
        tempName,
        tempDescription,
        nodes,
        edges,
        setWorkflowId,
        setWorkflowName,
        setWorkflowDescription,
        handleExecute,
    ]);

    // 停止执行
    const handleStop = useCallback(async () => {
        console.log("[SmartIsland] Stop button clicked - 停止执行工作流");

        const taskIdToCancel = currentTaskId;

        // 立即显示“取消中”状态
        if (taskIdToCancel) {
            emitSSETaskMessage({
                id: taskIdToCancel,
                status: TaskStatus.RUNNING,
                nodeId: null,
                data: { message: "取消中..." },
            });
        }

        // 调用后端停止接口
        if (taskIdToCancel) {
            try {
                const response = await fetch(getTaskStopUrl(), {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ taskId: taskIdToCancel }),
                });
                console.log(
                    "[SmartIsland] Stop request sent for task:",
                    taskIdToCancel,
                );

                if (response.ok) {
                    // 后端成功处理了取消请求
                    // 等待 SSE 消息，如果 10 秒内没收到取消消息，手动触发
                    const timeoutId = setTimeout(() => {
                        console.log(
                            "[SmartIsland] Timeout waiting for CANCELLED message, emitting manually",
                        );
                        // 手动触发取消事件到 Toast
                        emitSSETaskMessage({
                            id: taskIdToCancel,
                            status: TaskStatus.CANCELLED,
                            nodeId: null,
                            data: { message: "任务已取消" },
                        });
                        // 清理状态
                        if (eventSourceRef) {
                            eventSourceRef.close();
                            setEventSourceRef(null);
                        }
                        if (executorRef) {
                            executorRef.stop();
                        }
                        clearNodeExecutionStatus(); // 清理节点执行状态
                        setWorkflowExecutionStatus("idle");
                        setExecutorRef(null);
                        setCurrentTaskId(null);
                    }, 10000); // 10 秒超时

                    // 存储 timeoutId 以便在收到 CANCELLED 消息时清除
                    (window as any).__cancelTimeoutId = timeoutId;
                } else {
                    throw new Error(`Stop request failed: ${response.status}`);
                }
            } catch (error) {
                console.error(
                    "[SmartIsland] Failed to send stop request:",
                    error,
                );
                // 发送失败时直接清理状态并手动触发取消事件
                emitSSETaskMessage({
                    id: taskIdToCancel,
                    status: TaskStatus.CANCELLED,
                    nodeId: null,
                    data: { message: "任务已取消" },
                });
                if (eventSourceRef) {
                    eventSourceRef.close();
                    setEventSourceRef(null);
                }
                if (executorRef) {
                    executorRef.stop();
                }
                clearNodeExecutionStatus(); // 清理节点执行状态
                setWorkflowExecutionStatus("idle");
                setExecutorRef(null);
                setCurrentTaskId(null);
            }
        } else {
            // 没有 taskId 时直接清理
            if (eventSourceRef) {
                eventSourceRef.close();
                setEventSourceRef(null);
            }
            if (executorRef) {
                executorRef.stop();
            }
            clearNodeExecutionStatus(); // 清理节点执行状态
            setWorkflowExecutionStatus("idle");
            setExecutorRef(null);
        }
    }, [
        executorRef,
        eventSourceRef,
        setWorkflowExecutionStatus,
        currentTaskId,
        clearNodeExecutionStatus,
    ]);

    // 监听取消请求事件（来自 TaskProgressToast）- 只处理工作流取消
    useEffect(() => {
        const handleCancelRequest = () => {
            // 只有在工作流执行时（有 currentTaskId）才处理
            if (currentTaskId) {
                console.log(
                    "[SmartIsland] Received cancel request from Toast for workflow",
                );
                handleStop();
            }
        };

        window.addEventListener("task-cancel-request", handleCancelRequest);
        return () => {
            window.removeEventListener(
                "task-cancel-request",
                handleCancelRequest,
            );
        };
    }, [handleStop, currentTaskId]);

    // 获取组合模式的操作
    const getComboActions = () => {
        console.log(comboSelectedIds);
        const types: string[] =
            Array.from(comboSelectedIds).map((id) => {
                const node = nodes.find((n) => n.id === id);
                return node?.type!;
            }) || [];
        const counts: Record<string, number> = types.reduce(
            (acc, type) => {
                acc[type] = (acc[type] ?? 0) + 1;
                return acc;
            },
            {} as Record<string, number>,
        );

        // 多个视频节点
        if (!types?.some((type) => type !== "videoNode") && types.length > 1) {
            return (
                <ActionItem
                    buttons={[
                        {
                            text: t("mergeGroup"),
                            id: "merge-group",
                            onClick: () =>
                                compose({
                                    type: "videoNode",
                                    data: {
                                        fileKeys: Array.from(comboSelectedIds)
                                            .map((id) => {
                                                const node = nodes.find(
                                                    (n) => n.id === id,
                                                );
                                                return node?.data.fileKeys;
                                            })
                                            .flat(),
                                    },
                                }),
                        },
                        {
                            text: t("concat"),
                            id: "concat-video",
                            onClick: () =>
                                compose({
                                    type: "concatVideoComposeNode",
                                    data: {
                                        ids: Array.from(comboSelectedIds).map(
                                            (id) => id,
                                        ),
                                    },
                                }),
                        },
                    ]}
                />
            );
        }
        // 多个图片节点
        else if (
            !types?.some((type) => type !== "imageNode") &&
            types.length > 1
        ) {
            const buttons = [
                {
                    text: t("mergeGroup"),
                    id: "merge-group",
                    onClick: () =>
                        compose({
                            type: "imageNode",
                            data: {
                                fileKeys: Array.from(comboSelectedIds)
                                    .map((id) => {
                                        const node = nodes.find(
                                            (n) => n.id === id,
                                        );
                                        return node?.data.fileKeys;
                                    })
                                    .flat(),
                            },
                        }),
                },
            ];

            // 2-14张图片时，添加图片融合选项（Gemini 3 Pro 支持最多14张参考图片）
            if (types.length >= 2 && types.length <= 14) {
                buttons.push({
                    text: t("imageFusion"),
                    id: "image-fusion",
                    onClick: () =>
                        compose({
                            type: "imageFusionNode",
                            data: {
                                ids: Array.from(comboSelectedIds).map(
                                    (id) => id,
                                ),
                            },
                        }),
                });

                // 如果是两张图片，添加首尾帧生成视频选项
                if (types.length === 2) {
                    buttons.push({
                        text: t("firstLastFrameVideo"),
                        id: "first-last-frame-video",
                        onClick: () =>
                            compose({
                                type: "imageImageGenVideoNode",
                                data: {
                                    ids: Array.from(comboSelectedIds).map(
                                        (id) => id,
                                    ),
                                },
                            }),
                    });
                }
            }

            return <ActionItem buttons={buttons} />;
        }
        // 多个文本节点
        else if (counts.textNode! > 1) {
            return (
                <ActionItem
                    buttons={[
                        {
                            text: t("mergeGroup"),
                            id: "merge-group",
                            onClick: () =>
                                compose({
                                    type: "textNode",
                                    data: {
                                        texts: Array.from(comboSelectedIds)
                                            .map((id) => {
                                                const node = nodes.find(
                                                    (n) => n.id === id,
                                                );
                                                return node?.data.texts;
                                            })
                                            .flat(),
                                    },
                                }),
                        },
                        {
                            text: t("rewriteText"),
                            id: "text-rewrite",
                            onClick: () =>
                                compose({
                                    type: "textsGenTextNode",
                                    data: {
                                        ids: Array.from(comboSelectedIds).map(
                                            (id) => id,
                                        ),
                                    },
                                }),
                        },
                        {
                            text: t("textToSpeech"),
                            id: "text-to-speech",
                            onClick: () =>
                                expands(
                                    selectedNodes[0]!.id,
                                    selectedNodes
                                        .map((node) => ({
                                            type: "textGenSpeechNode",
                                            data: node.data,
                                        }))
                                        .filter((n) => n.type !== ""),
                                ),
                        },
                    ]}
                />
            );
        }
        // 多个音频节点
        else if (
            !types?.some((type) => type !== "audioNode") &&
            types.length > 1
        ) {
            return (
                <ActionItem
                    buttons={[
                        {
                            text: t("mergeGroup"),
                            id: "merge-group",
                            onClick: () =>
                                compose({
                                    type: "audioNode",
                                    data: {
                                        fileKeys: Array.from(comboSelectedIds)
                                            .map((id) => {
                                                const node = nodes.find(
                                                    (n) => n.id === id,
                                                );
                                                return node?.data.fileKeys;
                                            })
                                            .flat(),
                                    },
                                }),
                        },
                    ]}
                />
            );
        } else if (
            counts.audioNode === 1 &&
            counts.videoNode === 1 &&
            counts.imageNode === 1
        ) {
            return (
                <ActionItem
                    buttons={[
                        {
                            text: t("motionControl"),
                            id: "motion-control",
                            onClick: () =>
                                compose({
                                    type: "speechImageVideoGenVideoNode",
                                    data: {
                                        ids: Array.from(comboSelectedIds).map(
                                            (id) => id,
                                        ),
                                    },
                                }),
                        },
                    ]}
                />
            );
        }
        // 视频 + 图片
        else if (counts.videoNode === 1 && counts.imageNode === 1) {
            return (
                <ActionItem
                    buttons={[
                        {
                            text: t("videoTransfer"),
                            id: "video-transfer",
                            onClick: () =>
                                compose({
                                    type: "videoImageGenVideoMoveNode",
                                    data: {
                                        ids: Array.from(comboSelectedIds).map(
                                            (id) => id,
                                        ),
                                    },
                                }),
                        },
                        {
                            text: t("characterReplace"),
                            id: "character-replace",
                            onClick: () =>
                                compose({
                                    type: "videoImageGenVideoMixNode",
                                    data: {
                                        ids: Array.from(comboSelectedIds).map(
                                            (id) => id,
                                        ),
                                    },
                                }),
                        },
                    ]}
                />
            );
        }
        // 视频 + 音频
        else if (counts.videoNode === 1 && counts.audioNode === 1) {
            return (
                <ActionItem
                    buttons={[
                        {
                            text: t("merge"),
                            id: "merge-video-audio",
                            onClick: () =>
                                compose({
                                    type: "mergeVideoAudioNode",
                                    data: {
                                        ids: Array.from(comboSelectedIds).map(
                                            (id) => id,
                                        ),
                                    },
                                }),
                        },
                        {
                            text: t("lipSync"),
                            id: "lip-sync",
                            onClick: () =>
                                compose({
                                    type: "speechVideoGenVideoNode",
                                    data: {
                                        ids: Array.from(comboSelectedIds).map(
                                            (id) => id,
                                        ),
                                    },
                                }),
                        },
                    ]}
                />
            );
        }
        // 图片 + 音频
        else if (counts.imageNode === 1 && counts.audioNode === 1) {
            return (
                <ActionItem
                    buttons={[
                        {
                            text: t("generateVideo"),
                            id: "generate-video",
                            onClick: () =>
                                compose({
                                    type: "speechImageGenVideoNode",
                                    data: {
                                        ids: Array.from(comboSelectedIds).map(
                                            (id) => id,
                                        ),
                                    },
                                }),
                        },
                    ]}
                />
            );
        }
        // 多个图片 + 一个文本（2-14张图片带提示词融合）
        else if (
            counts.imageNode! >= 2 &&
            counts.imageNode! <= 14 &&
            counts.textNode === 1
        ) {
            return (
                <ActionItem
                    buttons={[
                        {
                            text: t("imageFusion"),
                            id: "image-fusion",
                            onClick: () =>
                                compose({
                                    type: "imageFusionNode",
                                    data: {
                                        ids: Array.from(comboSelectedIds).map(
                                            (id) => id,
                                        ),
                                    },
                                }),
                        },
                    ]}
                />
            );
        }
        // 图片 + 文本
        else if (counts.imageNode === 1 && counts.textNode === 1) {
            // 获取文本节点的文本内容
            const textNode = Array.from(comboSelectedIds)
                .map((id) => nodes.find((n) => n.id === id))
                .find((node) => node?.type === "textNode");
            const textContent =
                (textNode?.data as { texts?: string[] })?.texts?.[0] || "";

            return (
                <ActionItem
                    buttons={[
                        {
                            text: t("editImage"),
                            id: "image-edit",
                            onClick: () =>
                                compose({
                                    type: "imageGenImageNode",
                                    data: {
                                        ids: Array.from(comboSelectedIds).map(
                                            (id) => id,
                                        ),
                                    },
                                }),
                        },
                        {
                            text: t("generateVideo"),
                            id: "generate-video",
                            nodeType: "imageGenVideoNode",
                            onClick: () =>
                                compose({
                                    type: "imageGenVideoNode",
                                    data: {
                                        ids: Array.from(comboSelectedIds).map(
                                            (id) => id,
                                        ),
                                        // 将文本节点的内容传入 query 字段
                                        query: textContent,
                                    },
                                }),
                        },
                    ]}
                />
            );
        }
        // 文本 + 音频
        else if (counts.textNode === 1 && counts.audioNode === 1) {
            return (
                <ActionItem
                    buttons={[
                        {
                            text: t("cloneVoice"),
                            id: "clone-voice",
                            onClick: () =>
                                compose({
                                    type: "textAudioGenSpeechNode",
                                    data: {
                                        ids: Array.from(comboSelectedIds).map(
                                            (id) => id,
                                        ),
                                    },
                                }),
                        },
                        {
                            text: t("generateVideo"),
                            onClick: () =>
                                compose({
                                    type: "speechTextGenVideoNode",
                                    data: {
                                        ids: Array.from(comboSelectedIds).map(
                                            (id) => id,
                                        ),
                                    },
                                }),
                        },
                    ]}
                />
            );
        }
        // 文本 + 视频
        else if (counts.textNode === 1 && counts.videoNode === 1) {
            return (
                <ActionItem
                    buttons={[
                        {
                            text: t("speechGenVideo"),
                            id: "speech-gen-video",
                            onClick: () =>
                                compose({
                                    type: "speechGenVideoNode",
                                    data: {
                                        ids: Array.from(comboSelectedIds).map(
                                            (id) => id,
                                        ),
                                    },
                                }),
                        },
                    ]}
                />
            );
        }
        // 图片 + 视频 + 音频
        else if (
            counts.imageNode === 1 &&
            counts.videoNode === 1 &&
            counts.audioNode === 1
        ) {
            return (
                <ActionItem
                    buttons={[
                        {
                            text: t("generateVideo"),
                            onClick: () =>
                                compose({
                                    type: "speechImageVideoGenVideoNode",
                                    data: {
                                        ids: Array.from(comboSelectedIds).map(
                                            (id) => id,
                                        ),
                                    },
                                }),
                        },
                    ]}
                />
            );
        }

        return null;
    };

    // 获取单个节点的操作
    const getNodeActions = () => {
        if (selectedNodes.length !== 1) {
            return null;
        }
        const { type, id, data } = selectedNodes[0]!;

        switch (type) {
            case "textNode":
                // 多个文本的操作
                if ((data as any).texts?.length > 1) {
                    return (
                        <ActionItem
                            buttons={[
                                {
                                    text: t("split"),
                                    id: "split",
                                    onClick: () =>
                                        expands(
                                            id,
                                            ((data as any).texts || []).map(
                                                (text: string) => ({
                                                    type: "textNode",
                                                    data: { texts: [text] },
                                                }),
                                            ),
                                        ),
                                },
                                {
                                    text: t("generateAudio"),
                                    id: "generate-audio",
                                    onClick: () =>
                                        expands(id, [
                                            {
                                                type: "textGenSpeechNode",
                                                data: data,
                                            },
                                        ]),
                                },
                            ]}
                        />
                    );
                }
                // 单个文本的操作
                return (
                    <ActionItem
                        buttons={[
                            {
                                text: t("splitText"),
                                id: "split-text",
                                nodeType: "splitTextNode",
                                onClick: () =>
                                    expands(id, [
                                        { type: "splitTextNode", data: data },
                                    ]),
                            },
                            {
                                text: t("generateText"),
                                id: "generate-text",
                                nodeType: "genTextNode",
                                onClick: () =>
                                    expands(id, [
                                        { type: "genTextNode", data: data },
                                    ]),
                            },
                            {
                                text: t("generateImage"),
                                id: "generate-image",
                                nodeType: "textGenImageNode",
                                onClick: () =>
                                    expands(id, [
                                        {
                                            type: "textGenImageNode",
                                            data: data,
                                        },
                                    ]),
                            },
                            {
                                text: t("generateMusic"),
                                id: "generate-music",
                                nodeType: "textGenMusicNode",
                                onClick: () =>
                                    expands(id, [
                                        {
                                            type: "textGenMusicNode",
                                            data: data,
                                        },
                                    ]),
                            },
                            {
                                text: t("generateAudio"),
                                id: "generate-audio",
                                nodeType: "textGenSpeechNode",
                                onClick: () =>
                                    expands(id, [
                                        {
                                            type: "textGenSpeechNode",
                                            data: data,
                                        },
                                    ]),
                            },
                            {
                                text: t("generateVideo"),
                                id: "generate-video-node",
                                nodeType: "textGenVideoNode",
                                onClick: () =>
                                    expands(id, [
                                        {
                                            type: "textGenVideoNode",
                                            data: data,
                                        },
                                    ]),
                            },
                        ]}
                    />
                );

            case "audioNode":
                // 如果是音频组，添加打散操作
                const audioGroupButtons =
                    (data as any).fileKeys?.length > 1
                        ? [
                              {
                                  text: t("split"),
                                  id: "split",
                                  onClick: () =>
                                      expands(
                                          id,
                                          ((data as any).fileKeys || []).map(
                                              (fileKey: string) => ({
                                                  type: "audioNode",
                                                  data: { fileKeys: [fileKey] },
                                              }),
                                          ),
                                      ),
                              },
                          ]
                        : [];

                return (
                    <ActionItem
                        buttons={[
                            {
                                text: t("speechRecognize"),
                                nodeType: "audioGenTextSpeechRecognizeNode",
                                onClick: () =>
                                    expands(id, [
                                        {
                                            type: "audioGenTextSpeechRecognizeNode",
                                            data: data,
                                        },
                                    ]),
                            },
                            {
                                text: t("generateVideo"),
                                nodeType: "speechGenVideoNode",
                                onClick: () =>
                                    expands(id, [
                                        {
                                            type: "speechGenVideoNode",
                                            data: data,
                                        },
                                    ]),
                            },
                            {
                                text: t("separateAudio"),
                                id: "separate-audio",
                                nodeType: "separateAudioTrackNode",
                                onClick: () =>
                                    expands(id, [
                                        {
                                            type: "separateAudioTrackNode",
                                            data: data,
                                        },
                                    ]),
                            },
                            {
                                text: t("separateSpeaker"),
                                id: "separate-speaker",
                                nodeType: "separateSpeakerNode",
                                onClick: () =>
                                    expands(id, [
                                        {
                                            type: "separateSpeakerNode",
                                            data: data,
                                        },
                                    ]),
                            },
                            {
                                text: t("denoise"),
                                id: "denoise-audio",
                                nodeType: "denoiseAudioSubtitleNode",
                                onClick: () =>
                                    expands(id, [
                                        {
                                            type: "denoiseAudioSubtitleNode",
                                            data: data,
                                        },
                                    ]),
                            },
                            {
                                text: t("convertVoice"),
                                id: "convert-voice",
                                nodeType: "convertVoiceNode",
                                onClick: () =>
                                    expands(id, [
                                        {
                                            type: "convertVoiceNode",
                                            data: data,
                                        },
                                    ]),
                            },
                            ...audioGroupButtons,
                        ]}
                    />
                );

            case "videoNode":
                // 如果是视频组，添加额外的操作
                const groupButtons =
                    (data as any).fileKeys?.length > 1
                        ? [
                              {
                                  text: t("split"),
                                  id: "split",
                                  onClick: () =>
                                      expands(
                                          id,
                                          ((data as any).fileKeys || []).map(
                                              (fileKey: string) => ({
                                                  type: "videoNode",
                                                  data: { fileKeys: [fileKey] },
                                              }),
                                          ),
                                      ),
                              },
                              {
                                  text: t("filter"),
                                  id: "video-filter",
                                  onClick: () =>
                                      expands(id, [
                                          { type: "dropVideoNode", data: data },
                                      ]),
                              },
                              {
                                  text: t("arrange"),
                                  id: "arrange-node",
                                  onClick: () =>
                                      expands(id, [
                                          { type: "arrangeNode", data: data },
                                      ]),
                              },
                              {
                                  text: t("concat"),
                                  id: "concat-video",
                                  onClick: () =>
                                      expands(id, [
                                          {
                                              type: "concatVideoNode",
                                              data: data,
                                          },
                                      ]),
                              },
                          ]
                        : [];

                return (
                    <ActionItem
                        buttons={[
                            {
                                text: t("describeReverse"),
                                id: "desc-video",
                                nodeType: "videoGenTextNode",
                                onClick: () =>
                                    expands(id, [
                                        {
                                            type: "videoGenTextNode",
                                            data: data,
                                        },
                                    ]),
                            },
                            {
                                text: t("speechRecognize"),
                                id: "speech-recognize",
                                nodeType: "videoGenTextSpeechRecognizeNode",
                                onClick: () =>
                                    expands(id, [
                                        {
                                            type: "videoGenTextSpeechRecognizeNode",
                                            data: data,
                                        },
                                    ]),
                            },
                            {
                                text: t("upscale"),
                                id: "upscale-video",
                                nodeType: "videoUpscaleNode",
                                onClick: () =>
                                    expands(id, [
                                        {
                                            type: "videoUpscaleNode",
                                            data: data,
                                        },
                                    ]),
                            },
                            {
                                text: t("extractAudio"),
                                id: "extract-audio",
                                nodeType: "separateVideoAudioNode",
                                onClick: () =>
                                    expands(id, [
                                        {
                                            type: "separateVideoAudioNode",
                                            data: data,
                                        },
                                    ]),
                            },
                            {
                                text: t("slice"),
                                id: "split-video",
                                nodeType: "splitVideoNode",
                                onClick: () =>
                                    expands(id, [
                                        { type: "splitVideoNode", data: data },
                                    ]),
                            },
                            {
                                text: t("firstFrame"),
                                id: "first-frame",
                                nodeType: "getFirstFrameNode",
                                onClick: () =>
                                    expands(id, [
                                        {
                                            type: "getFirstFrameNode",
                                            data: data,
                                        },
                                    ]),
                            },
                            {
                                text: t("lastFrame"),
                                id: "last-frame",
                                nodeType: "getLastFrameNode",
                                onClick: () =>
                                    expands(id, [
                                        {
                                            type: "getLastFrameNode",
                                            data: data,
                                        },
                                    ]),
                            },
                            ...groupButtons,
                        ]}
                    />
                );

            case "imageNode":
                // 如果是图片组，添加打散操作
                const imageGroupButtons =
                    (data as any).fileKeys?.length > 1
                        ? [
                              {
                                  text: t("split"),
                                  id: "split",
                                  onClick: () =>
                                      expands(
                                          id,
                                          ((data as any).fileKeys || []).map(
                                              (fileKey: string) => ({
                                                  type: "imageNode",
                                                  data: { fileKeys: [fileKey] },
                                              }),
                                          ),
                                      ),
                              },
                          ]
                        : [];

                return (
                    <ActionItem
                        buttons={[
                            {
                                text: t("describeReverse"),
                                id: "desc-image",
                                nodeType: "imageGenTextNode",
                                onClick: () =>
                                    expands(id, [
                                        {
                                            type: "imageGenTextNode",
                                            data: data,
                                        },
                                    ]),
                            },
                            {
                                text: t("generateVideo"),
                                id: "generate-video",
                                nodeType: "imageGenVideoNode",
                                onClick: () =>
                                    expands(id, [
                                        {
                                            type: "imageGenVideoNode",
                                            data: data,
                                        },
                                    ]),
                            },
                            {
                                text: t("editImage"),
                                id: "image-edit",
                                nodeType: "imageGenImageNode",
                                onClick: () =>
                                    expands(id, [
                                        {
                                            type: "imageGenImageNode",
                                            data: data,
                                        },
                                    ]),
                            },
                            {
                                text: t("upscale"),
                                id: "image-upscale",
                                nodeType: "imageGenImageUpscaleNode",
                                onClick: () =>
                                    expands(id, [
                                        {
                                            type: "imageGenImageUpscaleNode",
                                            data: data,
                                        },
                                    ]),
                            },
                            {
                                text: t("generate3D"),
                                id: "generate-3d",
                                nodeType: "imageGenModelNode",
                                onClick: () =>
                                    expands(id, [
                                        {
                                            type: "imageGenModelNode",
                                            data: data,
                                        },
                                    ]),
                            },
                            ...imageGroupButtons,
                        ]}
                    />
                );

            case "fileNode":
                // 文件节点操作
                return (
                    <ActionItem
                        buttons={[
                            {
                                text: t("parseDocument"),
                                id: "parse-doc",
                                onClick: () =>
                                    expands(id, [
                                        { type: "fileGenTextNode", data: data },
                                    ]),
                            },
                        ]}
                    />
                );

            case "modelNode":
                // 3D模型节点操作
                return (
                    <ActionItem
                        buttons={[
                            {
                                text: t("describeReverse"),
                                id: "desc-model",
                                onClick: () =>
                                    expands(id, [
                                        {
                                            type: "imageGenTextNode",
                                            data: data,
                                        },
                                    ]),
                            },
                            {
                                text: t("generateVideo"),
                                id: "generate-video",
                                onClick: () =>
                                    expands(id, [
                                        {
                                            type: "imageGenVideoNode",
                                            data: data,
                                        },
                                    ]),
                            },
                        ]}
                    />
                );

            default:
                return null;
        }
    };

    // 执行模式：始终显示播放/停止按钮，不受节点选择影响
    if (isExecuteMode) {
        return (
            <>
                {/* 保存并执行对话框 */}
                <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
                    <DialogContent aria-describedby={undefined}>
                        <DialogHeader>
                            <DialogTitle>
                                {workflowId
                                    ? t("executeWorkflow")
                                    : t("saveWorkflow")}
                            </DialogTitle>
                        </DialogHeader>
                        <p className="text-sm text-muted-foreground mb-4">
                            {workflowId
                                ? t("executeConfirmDescSaved")
                                : t("executeConfirmDescNew")}
                        </p>
                        {/* 预估用时 */}
                        {estimatedTime > 0 && (
                            <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg mb-4">
                                <div className="flex items-center gap-1.5">
                                    <span className="text-sm text-muted-foreground">
                                        {t("estimatedTime")}
                                    </span>
                                    <span className="text-sm font-medium">
                                        {estimatedTime >= 60
                                            ? `${Math.floor(estimatedTime / 60)}分${
                                                  estimatedTime % 60 > 0
                                                      ? `${estimatedTime % 60}秒`
                                                      : ""
                                              }`
                                            : `${estimatedTime}秒`}
                                    </span>
                                </div>
                            </div>
                        )}
                        {/* 新工作流才显示名称和描述输入 */}
                        {!workflowId && (
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="workflow-name">
                                        {t("workflowName")}
                                    </Label>
                                    <Input
                                        id="workflow-name"
                                        value={tempName}
                                        onChange={(e) =>
                                            setTempName(e.target.value)
                                        }
                                        placeholder={t(
                                            "workflowNamePlaceholder",
                                        )}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="workflow-description">
                                        {t("workflowDescription")}
                                    </Label>
                                    <Textarea
                                        id="workflow-description"
                                        value={tempDescription}
                                        onChange={(e) =>
                                            setTempDescription(e.target.value)
                                        }
                                        placeholder={t(
                                            "workflowDescPlaceholder",
                                        )}
                                        rows={3}
                                    />
                                </div>
                            </div>
                        )}
                        <DialogFooter className="mt-4">
                            <DialogClose asChild>
                                <Button variant="outline">{t("cancel")}</Button>
                            </DialogClose>
                            <Button
                                onClick={handleSaveAndExecute}
                                disabled={isSaving}
                            >
                                {isSaving ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        {workflowId
                                            ? t("executing")
                                            : t("saving")}
                                    </>
                                ) : workflowId ? (
                                    t("confirmExecute")
                                ) : (
                                    t("saveAndExecute")
                                )}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <div className="flex items-center justify-center">
                    <div
                        className={cn(
                            "relative flex items-center justify-center",
                            "w-14 h-14 rounded-full",
                        )}
                    >
                        {/* 旋转光条效果 - 只在运行时显示 */}
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

                        {/* 内圈背景 */}
                        <div
                            className={cn(
                                "relative flex items-center justify-center",
                                "border border-gray-200/50 dark:border-gray-500/60",
                                "backdrop-blur-md bg-white/80 dark:bg-gray-800/90",
                                "w-10 h-10 rounded-full",
                            )}
                        >
                            {isRunning ? (
                                // 运行中显示 Siri 风格多彩动态呼吸球
                                <div className="relative w-full h-full rounded-full flex items-center justify-center overflow-hidden bg-white/20">
                                    {/* 多彩流体背景 - 模拟 Siri 动态色 */}
                                    <div
                                        className="absolute inset-[-50%] blur-xl opacity-70 animate-[spin_3s_linear_infinite]"
                                        style={{
                                            background:
                                                "conic-gradient(from 0deg, #22d3ee, #c084fc, #f472b6, #fde047, #4ade80, #22d3ee)",
                                        }}
                                    />

                                    {/* 叠加流动层 - 增加层次感 */}
                                    <div
                                        className="absolute inset-[-50%] blur-lg opacity-50 mix-blend-overlay animate-[spin_4s_linear_infinite_reverse]"
                                        style={{
                                            background:
                                                "conic-gradient(from 180deg, #22d3ee, #c084fc, #f472b6, #fde047, #4ade80, #22d3ee)",
                                        }}
                                    />

                                    {/* 核心呼吸光晕 */}
                                    <div className="absolute inset-1 bg-white/40 rounded-full blur-md animate-pulse" />

                                    {/* 玻璃质感高光 */}
                                    <div className="absolute inset-0 rounded-full" />
                                </div>
                            ) : (
                                // 播放按钮
                                <button
                                    onClick={handleExecuteClick}
                                    className="w-full h-full rounded-full flex flex-col items-center justify-center gap-1 hover:bg-emerald-500/20 transition-colors"
                                >
                                    <Play className="w-6 h-6 text-emerald-500 fill-emerald-500" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </>
        );
    }

    // 如果没有选中节点，显示添加节点选项
    if (selectedNodes.length === 0) {
        // 创作模式：直接显示所有添加节点选项
        return (
            <div
                className="flex items-center justify-center"
                onClick={(e) => e.stopPropagation()}
            >
                <div
                    className={cn(
                        "relative overflow-hidden flex items-center justify-center gap-2",
                        "border border-gray-200/50 dark:border-gray-500/60",
                        "backdrop-blur-md bg-white dark:bg-zinc-800/90",
                        "w-auto h-12 rounded-2xl p-1",
                    )}
                >
                    <div className="flex items-center gap-2">
                        <IconButton
                            icon={Box}
                            tooltip={t("tooltip3D")}
                            onClick={() =>
                                addNodeAtViewportCenter({ type: "addModelNode" })
                            }
                        />
                        <IconButton
                            icon={FileText}
                            tooltip={t("tooltipDocument")}
                            onClick={() =>
                                addNodeAtViewportCenter({ type: "addFileNode" })
                            }
                        />
                        <IconButton
                            icon={Image}
                            tooltip={t("tooltipImage")}
                            onClick={() =>
                                addNodeAtViewportCenter({ type: "addImageNode" })
                            }
                        />
                        <IconButton
                            icon={Type}
                            tooltip={t("tooltipText")}
                            onClick={() =>
                                addNodeAtViewportCenter({ type: "addTextNode" })
                            }
                        />
                        <IconButton
                            icon={Video}
                            tooltip={t("tooltipVideo")}
                            onClick={() =>
                                addNodeAtViewportCenter({ type: "addVideoNode" })
                            }
                        />
                        <IconButton
                            icon={Music}
                            tooltip={t("tooltipAudio")}
                            onClick={() =>
                                addNodeAtViewportCenter({ type: "addAudioNode" })
                            }
                        />
                        <IconButton
                            icon={Link}
                            tooltip={t("tooltipLink")}
                            onClick={() =>
                                addNodeAtViewportCenter({ type: "addLinkNode" })
                            }
                        />
                    </div>
                </div>
            </div>
        );
    }

    // 组合模式或单个节点操作
    // 如果选中的是处理节点（getNodeActions 返回 null），则显示添加节点工具栏
    const nodeActions = comboMode ? getComboActions() : getNodeActions();

    if (nodeActions === null) {
        // 处理节点没有特定操作时，显示添加节点选项
        return (
            <div
                className="flex items-center justify-center"
                onClick={(e) => e.stopPropagation()}
            >
                <div
                    className={cn(
                        "relative overflow-hidden flex items-center justify-center gap-2",
                        "border border-gray-200/50 dark:border-gray-500/60",
                        "backdrop-blur-md bg-white dark:bg-zinc-800/90",
                        "w-auto h-12 rounded-2xl p-1",
                    )}
                >
                    <div className="flex items-center gap-2">
                        <IconButton
                            icon={Box}
                            tooltip={t("tooltip3D")}
                            onClick={() =>
                                addNodeAtViewportCenter({ type: "addModelNode" })
                            }
                        />
                        <IconButton
                            icon={FileText}
                            tooltip={t("tooltipDocument")}
                            onClick={() =>
                                addNodeAtViewportCenter({ type: "addFileNode" })
                            }
                        />
                        <IconButton
                            icon={Image}
                            tooltip={t("tooltipImage")}
                            onClick={() =>
                                addNodeAtViewportCenter({ type: "addImageNode" })
                            }
                        />
                        <IconButton
                            icon={Type}
                            tooltip={t("tooltipText")}
                            onClick={() =>
                                addNodeAtViewportCenter({ type: "addTextNode" })
                            }
                        />
                        <IconButton
                            icon={Video}
                            tooltip={t("tooltipVideo")}
                            onClick={() =>
                                addNodeAtViewportCenter({ type: "addVideoNode" })
                            }
                        />
                        <IconButton
                            icon={Music}
                            tooltip={t("tooltipAudio")}
                            onClick={() =>
                                addNodeAtViewportCenter({ type: "addAudioNode" })
                            }
                        />
                        <IconButton
                            icon={Link}
                            tooltip={t("tooltipLink")}
                            onClick={() =>
                                addNodeAtViewportCenter({ type: "addLinkNode" })
                            }
                        />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex items-center justify-center">{nodeActions}</div>
    );
}
