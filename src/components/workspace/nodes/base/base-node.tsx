import type { HTMLAttributes, ReactNode } from "react";
import { forwardRef } from "react";
import { Wand2 } from "lucide-react";
import { Handle, Position, useNodeId, useStore } from "@xyflow/react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
import useFlow from "@/hooks/use-flow";
import { useNodeExecution } from "@/hooks/use-node-execution";
import type { NodeExecutionConfig } from "@/utils/node-execution-config";
import {
    NodeHeader,
    NodeHeaderActions,
    NodeHeaderIcon,
    NodeHeaderMenuAction,
    NodeHeaderTitle,
} from "./node-header";
import { NodeLoadingOverlay } from "./node-loading-overlay";
import { NodeCommentBox } from "./node-comment-box";
import { NodeComboButton } from "./node-combo-button";
import { NodePluginIdSelect } from "./node-plugin-id-select";
import { useTranslations } from "next-intl";
import { isModalNode } from "@/constants/modal-nodes";
import type { BaseNodeData } from "@/types/nodes";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type BaseNodeProps = HTMLAttributes<HTMLDivElement> & {
    selected?: boolean;
    count?: number;
    data?: BaseNodeData;
    workflowConfig?: Omit<NodeExecutionConfig, "nodeType">;
    children?: ReactNode;
    overlay?: ReactNode;
};

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export const BaseNode = forwardRef<HTMLDivElement, BaseNodeProps>(
    (
        {
            className,
            selected,
            count,
            data,
            workflowConfig,
            children,
            overlay,
            ...props
        },
        ref,
    ) => {
        const nodeId = useNodeId();
        const t = useTranslations("Workspace.nodes.base");

        const comboMode = useFlow((s) => s.comboMode);
        const isInCombo = useFlow((s) =>
            nodeId ? s.isInCombo(nodeId) : false,
        );
        const nodeType = useStore((state) => {
            const node = state.nodeLookup.get(nodeId ?? "");
            return node?.type;
        });

        const {
            loading,
            elapsedSeconds,
            executeNew,
            isExecuteMode,
            feature,
            missingPluginOpen,
            setMissingPluginOpen,
        } = useNodeExecution({ workflowConfig, data });

        const autoHandles = workflowConfig?.handles !== false;
        const autoPluginSelect =
            workflowConfig?.showPluginSelect !== false && !!feature;

        return (
            <div className="relative">
                {/* Missing plugin alert */}
                <AlertDialog
                    open={missingPluginOpen}
                    onOpenChange={setMissingPluginOpen}
                >
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>
                                Missing Implementation
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                                Please select a plugin implementation in this
                                node before running.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>
                                {t("cancel")}
                            </AlertDialogCancel>
                            <AlertDialogAction>
                                {t("confirm")}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                {/* Comment box above the node */}
                <NodeCommentBox />

                <div className="relative">
                    <div
                        ref={ref}
                        {...props}
                        className={cn(
                            "relative min-h-20 min-w-64 max-w-96 rounded-lg bg-white shadow-lg border border-gray-200",
                            "dark:bg-gray-800 dark:border-gray-700",
                            selected &&
                                !loading &&
                                !isInCombo &&
                                "ring-2 ring-blue-500 shadow-xl",
                            comboMode &&
                                isModalNode(nodeType) &&
                                isInCombo &&
                                "ring-2 ring-primary shadow-lg shadow-primary/20",
                            className,
                        )}
                    >
                        <NodeLoadingOverlay
                            loading={loading}
                            elapsedSeconds={elapsedSeconds}
                        />

                        {/* Stack effect background cards */}
                        {count !== undefined && count > 1 && (
                            <>
                                <div
                                    className="absolute inset-0 -z-10 rounded-lg bg-white shadow-sm dark:bg-gray-800"
                                    style={{
                                        top: "4px",
                                        left: "4px",
                                        right: "-4px",
                                        bottom: "-4px",
                                    }}
                                />
                                {count > 2 && (
                                    <div
                                        className="absolute inset-0 -z-20 rounded-lg bg-white shadow-sm dark:bg-gray-800"
                                        style={{
                                            top: "8px",
                                            left: "8px",
                                            right: "-8px",
                                            bottom: "-8px",
                                        }}
                                    />
                                )}
                            </>
                        )}

                        {/* Count badge */}
                        {count !== undefined && count > 1 && (
                            <div className="absolute -right-2 -top-2 z-20 flex h-6 min-w-[24px] items-center justify-center rounded-full bg-blue-500 px-2 text-xs font-semibold text-white shadow-md">
                                {count}
                            </div>
                        )}

                        {/* Header */}
                        {workflowConfig?.title && (
                            <NodeHeader>
                                {workflowConfig.icon && (
                                    <NodeHeaderIcon>
                                        {workflowConfig.icon}
                                    </NodeHeaderIcon>
                                )}
                                <NodeHeaderTitle className="flex items-center gap-2">
                                    {workflowConfig.title}
                                </NodeHeaderTitle>
                                <NodeHeaderActions>
                                    {workflowConfig.headerActions}
                                    <NodeHeaderMenuAction
                                        label={t("moreActions")}
                                    />
                                </NodeHeaderActions>
                            </NodeHeader>
                        )}

                        {/* Auto plugin select */}
                        {autoPluginSelect && (
                            <div className="p-4 pb-0">
                                <NodePluginIdSelect
                                    nodeSlot={feature}
                                    data={
                                        data ?? {
                                            feature,
                                        }
                                    }
                                />
                            </div>
                        )}

                        {/* Content */}
                        <div className="relative z-0">{children}</div>

                        {/* Execute button */}
                        {workflowConfig?.getPrompts &&
                            (!isExecuteMode || workflowConfig?.isInputNode) && (
                                <div className="p-4 pt-0">
                                    <Button
                                        onClick={executeNew}
                                        disabled={
                                            workflowConfig.executeDisabled ||
                                            loading
                                        }
                                        className="w-full h-10"
                                    >
                                        <div className="flex items-center justify-center gap-2">
                                            {workflowConfig.executeIcon ?? (
                                                <Wand2 className="h-4 w-4" />
                                            )}
                                            <span>
                                                {workflowConfig.executeLabel ??
                                                    t("execute")}
                                            </span>
                                        </div>
                                    </Button>
                                </div>
                            )}

                        {/* Overlay */}
                        {overlay && (
                            <div className="absolute inset-0 z-[60]">
                                {overlay}
                            </div>
                        )}

                        {/* Auto handles */}
                        {autoHandles && (
                            <>
                                <Handle
                                    type="target"
                                    position={Position.Left}
                                    id="a"
                                    isConnectable={true}
                                />
                                <Handle
                                    type="source"
                                    position={Position.Right}
                                    id="b"
                                    isConnectable={true}
                                />
                            </>
                        )}

                        {/* Combo mode selection button */}
                        <NodeComboButton />
                    </div>
                </div>
            </div>
        );
    },
);

BaseNode.displayName = "BaseNode";
