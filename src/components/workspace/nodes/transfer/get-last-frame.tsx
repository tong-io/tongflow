import { Handle, Position, type NodeProps } from "@xyflow/react";
import { memo } from "react";
import { BaseNode } from "../base/base-node";
import { Film } from "lucide-react";
import {
    upstreamParam,
    type GetPromptsContext,
} from "@/utils/node-execution-config";
import { useTranslations } from "next-intl";

const GetLastFrameNode = ({ selected, data }: NodeProps) => {
    const t = useTranslations("Workspace.nodes");
    const { fileKeys } = data as { fileKeys: string[] };

    const workflowConfig = {
        feature: "get_last_frame",
        label: "尾帧截图",
        outputType: "imageNode",
        outputField: "fileKeys" as const,
        supportsBatch: true,
        batchParam: "videoKey",
        paramMappings: {
            videoKey: {
                sources: [upstreamParam("videoNode", "fileKeys")],
                required: true,
            },
        },
    };

    return (
        <BaseNode
            selected={selected}
            data={data}
            workflowConfig={{
                ...workflowConfig,
                title: t("titles.getLastFrame"),
                icon: <Film className="h-5 w-5" />,
                executeLabel: t("actions.getLastFrame"),
                executeDisabled: !fileKeys?.length,
                getPrompts: (ctx?: GetPromptsContext) => {
                    const upstreamKeys = ctx?.getAllUpstreamData(
                        "videoNode",
                        "fileKeys",
                    ) as string[] | undefined;
                    const keys =
                        upstreamKeys && upstreamKeys.length > 0
                            ? upstreamKeys
                            : fileKeys;
                    return (
                        keys?.map((fileKey) => ({
                            videoKey: fileKey,
                        })) || []
                    );
                },
            }}
        >
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

export default memo(GetLastFrameNode);
