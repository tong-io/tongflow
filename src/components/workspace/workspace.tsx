"use client";

/**
 * Workspace — the application shell around the canvas.
 *
 * Owns everything that is not the canvas itself: local persistence and
 * restore, the bundled example on first launch, workflow recovery, feature
 * preload, the app-mode overlay, navigation / title / undo / tidy / mode
 * controls and onboarding. The canvas proper is `FlowCanvas`.
 */

import type { Edge, Node } from "@xyflow/react";
import { ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect } from "react";
import { logger, parseWorkflowImportJson } from "tongflow";
import { FlowCanvas, useFlow, useTaskStore } from "tongflow/canvas";
import { usePreloadFeatures } from "@/hooks/use-features";
import { useWorkflowRecovery } from "@/hooks/use-workflow-recovery";
import { AppView } from "./app-view/app-view";
import { BrandWordmark } from "./brand-wordmark";
import { ModeSwitch } from "./mode-switch";
import { OnboardingGate } from "./onboarding/onboarding-gate";
import SmartIsland from "./smart-island";
import { TidyLayoutButton } from "./tidy-layout-button";
import { UndoRedoButtons } from "./undo-redo-buttons";
import { WorkflowTitleMenu } from "./workflow-title-menu";
import { WorkspaceLeftNav } from "./workspace-left-nav";
import { WorkspaceNav } from "./workspace-nav";

/**
 * Workspace inner component
 * Must be used inside a ReactFlowProvider
 */
function WorkspaceInner({
    user: _user,
}: {
    user?: { id: string; email: string };
}) {
    const tIndex = useTranslations("Index");
    const locale = useLocale();

    // App mode replaces the canvas with a form view. The ReactFlow tree stays
    // mounted (visibility-hidden) so SSE output application and workflow
    // recovery keep working while it's covered.
    const workspaceMode = useTaskStore((state) => state.workspaceMode);
    const isAppMode = workspaceMode === "app";

    // Preload feature data
    usePreloadFeatures();

    // Node data update callback (does not depend on nodes; gets the latest state directly from the store)
    const handleNodeDataUpdate = useCallback(
        (nodeId: string, data: { fileKeys?: string[]; texts?: string[] }) => {
            const currentNodes = useFlow.getState().nodes;
            const node = currentNodes.find((n) => n.id === nodeId);
            if (node) {
                const currentData =
                    (node.data as Record<string, unknown>) || {};
                const newData: Record<string, unknown> = { ...currentData };
                if (data.fileKeys && data.fileKeys.length > 0) {
                    newData.fileKeys = data.fileKeys;
                }
                if (data.texts && data.texts.length > 0) {
                    newData.texts = data.texts;
                }
                // Programmatic task-result write — not an undoable user action
                useFlow.getState().updates(nodeId, newData, {
                    history: false,
                });
            }
        },
        [],
    );

    // Workflow task recovery hook
    useWorkflowRecovery({
        onNodeDataUpdate: handleNodeDataUpdate,
    });

    // Restore nodes, edges, and workflow metadata from localStorage
    useEffect(() => {
        const savedNodes = localStorage.getItem("nodes");
        const savedEdges = localStorage.getItem("edges");
        const savedMeta = localStorage.getItem("workflowMeta");

        if (savedNodes) {
            try {
                const nodes = JSON.parse(savedNodes) as Node[];
                if (nodes.length > 0) {
                    useFlow.getState().setNodes(nodes);
                }
            } catch (e) {
                logger.error("Failed to parse nodes:", e);
            }
        }

        if (savedEdges) {
            try {
                const edges = JSON.parse(savedEdges) as Edge[];
                if (edges.length > 0) {
                    useFlow.getState().setEdges(edges);
                }
            } catch (e) {
                logger.error("Failed to parse edges:", e);
            }
        }

        if (savedMeta) {
            try {
                const meta = JSON.parse(savedMeta) as {
                    id: number | null;
                    name: string;
                    description: string;
                };
                // If workflowId and name both exist, use the cached name; otherwise use the default name for the current locale
                const effectiveName =
                    meta.id && meta.name ? meta.name : tIndex("title");
                useFlow.setState({
                    workflowId: meta.id,
                    workflowName: effectiveName,
                    workflowDescription: meta.description || "",
                });
            } catch (e) {
                logger.error("Failed to parse workflowMeta:", e);
            }
        } else {
            // No cached metadata — set the default name
            useFlow.setState({
                workflowName: tIndex("title"),
            });
        }
    }, []);

    // First open: preload the bundled example workflow so the canvas isn't
    // empty. Only when nothing has ever been saved locally, and only once.
    useEffect(() => {
        if (localStorage.getItem("nodes") || localStorage.getItem("edges")) {
            return;
        }
        if (localStorage.getItem("exampleLoaded")) return;
        localStorage.setItem("exampleLoaded", "1");

        let cancelled = false;
        fetch("/example.json")
            .then((r) => r.json())
            .then((json) => {
                if (cancelled) return;
                const parsed = parseWorkflowImportJson(json);
                useFlow.getState().setNodes(parsed.nodes);
                useFlow.getState().setEdges(parsed.edges);
                if (parsed.name)
                    useFlow.getState().setWorkflowName(parsed.name);
                if (parsed.description) {
                    useFlow
                        .getState()
                        .setWorkflowDescription(parsed.description);
                }
            })
            .catch((e) => {
                logger.error("Failed to load example workflow:", e);
            });

        return () => {
            cancelled = true;
        };
    }, []);

    // Listen for locale changes: if the workflow is unsaved, update the name to the default for the new locale
    useEffect(() => {
        const workflowId = useFlow.getState().workflowId;
        if (!workflowId) {
            // Unsaved workflow — update the name to the default for the current locale
            useFlow.setState({
                workflowName: tIndex("title"),
            });
        }
    }, [locale, tIndex]);

    return (
        <div className="flex w-full h-full">
            <div className="relative flex-1 min-w-0 h-full overflow-hidden [&_.react-flow]:!bg-[#f6f7f9] dark:[&_.react-flow]:!bg-background">
                <FlowCanvas hidden={isAppMode}>
                    <SmartIsland />
                </FlowCanvas>

                {isAppMode && (
                    <div className="absolute inset-0 z-5 overflow-y-auto bg-background">
                        <AppView />
                    </div>
                )}

                <div className="absolute left-5 top-5 z-10 flex items-center gap-3">
                    <BrandWordmark />
                    <WorkflowTitleMenu />
                    <WorkspaceLeftNav />
                    <UndoRedoButtons />
                    <TidyLayoutButton />
                </div>

                <div className="absolute right-5 top-5 z-10 flex items-center gap-3">
                    <WorkspaceNav />
                </div>

                <div className="absolute right-4 bottom-5 z-10">
                    <ModeSwitch />
                </div>

                <OnboardingGate />
            </div>
        </div>
    );
}

/**
 * Workspace main component (with Provider)
 */
export default function Workspace({
    user,
}: {
    user?: { id: string; email: string };
}) {
    return (
        <ReactFlowProvider>
            <WorkspaceInner user={user} />
        </ReactFlowProvider>
    );
}
