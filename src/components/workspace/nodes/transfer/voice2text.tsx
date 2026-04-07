import { Handle, Position, type NodeProps } from "@xyflow/react";
import { memo } from "react";
import { Atom } from "lucide-react";

import { BaseNode } from "../base/base-node";
import { Card } from "@/components/ui/card";
import {
    upstreamParam,
    type GetPromptsContext,
} from "@/utils/node-execution-config";
import { useTranslations } from "next-intl";

const workflowConfig = {
    feature: "speech_reco",
    label: "语音转文本",
    outputType: "textNode",
    outputField: "texts" as const,
    supportsBatch: true,
    batchParam: "audio",
    paramMappings: {
        audio: {
            sources: [upstreamParam("audioNode", "fileKeys")],
            required: true,
        },
    },
};

const Voice2TextNode = ({ selected, data }: NodeProps) => {
    const t = useTranslations("Workspace.nodes");
    const { fileKeys = [] } = data as { fileKeys?: string[] };

    return (
        <BaseNode
            selected={selected}
            data={data}
            workflowConfig={{
                ...workflowConfig,
                title: t("titles.voice2text"),
                icon: <Atom className="h-5 w-5" />,
                executeLabel: t("actions.convertText"),
                executeDisabled: !fileKeys?.length,
                getPrompts: (ctx?: GetPromptsContext) => {
                    const upstreamKeys = ctx?.getAllUpstreamData(
                        "audioNode",
                        "fileKeys",
                    ) as string[] | undefined;
                    const keys =
                        upstreamKeys && upstreamKeys.length > 0
                            ? upstreamKeys
                            : fileKeys;
                    return keys.map((fileKey) => ({
                        audio: fileKey,
                    }));
                },
            }}
        >
            <Card className="p-5" />

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

export default memo(Voice2TextNode);
