import { useNodeId, type NodeProps } from "@xyflow/react";
import { memo, useCallback } from "react";
import { FileText } from "lucide-react";

import { BaseNode } from "../base/base-node";
import useFlow from "@/hooks/use-flow";
import { getFileUrl } from "@/lib/file-url";
import {
    upstreamParam,
    type GetPromptsContext,
} from "@/utils/node-execution-config";
import { useTranslations } from "next-intl";
import { logger } from "@/lib/logger";

const DEFAULT_FEATURE = "parse_document";

// Workflow execution config
const workflowConfig = {
    feature: DEFAULT_FEATURE,
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
    const expands = useFlow((s) => s.expands);

    // Custom task updater — awaits Markdown payloads before spawning text nodes
    const handleTaskUpdate = useCallback(
        async (task: any) => {
            if (task?.status === "COMPLETED") {
                const r2_key = task?.data?.r2_key;
                if (r2_key && nodeId) {
                    try {
                        const response = await fetch(getFileUrl(r2_key));
                        if (!response.ok) {
                            throw new Error(
                                `Failed to fetch markdown: ${response.statusText}`,
                            );
                        }
                        const markdownContent = await response.text();

                        // Expand markdown content as a text node
                        expands(nodeId, [
                            {
                                type: "textNode",
                                data: { texts: [markdownContent] },
                            },
                        ]);
                    } catch (error) {
                        logger.error(
                            "Failed to fetch markdown content:",
                            error,
                        );
                    }
                }
                return true; // Already handled; skip the default logic
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
        </BaseNode>
    );
};

FileGenTextNode.displayName = "FileGenTextNode";

export default memo(FileGenTextNode);
