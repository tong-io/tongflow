/**
 * Pure UI shell for canvas nodes (headers, plugin picker, execute affordances,
 * loading overlay, comments). Execution wiring lives in `AbiNodeShell` or callers
 * that pass explicit props.
 */

import { useNodeId, useStore } from "@xyflow/react";
import { AlertCircle, SkipForward, Wand2 } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";
import { forwardRef } from "react";
import { useTranslations } from "use-intl";
import type { BaseNodeData } from "../../../core";
import { isModalityNode } from "../../../core";
import useFlow from "../../hooks/use-flow";
import type { NodeRunProgress } from "../../hooks/use-task";
import { cn } from "../../lib/utils";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "../../ui/alert-dialog";
import { Button } from "../../ui/button";

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
import { NodePluginModelSelect } from "./node-plugin-model-select";
import { NodePluginParams } from "./node-plugin-params";
import {
    NodeRunControlMenuItems,
    useNodeRunControls,
} from "./node-run-controls";
import { NodeThinkingBubble } from "./node-thinking-bubble";

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
    /** Streamed reasoning shown in the auto-scrolling bubble beside the node. */
    thinkingText?: string | null;
    /**
     * Host workflow-runner detail for this node: progress fraction, model
     * download (shown while `loading`), the failure message (shown after)
     * or the skipped state (greyed out).
     */
    runProgress?: NodeRunProgress | null;
    /** When true, hides the execute button (already in execute mode). */
    isExecuteMode?: boolean;
    /**
     * When set, the shell renders the execute button at the bottom and
     * wires it to this callback. If omitted, no execute button is rendered.
     */
    onExecute?: () => void;
    /**
     * When set while loading, the loading overlay exposes a cancel affordance
     * wired to this callback (cancels the node's in-flight tasks).
     */
    onCancel?: () => void;
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
            thinkingText = null,
            runProgress = null,
            isExecuteMode = false,
            onExecute,
            onCancel,
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

        const runControls = useNodeRunControls(nodeId, feature);
        const hasRunControls =
            !!runControls && (runControls.canSkip || runControls.canReplace);
        const skipped = !loading && runProgress?.skipped !== undefined;
        const skippedReason = (() => {
            switch (runProgress?.skipped) {
                case "skipped by user":
                    return t("runSkippedByUser");
                case "upstream skipped":
                    return t("runSkippedUpstream");
                case "upstream failed":
                    return t("runSkippedUpstreamFailed");
                default:
                    return runProgress?.skipped || null;
            }
        })();

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
                            skipped &&
                                "border-dashed border-gray-300 bg-gray-50 dark:border-gray-600 dark:bg-gray-900",
                            className,
                        )}
                    >
                        <NodeLoadingOverlay
                            loading={loading}
                            elapsedSeconds={elapsedSeconds}
                            progressLabel={progressLabel}
                            progressFraction={runProgress?.fraction ?? null}
                            download={runProgress?.download ?? null}
                            onCancel={onCancel}
                        />

                        <NodeThinkingBubble
                            text={thinkingText}
                            visible={loading}
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
                                    >
                                        {hasRunControls && runControls ? (
                                            <NodeRunControlMenuItems
                                                controls={runControls}
                                            />
                                        ) : null}
                                    </NodeHeaderMenuAction>
                                </NodeHeaderActions>
                            </NodeHeader>
                        )}

                        {/* Auto plugin select */}
                        {renderPluginSelect && (
                            <div className="p-4 pb-0 space-y-2">
                                <NodePluginIdSelect
                                    nodeSlot={feature}
                                    data={data ?? { feature }}
                                />
                                <NodePluginModelSelect
                                    nodeSlot={feature}
                                    data={data ?? { feature }}
                                />
                                <NodePluginParams
                                    nodeSlot={feature}
                                    data={data ?? { feature }}
                                />
                            </div>
                        )}

                        {/* Workflow-runner failure */}
                        {!loading && runProgress?.error && (
                            <div
                                className="mx-4 mt-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
                                title={runProgress.error}
                            >
                                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                <span className="line-clamp-3 break-words">
                                    {runProgress.error}
                                </span>
                            </div>
                        )}

                        {/* Workflow-runner skip */}
                        {skipped && (
                            <div
                                className="mx-4 mt-3 flex items-center gap-2 rounded-md border border-gray-200 bg-gray-100 px-2 py-1.5 text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
                                title={runProgress?.skipped || undefined}
                            >
                                <SkipForward className="h-3.5 w-3.5 shrink-0" />
                                <span className="font-medium">
                                    {t("runSkipped")}
                                </span>
                                {skippedReason && (
                                    <span className="truncate">
                                        · {skippedReason}
                                    </span>
                                )}
                            </div>
                        )}

                        {/* Content */}
                        <div
                            className={cn(
                                "relative z-0",
                                skipped && "opacity-50 grayscale",
                            )}
                        >
                            {children}
                        </div>

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
