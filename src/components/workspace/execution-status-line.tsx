"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import {
    NodeStatus,
    TaskStatus,
    WorkflowStatus,
} from "@/constants/task-status";
import { SSE_TASK_MESSAGE_EVENT } from "@/lib/task/sse-events";
import { cn } from "@/lib/utils";
import type { SSEMessage } from "@/types/sse";

type Phase = "idle" | "running" | "completed" | "failed";

interface State {
    phase: Phase;
    label: string | null;
    completed: number;
    total: number;
    errorMsg: string | null;
}

const initialState: State = {
    phase: "idle",
    label: null,
    completed: 0,
    total: 0,
    errorMsg: null,
};

/**
 * Inline execution status, shown just above the smart-island execute button
 * in execution mode. Listens to the same window SSE event stream that
 * use-workflow-execution emits to. Subtle shimmer while running.
 */
export function ExecutionStatusLine() {
    const t = useTranslations("Workspace.toast");
    const [state, setState] = useState<State>(initialState);
    const completionTimerRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        const handle = (event: CustomEvent<SSEMessage>) => {
            const message = event.detail;

            if (completionTimerRef.current) {
                clearTimeout(completionTimerRef.current);
                completionTimerRef.current = null;
            }

            switch (message.status) {
                case WorkflowStatus.WORKFLOW_STARTED:
                    setState({
                        phase: "running",
                        label: null,
                        completed: 0,
                        total: message.data?.totalNodes ?? 0,
                        errorMsg: null,
                    });
                    break;

                case NodeStatus.NODE_STARTED:
                case NodeStatus.NODE_RUNNING:
                    if (message.nodeId && message.data) {
                        setState((prev) => ({
                            ...prev,
                            phase: "running",
                            label:
                                message.data?.label ||
                                message.data?.feature ||
                                prev.label,
                        }));
                    }
                    break;

                case NodeStatus.NODE_COMPLETED:
                    setState((prev) => ({
                        ...prev,
                        completed: prev.completed + 1,
                    }));
                    break;

                case WorkflowStatus.WORKFLOW_COMPLETED:
                case TaskStatus.COMPLETED:
                    setState((prev) => ({
                        ...prev,
                        phase: "completed",
                        label: null,
                        errorMsg: null,
                    }));
                    completionTimerRef.current = setTimeout(() => {
                        setState(initialState);
                    }, 2000);
                    break;

                case WorkflowStatus.WORKFLOW_CANCELLED:
                case TaskStatus.CANCELLED:
                    setState(initialState);
                    break;

                case WorkflowStatus.WORKFLOW_FAILED:
                case TaskStatus.FAILED:
                    setState((prev) => ({
                        ...prev,
                        phase: "failed",
                        label: null,
                        errorMsg:
                            message.data?.message ||
                            message.data?.error ||
                            null,
                    }));
                    break;
            }
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
            if (completionTimerRef.current) {
                clearTimeout(completionTimerRef.current);
            }
        };
    }, []);

    if (state.phase === "idle") return null;

    if (state.phase === "completed") {
        return (
            <div className="text-xs text-emerald-500 max-w-[260px] truncate text-center">
                {t("completed")}
            </div>
        );
    }

    if (state.phase === "failed") {
        return (
            <div
                className="text-xs text-red-500 max-w-[320px] line-clamp-2 text-center"
                title={state.errorMsg ?? undefined}
            >
                {state.errorMsg
                    ? `${t("failed")}: ${state.errorMsg}`
                    : t("failed")}
            </div>
        );
    }

    // running
    const progressText =
        state.total > 0 ? ` · ${state.completed}/${state.total}` : "";
    const text = state.label
        ? `${state.label}${progressText}`
        : `${t("executing")}${progressText}`;

    return (
        <div
            className={cn(
                "text-xs max-w-[260px] truncate text-center",
                "bg-clip-text text-transparent",
                "animate-[shimmer_2.4s_linear_infinite]",
            )}
            style={{
                backgroundImage:
                    "linear-gradient(90deg, rgb(107 114 128) 0%, rgb(107 114 128) 45%, rgb(229 231 235) 50%, rgb(107 114 128) 55%, rgb(107 114 128) 100%)",
                backgroundSize: "200% 100%",
            }}
        >
            {text}
        </div>
    );
}
