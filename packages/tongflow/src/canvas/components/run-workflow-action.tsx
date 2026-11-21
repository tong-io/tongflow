"use client";

/**
 * "Run workflow" toolbar action (a top-right React Flow `Panel`; render it
 * inside `<ReactFlow>`). Renders nothing unless the host configured a
 * `CanvasWorkflowRunner`; while a run is in flight it turns into "Stop".
 */

import { Panel } from "@xyflow/react";
import { Loader2, Play } from "lucide-react";
import { useTranslations } from "use-intl";
import { useWorkflowRun } from "../hooks/use-workflow-run";
import { Button } from "../ui/button";

export function RunWorkflowAction() {
    const t = useTranslations("Workspace.toolbar");
    const { available, running, run, stop } = useWorkflowRun();
    if (!available) return null;

    return (
        <Panel position="top-right" className="z-10">
            {running ? (
                <Button
                    type="button"
                    variant="outline"
                    onClick={stop}
                    aria-label={t("stopWorkflow")}
                    className="shadow-md"
                >
                    <Loader2 className="animate-spin" />
                    {t("stopWorkflow")}
                </Button>
            ) : (
                <Button
                    type="button"
                    onClick={() => void run()}
                    aria-label={t("runWorkflow")}
                    className="shadow-md"
                >
                    <Play />
                    {t("runWorkflow")}
                </Button>
            )}
        </Panel>
    );
}
