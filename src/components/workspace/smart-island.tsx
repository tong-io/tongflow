"use client";

/**
 * Smart Island
 *
 * Bottom toolbar that adapts to canvas state:
 *  - execute mode: shows the play / running ball + a save-and-execute dialog
 *  - no selection: shows the add-node icon row
 *  - single node / combo: shows contextual actions from `useNodeActions`
 */

import { useReactFlow } from "@xyflow/react";
import { Box, FileText, Image, Link, Music, Type, Video } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { useShallow } from "zustand/react/shallow";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { ExecutionButton } from "@/components/workspace/execution-button";
import { ExecutionStatusLine } from "@/components/workspace/execution-status-line";
import { SaveExecuteDialog } from "@/components/workspace/save-execute-dialog";
import type { FlowState, PossibleNode } from "@/hooks/use-flow";
import { useFlow } from "@/hooks/use-flow";
import { useNodeActions } from "@/hooks/use-node-actions";
import { useTaskStore } from "@/hooks/use-task";
import { useWorkflowExecution } from "@/hooks/use-workflow-execution";
import { emitTaskCancelRequest } from "@/lib/task/sse-events";
import { cn } from "@/lib/utils";

interface IconButtonProps {
    icon: React.ComponentType<{ className?: string }>;
    tooltip: string;
    onClick?: () => void;
}

function IconButton({ icon: Icon, tooltip, onClick }: IconButtonProps) {
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
}

const selector = (state: FlowState) => ({
    nodes: state.nodes,
    edges: state.edges,
    comboMode: state.comboMode,
    comboSelectedIds: state.comboSelectedIds,
    addNode: state.addNode,
    selectedNodes: state.selectedNodes,
    expands: state.expands,
    compose: state.compose,
    workflowId: state.workflowId,
    workflowName: state.workflowName,
    workflowDescription: state.workflowDescription,
    setWorkflowName: state.setWorkflowName,
    setWorkflowId: state.setWorkflowId,
    setWorkflowDescription: state.setWorkflowDescription,
});

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
        workflowId,
        workflowName,
        workflowDescription,
        setWorkflowName,
        setWorkflowId,
        setWorkflowDescription,
    } = useFlow(useShallow(selector));

    const t = useTranslations("Workspace.smartIsland");
    const tIndex = useTranslations("Index");
    const { screenToFlowPosition } = useReactFlow();

    const workspaceMode = useTaskStore((state) => state.workspaceMode);
    const workflowExecutionStatus = useTaskStore(
        (state) => state.workflowExecutionStatus,
    );
    const isExecuteMode = workspaceMode === "execute";
    const isRunning = workflowExecutionStatus === "running";

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

    const {
        showSaveDialog,
        setShowSaveDialog,
        tempName,
        setTempName,
        tempDescription,
        setTempDescription,
        isSaving,
        handleExecuteClick,
        handleSaveAndExecute,
    } = useWorkflowExecution({
        nodes,
        edges,
        workflowId,
        workflowName,
        workflowDescription,
        setWorkflowId,
        setWorkflowName,
        setWorkflowDescription,
        defaultWorkflowName: tIndex("title"),
        t,
    });

    const { comboActions, singleActions } = useNodeActions({
        nodes,
        selectedNodes,
        comboMode,
        comboSelectedIds,
        expands,
        compose,
        t,
    });

    // Execute mode: always show play/running button regardless of node selection
    if (isExecuteMode) {
        return (
            <>
                <SaveExecuteDialog
                    open={showSaveDialog}
                    onOpenChange={setShowSaveDialog}
                    isNewWorkflow={!workflowId}
                    tempName={tempName}
                    tempDescription={tempDescription}
                    onNameChange={setTempName}
                    onDescriptionChange={setTempDescription}
                    onConfirm={handleSaveAndExecute}
                    isSaving={isSaving}
                />
                <div className="flex flex-col items-center gap-2">
                    <ExecutionStatusLine />
                    <ExecutionButton
                        isRunning={isRunning}
                        onExecute={handleExecuteClick}
                        onCancel={() => emitTaskCancelRequest(null)}
                    />
                </div>
            </>
        );
    }

    const addToolbar = (
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

    // No nodes selected -> add-node toolbar
    if (selectedNodes.length === 0) {
        return addToolbar;
    }

    // Combo or single-node actions; fall back to the add toolbar if there are no
    // applicable actions (e.g. a selected processing node)
    const actions = comboMode ? comboActions : singleActions;
    if (actions === null) {
        return addToolbar;
    }

    return <div className="flex items-center justify-center">{actions}</div>;
}
