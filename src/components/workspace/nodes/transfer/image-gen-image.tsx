import {
    Handle,
    Position,
    useNodeId,
    useNodesData,
    type NodeProps,
} from "@xyflow/react";
import { memo, useMemo } from "react";
import { Sparkles, Atom } from "lucide-react";

import { BaseNode } from "../base/base-node";
import { useNodeState } from "@/hooks/use-node-data";
import { NodeTextarea } from "../base/node-textarea";
import { getR2Url } from "@/lib/r2-utils";
import {
    upstreamParam,
    configParam,
    staticParam,
    type GetPromptsContext,
} from "@/utils/node-execution-config";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import useFlow from "@/hooks/use-flow";
import { clampToAllowedModel } from "@/utils/node-model-feature";
import { useTranslations } from "next-intl";

// 工作流执行配置
const workflowConfig = {
    feature: "image_edit",
    label: "编辑图片",
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

const ImageGenImageNode = ({ selected, data }: NodeProps) => {
    const t = useTranslations("Workspace.nodes");
    const { ids = [] } = data as { ids?: string[]; feature?: string };
    const updates = useFlow((s) => s.updates);
    const id = useNodeId()!;

    const featureName = clampToAllowedModel(
        (data as { feature?: string }).feature,
        ["image_edit"],
        "image_edit",
    );

    // 如果有 ids，从关联节点获取数据（组合模式）
    const fromNodes = useNodesData(ids);
    const imageNode = fromNodes.find((node) => node.type === "imageNode");
    const textNode = fromNodes.find((node) => node.type === "textNode");

    // 从组合节点或直接从 data 获取 fileKeys 和 texts
    const fileKeys: string[] = useMemo(() => {
        if (imageNode) {
            return (imageNode.data as any)?.fileKeys || [];
        }
        return (data as any)?.fileKeys || [];
    }, [imageNode, data]);

    const upstreamTexts: string[] = useMemo(() => {
        if (textNode) {
            return (textNode.data as any)?.texts || [];
        }
        return (data as any)?.texts || [];
    }, [textNode, data]);

    // 使用 Hook 管理编辑指令
    const [state, setState] = useNodeState({ editText: "" }, data);
    const { editText } = state;

    // 判断是否有上游文本输入
    const hasUpstreamTexts = upstreamTexts && upstreamTexts.length > 0;
    // 获取实际使用的编辑指令
    const effectiveEditText = hasUpstreamTexts ? upstreamTexts[0] : editText;

    return (
        <BaseNode
            selected={selected}
            className="min-w-[480px]"
            data={data}
            workflowConfig={{
                ...workflowConfig,
                feature: featureName,
                title: t("titles.imageGenImage"),
                icon: <Atom className="h-5 w-5" />,
                executeLabel: t("actions.editImage"),
                executeDisabled: !fileKeys?.length,
                // 执行时从上游节点实时获取数据
                getPrompts: (ctx?: GetPromptsContext) => {
                    // 优先从上游节点获取最新的图片数据
                    const upstreamKeys = ctx?.getAllUpstreamData(
                        "imageNode",
                        "fileKeys",
                    ) as string[] | undefined;
                    const keys =
                        upstreamKeys && upstreamKeys.length > 0
                            ? upstreamKeys
                            : fileKeys;

                    // 优先从上游节点获取最新的文本数据
                    const upstreamTextData = ctx?.getAllUpstreamData(
                        "textNode",
                        "texts",
                    ) as string[] | undefined;
                    const text =
                        upstreamTextData && upstreamTextData.length > 0
                            ? upstreamTextData[0]
                            : effectiveEditText;

                    return keys.map((fileKey) => ({
                        image: getR2Url(fileKey),
                        text,
                    }));
                },
            }}
        >
            <div className="p-4 space-y-4">
                {/* 模型选择 */}
                <Card className="p-3">
                    <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">
                            {t("common.modelSelect")}
                        </Label>
                        <Select
                            value={featureName}
                            onValueChange={(value) =>
                                updates(id, { ...data, feature: value })
                            }
                        >
                            <SelectTrigger
                                className="w-full"
                                size="sm"
                            >
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="image_edit">
                                    {t("common.models.imageEdit")}
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </Card>

                {/* 如果有上游文本输入，显示传入的文本 */}
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

            <Handle
                type="target"
                position={Position.Left}
                id="a"
                isConnectable={true}
            />
            <Handle
                type="source"
                position={Position.Right}
                id="b"
                isConnectable={true}
            />
        </BaseNode>
    );
};

ImageGenImageNode.displayName = "ImageGenImageNode";

export default memo(ImageGenImageNode);
