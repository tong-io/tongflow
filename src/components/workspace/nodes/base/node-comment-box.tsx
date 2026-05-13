import { useNodeId, useReactFlow, useStore } from "@xyflow/react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { coerceBaseNodeData } from "@/lib/workflow/flow-node-data";

export function NodeCommentBox() {
    const nodeId = useNodeId();
    const { updateNodeData } = useReactFlow();
    const t = useTranslations("Workspace.nodes.base");

    const comment = useStore(
        useCallback(
            (state) => {
                const node = state.nodeLookup.get(nodeId ?? "");
                return coerceBaseNodeData(node?.data).comment;
            },
            [nodeId],
        ),
    );

    const [isEditing, setIsEditing] = useState(false);
    const [localComment, setLocalComment] = useState(comment ?? "");

    useEffect(() => {
        setLocalComment(comment ?? "");
    }, [comment]);

    const handleBlur = useCallback(() => {
        setIsEditing(false);
        if (nodeId && localComment !== comment) {
            updateNodeData(nodeId, { comment: localComment || undefined });
        }
    }, [nodeId, localComment, comment, updateNodeData]);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (e.key === "Escape") {
                setLocalComment(comment ?? "");
                setIsEditing(false);
            }
        },
        [comment],
    );

    const handleRemove = useCallback(() => {
        if (nodeId) {
            updateNodeData(nodeId, { comment: undefined });
            setLocalComment("");
        }
    }, [nodeId, updateNodeData]);

    if (comment === undefined) return null;

    return (
        <div
            className={cn(
                "absolute -top-2 left-0 right-0 -translate-y-full",
                "nodrag",
            )}
        >
            <div
                className={cn(
                    "relative rounded-lg border-2 border-dashed border-amber-400 bg-amber-50 dark:bg-amber-900/20 p-2 mb-2",
                    "shadow-sm",
                )}
            >
                <button
                    type="button"
                    onClick={handleRemove}
                    className="absolute -right-2 -top-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-gray-200 text-gray-500 hover:bg-gray-300 hover:text-gray-700 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600 dark:hover:text-gray-200"
                    title={t("removeComment")}
                >
                    <X className="h-3 w-3" />
                </button>

                {isEditing ? (
                    <textarea
                        value={localComment}
                        onChange={(e) => setLocalComment(e.target.value)}
                        onBlur={handleBlur}
                        onKeyDown={handleKeyDown}
                        className="w-full min-h-[40px] resize-none rounded border-0 bg-transparent text-sm text-amber-800 dark:text-amber-200 placeholder-amber-400 dark:placeholder-amber-500 focus:outline-none focus:ring-0"
                        placeholder={t("commentPlaceholder")}
                        autoFocus
                    />
                ) : (
                    <div
                        onClick={() => setIsEditing(true)}
                        className={cn(
                            "min-h-[24px] cursor-text text-sm text-amber-800 dark:text-amber-200 whitespace-pre-wrap",
                            !localComment &&
                                "text-amber-400 dark:text-amber-500 italic",
                        )}
                    >
                        {localComment || t("clickToAddComment")}
                    </div>
                )}
            </div>
        </div>
    );
}
