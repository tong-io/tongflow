import { Handle, Position, useNodeId, useReactFlow } from "@xyflow/react";
import { FileText, Maximize2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { logger } from "@/lib/logger";
import type { RfDataNodeProps } from "@/types/nodes";
import { BaseNodeShell } from "../base/base-node-shell";
import {
    NodeHeader,
    NodeHeaderActions,
    NodeHeaderComboAction,
    NodeHeaderIcon,
    NodeHeaderMenuAction,
    NodeHeaderTitle,
} from "../base/node-header";
import { ModalityPlaceholder } from "./modality-placeholder";

type TextNodeRfProps = RfDataNodeProps<"textNode">;

// Lightweight fullscreen inspector shell
const FullScreenTextModal = ({
    text,
    onClose,
    onSave,
}: {
    text: string;
    onClose: () => void;
    onSave: (newText: string) => void;
}) => {
    const [mounted, setMounted] = useState(false);
    const [editedText, setEditedText] = useState(text);
    const t = useTranslations("Workspace.nodes.modal");

    useEffect(() => {
        setMounted(true);
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = "unset";
        };
    }, []);

    const handleClose = () => {
        // Save the edited text before closing
        if (editedText !== text) {
            onSave(editedText);
        }
        onClose();
    };

    if (!mounted) return null;

    const content = (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 rounded-lg shadow-2xl w-11/12 h-5/6 max-h-screen flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                        {t("textEditor")}
                    </h2>
                    <Button size="sm" variant="ghost" onClick={handleClose}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                {/* Editable Text Area */}
                <div className="flex-1 overflow-hidden p-6 bg-gray-50 dark:bg-slate-800">
                    <textarea
                        className="w-full h-full resize-none rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900 p-4 text-sm text-gray-700 dark:text-gray-300 font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
                        value={editedText}
                        onChange={(e) => setEditedText(e.target.value)}
                        placeholder={t("enterText")}
                    />
                </div>
            </div>
        </div>
    );

    return createPortal(content, document.body);
};

const TextNode = ({ selected, data }: TextNodeRfProps) => {
    const t = useTranslations("Workspace.nodes.modal");
    const texts = data.texts;
    const textList: string[] = texts ?? [];
    const [isFullScreen, setIsFullScreen] = useState(false);
    const { updateNodeData } = useReactFlow();
    const nodeId = useNodeId();

    // Handler to save edited text
    const handleSaveText = (newText: string) => {
        if (nodeId) {
            updateNodeData(nodeId, { texts: [newText] });
        }
    };

    // Determine if single or multiple
    const isSingle = textList.length === 1;
    const count = textList.length;

    // Calculate display count: <=9 items; if total>9, show 8 + 1 "more"
    const showMore = count > 9;
    const visibleTextCount = showMore ? 8 : Math.min(count, 9);
    const visibleTiles = showMore ? 9 : visibleTextCount;
    const emptyTiles = Math.max(0, 9 - visibleTiles);

    return (
        <>
            <BaseNodeShell selected={selected} count={count}>
                <Handle
                    type="target"
                    position={Position.Left}
                    id="in:textNode"
                    isConnectableStart={false}
                />
                <Handle
                    type="source"
                    position={Position.Right}
                    id="out:textNode"
                    isConnectableStart={false}
                />
                <NodeHeader>
                    <NodeHeaderIcon>
                        <FileText />
                    </NodeHeaderIcon>
                    <NodeHeaderTitle>
                        {isSingle ? t("text") : t("texts", { count })}
                    </NodeHeaderTitle>
                    <NodeHeaderActions>
                        {isSingle && (
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setIsFullScreen(true)}
                                title={t("fullScreenPreview")}
                            >
                                <Maximize2 className="h-4 w-4" />
                            </Button>
                        )}
                        <NodeHeaderComboAction
                            onClick={() => logger.debug("compose mode toggle")}
                        />
                        <NodeHeaderMenuAction label={t("moreOptions")}>
                            <DropdownMenuLabel>
                                {t("actions")}
                            </DropdownMenuLabel>
                        </NodeHeaderMenuAction>
                    </NodeHeaderActions>
                </NodeHeader>

                {/* Content */}
                {count === 0 || (isSingle && !textList[0]?.trim()) ? (
                    // No usable text content -> neutral modality placeholder
                    <ModalityPlaceholder modality="text" />
                ) : isSingle ? (
                    // Single text display
                    <div
                        className="max-h-[600px] min-w-[120px] max-w-[420px] overflow-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900 p-3 shadow-lg nodrag"
                        onPointerDown={(e) => e.stopPropagation()}
                        onWheel={(e) => e.stopPropagation()}
                    >
                        <div className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
                            {textList[0]}
                        </div>
                    </div>
                ) : (
                    // Multiple texts thumbnail grid
                    <div className="w-60 min-h-[135px] rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-slate-800 p-3">
                        <div className="grid h-full grid-cols-3 gap-2">
                            {/* Show up to 8 thumbnails, reserve 9th for "more" */}
                            {textList
                                .slice(0, visibleTextCount)
                                .map((text, index) => (
                                    <div
                                        key={index}
                                        className="relative aspect-video overflow-hidden rounded-md border border-gray-300 dark:border-gray-600 bg-gray-200 dark:bg-slate-700 p-2 text-xs text-gray-600 dark:text-gray-400 shadow-sm"
                                    >
                                        <div className="h-full w-full overflow-hidden">
                                            {text.substring(0, 50)}
                                            {text.length > 50 && "..."}
                                        </div>
                                    </div>
                                ))}

                            {/* Show "more" indicator if over 9 texts */}
                            {showMore && (
                                <div className="flex aspect-video items-center justify-center rounded-md border border-gray-400 dark:border-gray-600 bg-gradient-to-br from-gray-300 to-gray-400 dark:from-slate-600 dark:to-slate-700 shadow-sm">
                                    <div className="text-center">
                                        <div className="text-sm font-bold text-gray-700 dark:text-gray-200">
                                            +{count - 8}
                                        </div>
                                        <div className="text-xs text-gray-600 dark:text-gray-400">
                                            {t("more")}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Empty placeholders */}
                            {Array.from({ length: emptyTiles }).map(
                                (_, index) => (
                                    <div
                                        key={`empty-${index}`}
                                        className="aspect-video rounded-md border border-dashed border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-slate-700 opacity-50"
                                    />
                                ),
                            )}
                        </div>
                    </div>
                )}
            </BaseNodeShell>

            {/* Full screen modal - rendered outside BaseNodeShell */}
            {isFullScreen && isSingle && (
                <FullScreenTextModal
                    text={textList[0]}
                    onClose={() => setIsFullScreen(false)}
                    onSave={handleSaveText}
                />
            )}
        </>
    );
};

// Custom comparison function to prevent unnecessary re-renders
const areEqual = (prevProps: TextNodeRfProps, nextProps: TextNodeRfProps) => {
    const prevTexts = prevProps.data.texts || [];
    const nextTexts = nextProps.data.texts || [];

    return (
        prevProps.selected === nextProps.selected &&
        JSON.stringify(prevTexts) === JSON.stringify(nextTexts)
    );
};

TextNode.displayName = "TextNode";

export default memo(TextNode, areEqual);
