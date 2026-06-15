"use client";

import { useEffect, useRef } from "react";
import { showErrorToast } from "@/components/ui/error-toast";
import { TaskStatus, WorkflowStatus } from "@/constants/task-status";
import { getClientTranslator } from "@/i18n/client";
import type { SerializedWorkflowFailure } from "@/lib/task/error-envelope";
import { buildTaskErrorDetail } from "@/lib/task/error-format";
import { SSE_TASK_MESSAGE_EVENT } from "@/lib/task/sse-events";
import type { SSEMessage } from "@/types/sse";

/**
 * Global listener that surfaces every task / workflow failure as a persistent
 * error toast. All SSE sources (single-task, workflow, recovery) dispatch the
 * same `SSE_TASK_MESSAGE_EVENT`, so one listener covers them all. Deduped by
 * task id so a workflow with several failing nodes still toasts only once;
 * the record is cleared on the next start so a re-run can toast again.
 */
export function TaskFailureToaster() {
    const toastedRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        const t = getClientTranslator("Workspace.toast");

        const handle = (event: CustomEvent<SSEMessage>) => {
            const message = event.detail;
            const taskId = message.id;

            if (
                message.status === WorkflowStatus.WORKFLOW_STARTED ||
                message.status === TaskStatus.PENDING ||
                message.status === TaskStatus.RUNNING
            ) {
                toastedRef.current.delete(taskId);
                return;
            }

            if (
                message.status !== WorkflowStatus.WORKFLOW_FAILED &&
                message.status !== TaskStatus.FAILED
            ) {
                return;
            }

            if (toastedRef.current.has(taskId)) return;
            toastedRef.current.add(taskId);

            const data = message.data;
            const errorText = data?.message?.trim() || data?.error?.trim();
            const detail = buildTaskErrorDetail({
                message: errorText,
                errors: data?.errors as string[] | undefined,
                failures: data?.failures as
                    | SerializedWorkflowFailure[]
                    | undefined,
            });

            // With an error message: "Task failed" headline + the message.
            // Without one: just the "Task failed" message, no redundant title.
            showErrorToast({
                title: errorText ? t("taskFailed") : undefined,
                message: errorText || t("taskFailed"),
                detail,
                id: `task-failed:${taskId}`,
            });
        };

        window.addEventListener(
            SSE_TASK_MESSAGE_EVENT,
            handle as EventListener,
        );
        return () => {
            window.removeEventListener(
                SSE_TASK_MESSAGE_EVENT,
                handle as EventListener,
            );
        };
    }, []);

    return null;
}
