import { Handle, Position, type NodeProps } from "@xyflow/react";
import { memo } from "react";
import { Music as AudioIcon } from "lucide-react";

import { BaseNode } from "../base/base-node";
import { getR2Url } from "@/lib/r2-utils";
import {
    upstreamParam,
    type GetPromptsContext,
} from "@/utils/node-execution-config";
import { useNodeState } from "@/hooks/use-node-data";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useTranslations } from "next-intl";

interface AudioGenTextSpeechRecognizeNodeProps extends NodeProps {
    data: {
        fileKeys?: string[];
    };
}

// 工作流执行配置（基础配置，不包含动态的feature）
const baseWorkflowConfig = {
    label: "语音识别",
    outputType: "textNode",
    outputField: "texts" as const,
    supportsBatch: true,
    batchParam: "audio",
    paramMappings: {
        audio: {
            sources: [
                upstreamParam("audioNode", "fileKeys[0]", {
                    needsUrlTransform: true,
                }),
            ],
            required: true,
        },
    },
};

const AudioGenTextSpeechRecognizeNode = ({
    selected,
    data,
}: AudioGenTextSpeechRecognizeNodeProps) => {
    const t = useTranslations("Workspace.nodes");
    const { fileKeys = [] } = data;

    // 使用Hook来管理时间戳开关状态
    const [state, setState] = useNodeState(
        {
            withTimestamp: false,
        },
        data,
    );
    const { withTimestamp } = state;

    // 根据开关状态确定feature
    const feature = withTimestamp ? "transcribe_timestamp" : "transcribe";

    return (
        <BaseNode
            selected={selected}
            className="min-w-[480px]"
            data={data}
            workflowConfig={{
                ...baseWorkflowConfig,
                feature,
                title: t("titles.speechRecognize"),
                icon: <AudioIcon className="h-5 w-5" />,
                executeLabel: t("actions.recognizeSpeech"),
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
                        audio: getR2Url(fileKey),
                    }));
                },
            }}
        >
            <div className="p-4">
                <Card
                    className="p-3 nodrag"
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    <div className="flex items-center justify-between">
                        <Label
                            htmlFor="timestamp-switch"
                            className="text-sm text-muted-foreground"
                        >
                            {t("speechRecognize.withTimestamp")}
                        </Label>
                        <Switch
                            id="timestamp-switch"
                            checked={withTimestamp}
                            onCheckedChange={(checked) =>
                                setState({ withTimestamp: checked })
                            }
                        />
                    </div>
                </Card>
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

AudioGenTextSpeechRecognizeNode.displayName = "AudioGenTextSpeechRecognizeNode";

export default memo(AudioGenTextSpeechRecognizeNode);
