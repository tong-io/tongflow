"use client";

/**
 * "Run workflow" toolbar action (a top-right React Flow `Panel`; render it
 * inside `<ReactFlow>`). Renders nothing unless the host configured a
 * `CanvasWorkflowRunner`; while a run is in flight it turns into "Stop".
 * When the runner exposes `controls`, a Pause / Resume button sits next to
 * Stop during the run.
 */

import { Panel } from "@xyflow/react";
import { Loader2, Pause, Play } from "lucide-react";
import { useTranslations } from "use-intl";
import { useWorkflowRun } from "../hooks/use-workflow-run";
import { Button } from "../ui/button";

export function RunWorkflowAction() {
    const t = useTranslations("Workspace.toolbar");
    const {
        available,
        running,
        run,
        stop,
        controllable,
        paused,
        pause,
        resume,
    } = useWorkflowRun();
    if (!available) return null;

    return (
        <Panel position="top-right" className="z-10 flex gap-2">
            {running && controllable && (
                <Button
                    type="button"
                    variant="outline"
                    onClick={paused ? resume : pause}
                    aria-label={
                        paused ? t("resumeWorkflow") : t("pauseWorkflow")
                    }
                    className="shadow-md"
                >
                    {paused ? <Play /> : <Pause />}
                    {paused ? t("resumeWorkflow") : t("pauseWorkflow")}
                </Button>
            )}
            {running ? (
                <Button
                    type="button"
                    variant="outline"
                    onClick={stop}
                    aria-label={t("stopWorkflow")}
                    className="shadow-md"
                >
                    <Loader2 className={paused ? undefined : "animate-spin"} />
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
