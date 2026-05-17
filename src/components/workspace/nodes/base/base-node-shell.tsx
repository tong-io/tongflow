/**
 * Pure UI shell for canvas nodes (headers, plugin picker, execute affordances,
 * loading overlay, comments). Execution wiring lives in `AbiNodeShell` or callers
 * that pass explicit props.
 */

import { useNodeId, useStore } from "@xyflow/react";
import { Wand2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { HTMLAttributes, ReactNode } from "react";
import { forwardRef } from "react";

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
import { Button } from "@/components/ui/button";
import { isModalityNode } from "@/constants/modality-nodes";
import useFlow from "@/hooks/use-flow";
import { cn } from "@/lib/utils";
import type { BaseNodeData } from "@/types/nodes";

import { NodeComboButton } from "./node-combo-button";
import { NodeCommentBox } from "./node-comment-box";
import {
    NodeHeader,
    NodeHeaderActions,
    NodeHeaderIcon,
    NodeHeaderMenuAction,
    NodeHeaderTitle,
} from "./node-header";
import { NodeLoadingOverlay } from "./node-loading-overlay";
import { NodePluginIdSelect } from "./node-plugin-id-select";

/* ------------------------------------------------------------------ */
/* Props                                                               */
/* ------------------------------------------------------------------ */

export type BaseNodeShellProps = HTMLAttributes<HTMLDivElement> & {
    selected?: boolean;
    count?: number;
    data?: BaseNodeData;
    children?: ReactNode;
    overlay?: ReactNode;

    // ----- Header / chrome -----
    title?: string;
    icon?: ReactNode;
    headerActions?: ReactNode;

    // ----- Execute state -----
    loading?: boolean;
    elapsedSeconds?: number;
    /** Live runner status text shown above the spinner. */
    progressLabel?: string | null;
    /** When true, hides the execute button (already in execute mode). */
    isExecuteMode?: boolean;
    /**
     * When set, the shell renders the execute button at the bottom and
     * wires it to this callback. If omitted, no execute button is rendered.
     */
    onExecute?: () => void;
    executeLabel?: string;
    executeIcon?: ReactNode;
    executeDisabled?: boolean;
    /** Treated as input node — execute button stays visible in execute mode. */
    isInputNode?: boolean;

    // ----- Plugin selector -----
    feature?: string;
    showPluginSelect?: boolean;
    missingPluginOpen?: boolean;
    setMissingPluginOpen?: (open: boolean) => void;
};

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export const BaseNodeShell = forwardRef<HTMLDivElement, BaseNodeShellProps>(
    (
        {
            className,
            selected,
            count,
            data,
            children,
            overlay,
            title,
            icon,
            headerActions,
            loading = false,
            elapsedSeconds = 0,
            progressLabel = null,
            isExecuteMode = false,
            onExecute,
            executeLabel,
            executeIcon,
            executeDisabled,
            isInputNode,
            feature,
            showPluginSelect = true,
            missingPluginOpen = false,
            setMissingPluginOpen,
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

        const renderPluginSelect = showPluginSelect && !!feature;
        const renderExecuteButton =
            !!onExecute && (!isExecuteMode || !!isInputNode);

        return (
            <div className="relative">
                {/* Missing plugin alert */}
                {setMissingPluginOpen && (
                    <AlertDialog
                        open={missingPluginOpen}
                        onOpenChange={setMissingPluginOpen}
                    >
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>
                                    {t("missingImplTitle")}
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                    {t("missingImplDescription")}
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
                )}

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
                                isModalityNode(nodeType) &&
                                isInCombo &&
                                "ring-2 ring-primary shadow-lg shadow-primary/20",
                            className,
                        )}
                    >
                        <NodeLoadingOverlay
                            loading={loading}
                            elapsedSeconds={elapsedSeconds}
                            progressLabel={progressLabel}
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
                        {title && (
                            <NodeHeader>
                                {icon && (
                                    <NodeHeaderIcon>{icon}</NodeHeaderIcon>
                                )}
                                <NodeHeaderTitle className="flex items-center gap-2">
                                    {title}
                                </NodeHeaderTitle>
                                <NodeHeaderActions>
                                    {headerActions}
                                    <NodeHeaderMenuAction
                                        label={t("moreActions")}
                                    />
                                </NodeHeaderActions>
                            </NodeHeader>
                        )}

                        {/* Auto plugin select */}
                        {renderPluginSelect && (
                            <div className="p-4 pb-0">
                                <NodePluginIdSelect
                                    nodeSlot={feature}
                                    data={data ?? { feature }}
                                />
                            </div>
                        )}

                        {/* Content */}
                        <div className="relative z-0">{children}</div>

                        {/* Execute button */}
                        {renderExecuteButton && (
                            <div className="p-4 pt-0">
                                <Button
                                    onClick={onExecute}
                                    disabled={!!executeDisabled || loading}
                                    className="w-full h-10"
                                >
                                    <div className="flex items-center justify-center gap-2">
                                        {executeIcon ?? (
                                            <Wand2 className="h-4 w-4" />
                                        )}
                                        <span>
                                            {executeLabel ?? t("execute")}
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

                        {/* Combo mode selection button */}
                        <NodeComboButton />
                    </div>
                </div>
            </div>
        );
    },
);

BaseNodeShell.displayName = "BaseNodeShell";
