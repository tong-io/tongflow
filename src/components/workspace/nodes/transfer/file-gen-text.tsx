import { Handle, Position, useNodeId, type NodeProps } from "@xyflow/react";
import { memo, useCallback } from "react";
import { FileText } from "lucide-react";

import { BaseNode } from "../base/base-node";
import useFlow from "@/hooks/use-flow";
import { getR2Url } from "@/lib/r2-utils";
import {
    upstreamParam,
    type GetPromptsContext,
} from "@/utils/node-execution-config";
import { useTranslations } from "next-intl";
import { clampToAllowedModel } from "@/utils/node-model-feature";
import { NodeModelSelect } from "../base/node-model-select";
import { singleModelSelectOptions } from "@/utils/node-model-select-label";

const DEFAULT_FEATURE = "parse_document";

// 工作流执行配置
const workflowConfig = {
    feature: DEFAULT_FEATURE,
    label: "解析文档",
    outputType: "textNode",
    outputField: "texts" as const,
    supportsBatch: true,
    batchParam: "file",
    paramMappings: {
        file: {
            sources: [
                upstreamParam("fileNode", "fileKeys[0]", {
                    needsUrlTransform: true,
                }),
            ],
            required: true,
        },
    },
};

interface FileGenTextNodeProps extends NodeProps {
    data: {
        fileKeys?: string[];
    };
}

const FileGenTextNode = ({ selected, data }: FileGenTextNodeProps) => {
    const t = useTranslations("Workspace.nodes");
    const { fileKeys = [] } = data;

    const nodeId = useNodeId();
    const updates = useFlow((s) => s.updates);
    const expands = useFlow((s) => s.expands);

    const featureName = clampToAllowedModel(
        (data as { feature?: string }).feature,
        [DEFAULT_FEATURE],
        DEFAULT_FEATURE,
    );

    // 自定义任务更新处理 - 需要异步获取 markdown 内容
    const handleTaskUpdate = useCallback(
        async (task: any) => {
            if (task?.status === "COMPLETED") {
                const r2_key = task?.data?.r2_key;
                if (r2_key && nodeId) {
                    try {
                        // 从 R2 下载 markdown 文件内容
                        const response = await fetch(getR2Url(r2_key));
                        if (!response.ok) {
                            throw new Error(
                                `Failed to fetch markdown: ${response.statusText}`,
                            );
                        }
                        const markdownContent = await response.text();

                        // 将 markdown 内容作为文本节点展开
                        expands(nodeId, [
                            {
                                type: "textNode",
                                data: { texts: [markdownContent] },
                            },
                        ]);
                    } catch (error) {
                        console.error(
                            "Failed to fetch markdown content:",
                            error,
                        );
                    }
                }
                return true; // 已处理，跳过默认逻辑
            }
            return false;
        },
        [expands, nodeId],
    );

    return (
        <BaseNode
            selected={selected}
            className="min-w-[480px]"
            data={data}
            workflowConfig={{
                ...workflowConfig,
                feature: featureName,
                title: t("titles.fileGenText"),
                icon: <FileText className="h-5 w-5" />,
                executeLabel: t("actions.parseDocument"),
                executeDisabled: !fileKeys?.length,
                getPrompts: (ctx?: GetPromptsContext) => {
                    const upstreamKeys = ctx?.getAllUpstreamData(
                        "fileNode",
                        "fileKeys",
                    ) as string[] | undefined;
                    const keys =
                        upstreamKeys && upstreamKeys.length > 0
                            ? upstreamKeys
                            : fileKeys;
                    return keys.map((fileKey) => ({
                        source: fileKey,
                    }));
                },
                onTaskUpdate: handleTaskUpdate,
            }}
        >
            <div className="p-4">
                <NodeModelSelect
                    value={featureName}
                    onValueChange={(value) =>
                        updates(nodeId!, { ...data, feature: value })
                    }
                    options={singleModelSelectOptions(DEFAULT_FEATURE, (k) =>
                        t(k as Parameters<typeof t>[0]),
                    )}
                />
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

FileGenTextNode.displayName = "FileGenTextNode";

export default memo(FileGenTextNode);
