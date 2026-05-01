import { type NodeProps } from "@xyflow/react";
import { memo } from "react";
import { Box } from "lucide-react";

import { BaseNode } from "../base/base-node";
import { getFileUrl } from "@/lib/file-url";
import {
    upstreamParam,
    type GetPromptsContext,
} from "@/utils/node-execution-config";
import { useTranslations } from "next-intl";

const DEFAULT_FEATURE = "image_gen_model";

// Workflow execution config
const workflowConfig = {
    feature: DEFAULT_FEATURE,
    outputType: "modelNode",
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
    },
};

const ImageGenModelNode = ({ selected, data }: NodeProps) => {
    const t = useTranslations("Workspace.nodes");
    const { fileKeys = [] } = data as { fileKeys?: string[] };

    return (
        <BaseNode
            selected={selected}
            className="min-w-[480px]"
            data={data}
            workflowConfig={{
                ...workflowConfig,
                feature: DEFAULT_FEATURE,
                title: t("titles.imageGenModel"),
                icon: <Box className="h-5 w-5" />,
                executeLabel: t("actions.generate3DModel"),
                executeDisabled: !fileKeys?.length,
                getPrompts: (ctx?: GetPromptsContext) => {
                    const upstreamKeys = ctx?.getAllUpstreamData(
                        "imageNode",
                        "fileKeys",
                    ) as string[] | undefined;
                    const keys =
                        upstreamKeys && upstreamKeys.length > 0
                            ? upstreamKeys
                            : fileKeys;
                    return keys.map((fileKey) => ({
                        image: getFileUrl(fileKey),
                    }));
                },
            }}
        />
    );
};

ImageGenModelNode.displayName = "ImageGenModelNode";

export default memo(ImageGenModelNode);
