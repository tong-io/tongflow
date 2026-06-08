"use client";

import { AlertCircle, X } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { getClientTranslator } from "@/i18n/client";

export interface ShowErrorToastOptions {
    /** Optional bold headline shown above the message. */
    title?: string;
    /** Primary error message shown to the user. */
    message: string;
    /** Full detail (stack / per-node failures) revealed under "Details". */
    detail?: string;
    /**
     * Stable id so repeated errors from the same source replace rather than
     * stack (e.g. one per task id). Omit for an auto-generated id.
     */
    id?: string;
}

function ErrorToastCard({
    toastId,
    title,
    message,
    detail,
}: {
    toastId: string;
    title?: string;
    message: string;
    detail?: string;
}) {
    const t = getClientTranslator("Errors");
    const [expanded, setExpanded] = useState(false);
    const [copied, setCopied] = useState(false);

    const copy = () => {
        const parts = [title, message, detail].filter(Boolean);
        navigator.clipboard?.writeText(parts.join("\n\n")).then(
            () => setCopied(true),
            () => {},
        );
    };

    return (
        <div className="pointer-events-auto w-[380px] max-w-[90vw] rounded-lg border border-red-200 bg-white shadow-lg dark:border-red-900/60 dark:bg-neutral-900">
            <div className="flex items-start gap-2 p-3">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                <div className="min-w-0 flex-1">
                    {title && (
                        <p className="break-words text-sm font-medium text-red-600 dark:text-red-400">
                            {title}
                        </p>
                    )}
                    <p className="break-words text-sm text-neutral-700 dark:text-neutral-200">
                        {message}
                    </p>
                    <div className="mt-1.5 flex items-center gap-3 text-xs">
                        {detail && (
                            <button
                                type="button"
                                onClick={() => setExpanded((v) => !v)}
                                className="text-neutral-500 transition-colors hover:text-neutral-800 dark:hover:text-neutral-200"
                            >
                                {t("details")}
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={copy}
                            className="text-neutral-500 transition-colors hover:text-neutral-800 dark:hover:text-neutral-200"
                        >
                            {copied ? t("copied") : t("copy")}
                        </button>
                    </div>
                    {expanded && detail && (
                        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-neutral-100 p-2 font-mono text-[11px] leading-relaxed text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                            {detail}
                        </pre>
                    )}
                </div>
                <button
                    type="button"
                    aria-label={t("close")}
                    onClick={() => toast.dismiss(toastId)}
                    className="-mr-1 -mt-1 rounded p-1 text-neutral-400 transition-colors hover:text-neutral-700 dark:hover:text-neutral-200"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>
        </div>
    );
}

/**
 * Persistent error toast: stays until the user dismisses it (✕), with an
 * optional expandable detail panel and copy button. Use for any real error
 * (API/network failures, task/workflow failures) so they don't flash by.
 */
export function showErrorToast({
    title,
    message,
    detail,
    id,
}: ShowErrorToastOptions): string {
    return toast.custom(
        (tInst) => (
            <ErrorToastCard
                toastId={tInst.id}
                title={title}
                message={message}
                detail={detail}
            />
        ),
        { duration: Number.POSITIVE_INFINITY, id },
    );
}
