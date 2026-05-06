import { memo } from "react";

import type { RfDataNodeProps } from "@/types/nodes";
import { Card } from "@/components/ui/card";
import { Droplets } from "lucide-react";

import { BaseNode } from "../base/base-node";
import {
    upstreamParam,
    type GetPromptsContext,
} from "@/utils/node-execution-config";
import { useTranslations } from "next-intl";

type RemoveWatermarkRfProps = RfDataNodeProps<"removeWatermarkNode">;

const DEFAULT_FEATURE = "remove_watermark";

// Workflow execution config
const workflowConfig = {
    feature: DEFAULT_FEATURE,
    outputType: "videoNode",
    outputField: "fileKeys" as const,
    supportsBatch: true,
    batchParam: "video",
    paramMappings: {
        video: {
            sources: [
                upstreamParam("videoNode", "fileKeys[0]", {
                    needsUrlTransform: true,
                }),
            ],
            required: true,
        },
    },
};

const RemoveWatermarkNode = ({ selected, data }: RemoveWatermarkRfProps) => {
    const t = useTranslations("Workspace.nodes");
    const fileKeys = data.fileKeys;

    return (
        <BaseNode
            selected={selected}
            data={data}
            workflowConfig={{
                ...workflowConfig,
                feature: DEFAULT_FEATURE,
                title: t("titles.removeWatermark"),
                icon: <Droplets className="h-5 w-5" />,
                executeLabel: t("actions.removeWatermark"),
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
                            fileKey: fileKey,
                        })) || []
                    );
                },
            }}
        >
            <Card className="p-5 space-y-4">
                <div className="text-sm text-muted-foreground">
                    {t("removeWatermark.hint")}
                </div>
            </Card>
        </BaseNode>
    );
};

export default memo(RemoveWatermarkNode);
