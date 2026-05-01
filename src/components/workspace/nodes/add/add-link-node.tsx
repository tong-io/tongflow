import { type NodeProps } from "@xyflow/react";
import { useCallback, useMemo, memo } from "react";
import { Link as LinkIcon, Plus, Trash } from "lucide-react";

import { BaseNode } from "../base/base-node";
import { configParam } from "@/utils/node-execution-config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useNodeState } from "@/hooks/use-node-data";
import { useTranslations } from "next-intl";

// Workflow execution config: Modal cpu/crawl4ai, converts webpage to Markdown and expands into text nodes
const workflowConfig = {
    feature: "link",
    outputType: "textNode",
    outputField: "texts" as const,
    supportsBatch: true,
    batchParam: "url",
    paramMappings: {
        url: {
            sources: [configParam("previews")],
            required: true,
        },
    },
};

const AddLinkNode = ({ selected, data }: NodeProps) => {
    const t = useTranslations("Workspace.nodes.add");

    // Use the new hook to manage state persistence
    const [state, setState] = useNodeState<{
        input: string;
        previews: string[];
    }>(
        {
            input: "",
            previews: [],
        },
        data,
    );
    const { input, previews } = state;

    const handleAdd = () => {
        if (!input.trim()) return;
        const urlMatch = input.trim().match(/https?:\/\/[^\s]+/);
        if (!urlMatch) return;

        const url = urlMatch[0];
        setState({
            input: "",
            previews: [...previews, url],
        });
    };

    const handleRemovePreview = (index: number) => {
        setState({
            input: "",
            previews: previews.filter((_, i) => i !== index),
        });
    };

    // Augment data with feature for BaseNode
    const dataWithFeature = useMemo(
        () => ({
            ...data,
            feature: "link",
        }),
        [data],
    );

    // Single source of workflow configuration
    const getWorkflowConfig = useCallback(() => {
        return {
            ...workflowConfig,
            title: t("addLink"),
            icon: <LinkIcon className="h-5 w-5" />,
            executeLabel: t("extractContent"),
            executeDisabled: previews.length === 0,
            getPrompts: () => previews.map((url) => ({ url })),
            isInputNode: true,
        };
    }, [previews, t]);

    return (
        <BaseNode
            selected={selected}
            className="min-w-[480px]"
            data={dataWithFeature}
            workflowConfig={getWorkflowConfig()}
        >
            {/* Body */}
            <div className="p-4 space-y-2">
                {/* Preview card */}
                {previews.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {previews.map((preview, idx) => (
                            <Card
                                key={idx}
                                className="p-3 relative rounded-lg border hover:shadow-sm transition-all"
                            >
                                <button
                                    className="absolute top-2 right-2 text-muted-foreground hover:text-destructive transition-colors"
                                    onClick={() => handleRemovePreview(idx)}
                                >
                                    <Trash size={14} />
                                </button>
                                <div className="pr-6">
                                    <h3 className="font-semibold text-sm mb-1 truncate">
                                        {preview || t("linkPlaceholder")}
                                    </h3>
                                    <a
                                        href={preview}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-primary text-xs hover:underline break-all line-clamp-2"
                                    >
                                        {preview}
                                    </a>
                                </div>
                            </Card>
                        ))}
                    </div>
                )}

                {/* Input */}
                <div
                    className="flex gap-2 items-center nodrag"
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    <Input
                        placeholder={t("linkPlaceholder")}
                        value={input}
                        onChange={(e) => setState({ input: e.target.value })}
                        className="flex-1 h-10"
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                handleAdd();
                            }
                        }}
                    />
                    <Button
                        variant="outline"
                        size="default"
                        onClick={handleAdd}
                        className="h-10 px-3"
                    >
                        <Plus size={16} className="mr-1" /> {t("generate")}
                    </Button>
                </div>
            </div>

        </BaseNode>
    );
};

AddLinkNode.displayName = "AddLinkNode";

export default memo(AddLinkNode);
