import { useNodesData } from "@xyflow/react";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";
import { memo, useMemo } from "react";
import { Sparkles, Atom } from "lucide-react";

import { BaseNode } from "../base/base-node";
import { useNodeState } from "@/hooks/use-node-data";
import { NodeTextarea } from "../base/node-textarea";
import { getFileUrl } from "@/lib/file-url";
import {
    upstreamParam,
    configParam,
    staticParam,
    type GetPromptsContext,
} from "@/utils/node-execution-config";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useTranslations } from "next-intl";
import { coerceBaseNodeData } from "@/utils/flow-node-data";

// Workflow execution config
const workflowConfig = {
    feature: "image-edit",
    outputType: "imageNode",
    outputField: "fileKeys" as const,
    supportsBatch: true,
    batchParam: "image",
    paramMappings: {
        image: {
            sources: [
                upstreamParam("imageNode", "fileKeys[0]", {
                    needsUrlTransform: true,
                }),
            ],
            required: true,
        },
        text: {
            sources: [
                upstreamParam("textNode", "texts[0]"),
                configParam("editText"),
                staticParam(""),
            ],
        },
    },
};

const ImageGenImageNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"image-edit", "imageGenImageNode">) => {
    const t = useTranslations("Workspace.nodes");
    const ids = data.ids ?? [];

    // If ids are present, get data from associated nodes (composition mode)
    const fromNodes = useNodesData(ids);
    const imageNode = fromNodes.find((node) => node.type === "imageNode");
    const textNode = fromNodes.find((node) => node.type === "textNode");

    // Get fileKeys and texts from the composite node or directly from data
    const fileKeys: string[] = useMemo(() => {
        if (imageNode) {
            return coerceBaseNodeData(imageNode.data).fileKeys || [];
        }
        return data.fileKeys || [];
    }, [imageNode, data]);

    const upstreamTexts: string[] = useMemo(() => {
        if (textNode) {
            return coerceBaseNodeData(textNode.data).texts || [];
        }
        return data.texts || [];
    }, [textNode, data]);

    // Use the hook to manage edit instructions
    const [state, setState] = useNodeState({ editText: "" }, data);
    const { editText } = state;

    // Determine whether there is upstream text input
    const hasUpstreamTexts = upstreamTexts && upstreamTexts.length > 0;
    // Get the edit instructions that will actually be used
    const effectiveEditText = hasUpstreamTexts ? upstreamTexts[0] : editText;

    return (
        <BaseNode
            selected={selected}
            className="min-w-[480px]"
            data={data}
            workflowConfig={{
                ...workflowConfig,
                title: t("titles.imageGenImage"),
                icon: <Atom className="h-5 w-5" />,
                executeLabel: t("actions.editImage"),
                executeDisabled: !fileKeys?.length,
                // Fetch data from upstream nodes at execution time
                getPrompts: (ctx?: GetPromptsContext) => {
                    // Prefer the latest image data from upstream nodes
                    const upstreamKeys = ctx?.getAllUpstreamData(
                        "imageNode",
                        "fileKeys",
                    ) as string[] | undefined;
                    const keys =
                        upstreamKeys && upstreamKeys.length > 0
                            ? upstreamKeys
                            : fileKeys;

                    // Prefer the latest text data from upstream nodes
                    const upstreamTextData = ctx?.getAllUpstreamData(
                        "textNode",
                        "texts",
                    ) as string[] | undefined;
                    const text =
                        upstreamTextData && upstreamTextData.length > 0
                            ? upstreamTextData[0]
                            : effectiveEditText;

                    return keys.map((fileKey) => ({
                        image: getFileUrl(fileKey),
                        text,
                    }));
                },
            }}
        >
            <div className="p-4 space-y-4">
                {/* If there is upstream text input, show the incoming text */}
                {hasUpstreamTexts ? (
                    <Card className="p-3 bg-muted/50">
                        <div className="space-y-2">
                            <Label className="text-sm font-medium text-muted-foreground">
                                {t("imageEdit.editInstruction")}
                                {t("imageEdit.fromUpstream")}
                            </Label>
                            <div className="space-y-1 max-h-32 overflow-y-auto">
                                {upstreamTexts.map((text, index) => (
                                    <div
                                        key={index}
                                        className="text-sm text-foreground p-2 bg-background rounded border border-border/50 line-clamp-3"
                                    >
                                        {text}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </Card>
                ) : (
                    <NodeTextarea
                        label={t("imageEdit.editInstruction")}
                        icon={Sparkles}
                        placeholder={t("imageEdit.editPlaceholder")}
                        value={editText}
                        onChange={(value) => setState({ editText: value })}
                        rows={4}
                    />
                )}
            </div>
        </BaseNode>
    );
};

ImageGenImageNode.displayName = "ImageGenImageNode";

export default memo(ImageGenImageNode);
