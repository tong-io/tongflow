import { useNodesData } from "@xyflow/react";
import { Atom, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useNodeState } from "@/hooks/use-node-data";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";
import { coerceBaseNodeData } from "@/utils/flow-node-data";
import {
    configParam,
    type GetPromptsContext,
    staticParam,
    upstreamParam,
} from "@/utils/node-execution-config";
import { BaseNode } from "../base/base-node";
import { NodeTextarea } from "../base/node-textarea";

// Workflow execution config
const workflowConfig = {
    feature: "image-edit",
    outputType: "imageNode",
    outputField: "fileKeys" as const,
    supportsBatch: true,
    batchParam: "image",
    paramMappings: {
        image: {
            sources: [upstreamParam("imageNode", "fileKeys[0]")],
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
                    const upstreamKeys = ctx?.getAllUpstreamData(
                        "imageNode",
                        "fileKeys",
                    ) as string[] | undefined;
                    const keys =
                        upstreamKeys && upstreamKeys.length > 0
                            ? upstreamKeys
                            : fileKeys;

                    const upstreamTextData = ctx?.getAllUpstreamData(
                        "textNode",
                        "texts",
                    ) as string[] | undefined;
                    const text =
                        upstreamTextData && upstreamTextData.length > 0
                            ? upstreamTextData[0]
                            : effectiveEditText;

                    return keys.map((fileKey) => ({
                        image: fileKey,
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
