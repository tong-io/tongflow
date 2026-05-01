"use client";

/**
 * Smart Island component
 * Bottom intelligent toolbar that dynamically shows available actions based on selected nodes
 * All animations have been removed (following tongflow conventions)
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
import { logger } from "@/lib/logger";
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

// Button ID definitions
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

// Button configuration type
interface ButtonConfig {
    text: string;
    onClick: () => void;
    id?: string;
    nodeType?: string;
}

// Action container component
const ActionContainer = ({ children }: { children: React.ReactNode }) => (
    <div className="flex items-center justify-center gap-2 border border-white/20 dark:border-gray-500/30 bg-white dark:bg-zinc-800/90 h-[48px] w-max rounded-full px-4">
        {children}
    </div>
);

// Divider component
const Divider = () => <div className="h-5 w-px bg-gray-200 dark:bg-gray-700" />;

// Text button component (no animation)
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

// Icon button component (with Tooltip)
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

// Action item component
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
    const [showSaveDialog, setShowSaveDialog] = useState(false); // Save dialog shown before execution
    const [tempName, setTempName] = useState(""); // Temporary workflow name
    const [tempDescription, setTempDescription] = useState(""); // Temporary workflow description
    const [isSaving, setIsSaving] = useState(false); // Saving in progress
    const isExecuteMode = workspaceMode === "execute";
    const isRunning = workflowExecutionStatus === "running";

    // Get the getFeatureByName method from the features store
    const getFeatureByName = useFeaturesStore(
        (state) => state.getFeatureByName,
    );

    // Compute estimated cost and processing time (based on node type; not recalculated on drag)
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

    // Execute a single node
    const executeNode = useCallback(
        async (
            nodeId: string,
            nodeInfo: NodeExecutionInfo,
        ): Promise<boolean> => {
            logger.debug(
                `[SmartIsland] Executing node: ${nodeId} (type: ${nodeInfo.type})`,
            );

            // Get the node's compute function
            const compute = getCompute(nodeId);

            if (compute) {
                try {
                    // Call the node's compute method
                    await compute();
                    logger.debug(
                        `[SmartIsland] Node ${nodeId} compute completed`,
                    );
                    return true;
                } catch (error) {
                    logger.error(
                        `[SmartIsland] Node ${nodeId} compute failed:`,
                        error,
                    );
                    return false;
                }
            } else {
                // Nodes without a compute function (e.g. data nodes) are marked as completed immediately
                logger.debug(
                    `[SmartIsland] Node ${nodeId} has no compute function, marking as completed`,
                );
                return true;
            }
        },
        [getCompute],
    );

    // SSE connection reference
    const [eventSourceRef, setEventSourceRef] = useState<EventSource | null>(
        null,
    );

    // Execute-mode play button click handler - calls backend API and streams updates via SSE
    // overrideWorkflowId: the workflowId passed after saving
    const handleExecute = useCallback(
        async (overrideWorkflowId: number) => {
            logger.debug(
                "[SmartIsland] Execute button clicked - starting backend workflow execution (SSE)",
            );

            // Clear previous execution state
            clearNodeExecutionStatus();
            setWorkflowExecutionStatus("running");

            try {
                logger.debug(
                    "[SmartIsland] Using workflowId:",
                    overrideWorkflowId,
                );

                // Call the Next.js API to create a task - only pass workflowId; backend fetches the executable from the database
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
                    // Attempt to parse the error response
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
                logger.debug("[SmartIsland] Task created:", taskId);
                setCurrentTaskId(taskId);

                // 4. Connect SSE for real-time execution progress
                const sseUrl = getTaskWaitUrl(taskId);
                logger.debug("[SmartIsland] Connecting to SSE:", sseUrl);

                const eventSource = new EventSource(sseUrl);
                setEventSourceRef(eventSource);

                eventSource.onopen = () => {
                    logger.debug("[SmartIsland SSE] Connection opened");
                    // Emit SSE connection event to show the progress toast
                    emitSSEConnected(taskId);
                };

                eventSource.onmessage = (event) => {
                    try {
                        const message = JSON.parse(event.data) as {
                            status: string;
                            nodeId?: string;
                            data?: Record<string, unknown>;
                        };
                        logger.debug("[SmartIsland SSE] Received:", message);

                        // Emit SSE message event to update the progress toast
                        emitSSETaskMessage({
                            id: taskId,
                            status: message.status as any,
                            nodeId: message.nodeId || null,
                            data: message.data as any,
                        });

                        switch (message.status) {
                            // Workflow started
                            case WorkflowStatus.WORKFLOW_STARTED:
                            case "WORKFLOW_START": // Legacy status compat
                                logger.debug(
                                    "[SmartIsland] Workflow started:",
                                    message.data?.totalNodes,
                                    "nodes",
                                );
                                break;

                            // Node started / running
                            case NodeStatus.NODE_STARTED:
                            case NodeStatus.NODE_RUNNING:
                            case "NODE_START": // Legacy status compat
                                if (message.nodeId) {
                                    logger.debug(
                                        "[SmartIsland] Node started:",
                                        message.nodeId,
                                    );
                                    setNodeExecutionStatus(
                                        message.nodeId,
                                        "running",
                                    );
                                }
                                break;

                            case "NODE_PROGRESS": // Retained for progress updates
                                if (message.nodeId) {
                                    logger.debug(
                                        "[SmartIsland] Node progress:",
                                        message.nodeId,
                                        message.data?.progress,
                                    );
                                }
                                break;

                            // Node completed
                            case NodeStatus.NODE_COMPLETED:
                            case "NODE_COMPLETE": // Legacy status compat
                                if (message.nodeId) {
                                    logger.debug(
                                        "[SmartIsland] Node completed:",
                                        message.nodeId,
                                        message.data,
                                    );
                                    setNodeExecutionStatus(
                                        message.nodeId,
                                        "completed",
                                    );

                                    // Update node data (fileKeys, texts, etc.)
                                    const output = message.data?.output as
                                        | {
                                              fileKeys?: string[];
                                              texts?: string[];
                                          }
                                        | undefined;
                                    if (output) {
                                        // List of data node types
                                        const DATA_NODE_TYPES = [
                                            "textNode",
                                            "imageNode",
                                            "videoNode",
                                            "audioNode",
                                            "fileNode",
                                            "modelNode",
                                        ];

                                        // Check whether a node is a data node
                                        const isDataNodeType = (
                                            type?: string,
                                        ) =>
                                            type &&
                                            DATA_NODE_TYPES.includes(type);

                                        /**
                                         * Update direct downstream data nodes
                                         *
                                         * Workflow data propagation mechanism:
                                         * - A processing node (e.g. image-gen-video) produces output after execution
                                         * - Output data is written only to direct downstream data nodes (e.g. videoNode)
                                         * - Subsequent processing nodes read their inputs from upstream data nodes via paramMappings
                                         *
                                         * Only the immediate next-layer data nodes are updated; propagation is not recursive
                                         */
                                        const updateDownstreamDataNodes = (
                                            sourceNodeId: string,
                                            data: {
                                                fileKeys?: string[];
                                                texts?: string[];
                                            },
                                        ) => {
                                            // Get all direct downstream edges
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

                                                // Only update data nodes
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
                                                    logger.debug(
                                                        "[SmartIsland] Updated downstream data node:",
                                                        edge.target,
                                                        newDownstreamData,
                                                    );
                                                }
                                            }
                                        };

                                        // 1. Update the current node's own data
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
                                            logger.debug(
                                                "[SmartIsland] Updated node data:",
                                                message.nodeId,
                                                newData,
                                            );
                                        }

                                        // 2. Recursively update all downstream data nodes
                                        updateDownstreamDataNodes(
                                            message.nodeId,
                                            output,
                                        );
                                    }
                                }
                                break;

                            // Node failed
                            case NodeStatus.NODE_FAILED:
                                if (message.nodeId) {
                                    logger.debug(
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

                            // Workflow completed
                            case WorkflowStatus.WORKFLOW_COMPLETED:
                            case TaskStatus.COMPLETED:
                            case "FINISHED": // Legacy status compat
                                logger.debug(
                                    "[SmartIsland] ✅ Workflow completed successfully!",
                                );
                                logger.debug(
                                    "[SmartIsland] Outputs:",
                                    message.data?.outputs,
                                );
                                setWorkflowExecutionStatus("completed");
                                // Double-safety: frontend also updates task status + saves materials (idempotent)
                                saveFromTask({
                                    taskId: taskId,
                                    status: message.status,
                                    data: message.data,
                                })
                                    .then((result) => {
                                        logger.debug(
                                            "[SmartIsland] Frontend backup save result:",
                                            result,
                                        );
                                    })
                                    .catch((err) => {
                                        logger.warn(
                                            "[SmartIsland] Frontend backup save failed:",
                                            err,
                                        );
                                    });
                                eventSource.close();
                                setEventSourceRef(null);
                                setCurrentTaskId(null);
                                // Refresh balance (workflow completion deducts credits)
                                break;

                            // Workflow cancelled
                            case WorkflowStatus.WORKFLOW_CANCELLED:
                            case TaskStatus.CANCELLED:
                                logger.debug(
                                    "[SmartIsland] ⚠️ Workflow cancelled by user",
                                );
                                // Double-safety: frontend also updates task status
                                saveFromTask({
                                    taskId: taskId,
                                    status: message.status,
                                    data: message.data,
                                }).catch(() => {});
                                // Clear the cancellation timeout timer
                                if ((window as any).__cancelTimeoutId) {
                                    clearTimeout(
                                        (window as any).__cancelTimeoutId,
                                    );
                                    (window as any).__cancelTimeoutId = null;
                                }
                                clearNodeExecutionStatus(); // Clear node execution status
                                setWorkflowExecutionStatus("idle");
                                eventSource.close();
                                setEventSourceRef(null);
                                setCurrentTaskId(null);
                                // Stop the executor
                                if (executorRef) {
                                    executorRef.stop();
                                    setExecutorRef(null);
                                }
                                // Refresh balance (workflow cancellation refunds credits)
                                break;

                            // Workflow failed
                            case WorkflowStatus.WORKFLOW_FAILED:
                            case TaskStatus.FAILED:
                            case "ERROR": // Legacy status compat
                                logger.debug(
                                    "[SmartIsland] ❌ Workflow failed:",
                                    message.data?.error,
                                );
                                // Double-safety: frontend also updates task status
                                saveFromTask({
                                    taskId: taskId,
                                    status: message.status,
                                    data: message.data,
                                }).catch(() => {});
                                setWorkflowExecutionStatus("failed");
                                eventSource.close();
                                setEventSourceRef(null);
                                setCurrentTaskId(null);
                                // Refresh balance (workflow failure refunds credits)
                                break;

                            default:
                                logger.debug(
                                    "[SmartIsland SSE] Unknown status:",
                                    message.status,
                                );
                        }
                    } catch (e) {
                        logger.error(
                            "[SmartIsland SSE] Failed to parse message:",
                            e,
                        );
                    }
                };

                eventSource.onerror = (error) => {
                    logger.error("[SmartIsland SSE] Connection error:", error);
                    setWorkflowExecutionStatus("failed");
                    eventSource.close();
                    setEventSourceRef(null);
                };
            } catch (error) {
                logger.error("[SmartIsland] Execution failed:", error);
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

    // Execute button click - always shows the save dialog (latest state must be saved before execution)
    const handleExecuteClick = useCallback(() => {
        // Always open the save dialog; the latest workflow state is saved before execution
        setTempName(workflowName || tIndex("title"));
        setTempDescription(workflowDescription || "");
        setShowSaveDialog(true);
    }, [workflowName, workflowDescription]);

    // Save and execute the workflow
    const handleSaveAndExecute = useCallback(async () => {
        // Saved workflows use the existing name; new workflows require a name to be entered
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
            // Generate the executable on the frontend (requires runtime registry configuration)
            const executable = exportWorkflow(nodes, edges, {
                name: effectiveName,
                description: effectiveDescription || "",
                includeOriginalFlow: false,
            });

            const workflowData = {
                ...(workflowId ? { workflowId } : {}), // Pass ID for saved workflows to perform an update
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

            // Close the dialog and execute
            setShowSaveDialog(false);

            // Execute immediately, passing the newly saved workflowId (avoids stale closure issue from state update delay)
            handleExecute(result.workflowId);
        } catch (error) {
            logger.error("保存失败:", error);
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

    // Stop execution
    const handleStop = useCallback(async () => {
        logger.debug("[SmartIsland] Stop button clicked - stopping workflow execution");

        const taskIdToCancel = currentTaskId;

        // Immediately show “cancelling” status
        if (taskIdToCancel) {
            emitSSETaskMessage({
                id: taskIdToCancel,
                status: TaskStatus.RUNNING,
                nodeId: null,
                data: { message: "取消中..." },
            });
        }

        // Call the backend stop endpoint
        if (taskIdToCancel) {
            try {
                const response = await fetch(getTaskStopUrl(), {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ taskId: taskIdToCancel }),
                });
                logger.debug(
                    "[SmartIsland] Stop request sent for task:",
                    taskIdToCancel,
                );

                if (response.ok) {
                    // Backend successfully handled the cancel request
                    // Wait for the SSE cancel message; if not received within 10 seconds, emit manually
                    const timeoutId = setTimeout(() => {
                        logger.debug(
                            "[SmartIsland] Timeout waiting for CANCELLED message, emitting manually",
                        );
                        // Manually emit cancel event to Toast
                        emitSSETaskMessage({
                            id: taskIdToCancel,
                            status: TaskStatus.CANCELLED,
                            nodeId: null,
                            data: { message: "任务已取消" },
                        });
                        // Clean up state
                        if (eventSourceRef) {
                            eventSourceRef.close();
                            setEventSourceRef(null);
                        }
                        if (executorRef) {
                            executorRef.stop();
                        }
                        clearNodeExecutionStatus(); // Clear node execution status
                        setWorkflowExecutionStatus("idle");
                        setExecutorRef(null);
                        setCurrentTaskId(null);
                    }, 10000); // 10-second timeout

                    // Store timeoutId so it can be cleared when the CANCELLED message arrives
                    (window as any).__cancelTimeoutId = timeoutId;
                } else {
                    throw new Error(`Stop request failed: ${response.status}`);
                }
            } catch (error) {
                logger.error(
                    "[SmartIsland] Failed to send stop request:",
                    error,
                );
                // If sending fails, clean up state and manually emit the cancel event
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
                clearNodeExecutionStatus(); // Clear node execution status
                setWorkflowExecutionStatus("idle");
                setExecutorRef(null);
                setCurrentTaskId(null);
            }
        } else {
            // No taskId - clean up directly
            if (eventSourceRef) {
                eventSourceRef.close();
                setEventSourceRef(null);
            }
            if (executorRef) {
                executorRef.stop();
            }
            clearNodeExecutionStatus(); // Clear node execution status
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

    // Listen for cancel request events (from TaskProgressToast) - only handles workflow cancellation
    useEffect(() => {
        const handleCancelRequest = () => {
            // Only handle when a workflow is executing (currentTaskId is set)
            if (currentTaskId) {
                logger.debug(
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

    // Get combo mode actions
    const getComboActions = () => {
        logger.debug(comboSelectedIds);
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

        // Multiple video nodes
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
        // Multiple image nodes
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

            // For 2-14 images, add image fusion option (Gemini 3 Pro supports up to 14 reference images)
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

                // For exactly two images, add the first/last frame video generation option
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
        // Multiple text nodes
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
        // Multiple audio nodes
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
        // Video + image
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
        // Video + audio
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
        // Image + audio
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
        // Multiple images + one text (2-14 images with prompt-based fusion)
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
        // Image + text
        else if (counts.imageNode === 1 && counts.textNode === 1) {
            // Get the text content of the text node
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
                                        // Pass the text node's content into the query field
                                        query: textContent,
                                    },
                                }),
                        },
                    ]}
                />
            );
        }
        // Text + audio
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
        // Text + video
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
        // Image + video + audio
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

    // Get single-node actions
    const getNodeActions = () => {
        if (selectedNodes.length !== 1) {
            return null;
        }
        const { type, id, data } = selectedNodes[0]!;

        switch (type) {
            case "textNode":
                // Actions for multiple texts
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
                // Actions for a single text
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
                // If this is an audio group, add the split action
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
                // If this is a video group, add extra actions
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
                                text: t("extractAudioTrack"),
                                id: "extract-audio-track",
                                nodeType: "extractAudioNode",
                                onClick: () =>
                                    expands(id, [
                                        {
                                            type: "extractAudioNode",
                                            data: data,
                                        },
                                    ]),
                            },
                            {
                                text: t("splitVideoAudio"),
                                id: "split-video-audio",
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
                // If this is an image group, add the split action
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
                // File node actions
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
                // 3D model node actions
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

    // Execute mode: always show play/stop button regardless of node selection
    if (isExecuteMode) {
        return (
            <>
                {/* Save and execute dialog */}
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
                        {/* Estimated time */}
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
                        {/* Name and description inputs are only shown for new workflows */}
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
                        {/* Rotating light-bar effect - only shown while running */}
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

                        {/* Inner circle background */}
                        <div
                            className={cn(
                                "relative flex items-center justify-center",
                                "border border-gray-200/50 dark:border-gray-500/60",
                                "backdrop-blur-md bg-white/80 dark:bg-gray-800/90",
                                "w-10 h-10 rounded-full",
                            )}
                        >
                            {isRunning ? (
                                // Show Siri-style multicolor breathing ball while running
                                <div className="relative w-full h-full rounded-full flex items-center justify-center overflow-hidden bg-white/20">
                                    {/* Multicolor fluid background - simulates Siri dynamic colors */}
                                    <div
                                        className="absolute inset-[-50%] blur-xl opacity-70 animate-[spin_3s_linear_infinite]"
                                        style={{
                                            background:
                                                "conic-gradient(from 0deg, #22d3ee, #c084fc, #f472b6, #fde047, #4ade80, #22d3ee)",
                                        }}
                                    />

                                    {/* Overlay flow layer - adds depth */}
                                    <div
                                        className="absolute inset-[-50%] blur-lg opacity-50 mix-blend-overlay animate-[spin_4s_linear_infinite_reverse]"
                                        style={{
                                            background:
                                                "conic-gradient(from 180deg, #22d3ee, #c084fc, #f472b6, #fde047, #4ade80, #22d3ee)",
                                        }}
                                    />

                                    {/* Core breathing glow */}
                                    <div className="absolute inset-1 bg-white/40 rounded-full blur-md animate-pulse" />

                                    {/* Glass-effect highlight */}
                                    <div className="absolute inset-0 rounded-full" />
                                </div>
                            ) : (
                                // Play button
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

    // If no nodes are selected, show the add-node options
    if (selectedNodes.length === 0) {
        // Creation mode: directly show all add-node options
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

    // Combo mode or single-node actions
    // If the selected node is a processing node (getNodeActions returns null), show the add-node toolbar
    const nodeActions = comboMode ? getComboActions() : getNodeActions();

    if (nodeActions === null) {
        // Processing node has no specific actions — show the add-node options
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
