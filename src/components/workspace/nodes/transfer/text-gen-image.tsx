import { useNodeId } from "@xyflow/react";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";
import { Atom } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useCallback } from "react";
import useFlow from "@/hooks/use-flow";
import {
    configParam,
    type GetPromptsContext,
    staticParam,
    upstreamParam,
} from "@/utils/node-execution-config";
import {
    IMAGE_ASPECT_RATIOS,
    type AspectRatio,
} from "@/constants/media-options";
import { AspectRatioPicker } from "../base/aspect-ratio-picker";
import { BaseNode } from "../base/base-node";

// Default prompt parameters
const defaultPrompt = {
    width: 1024,
    height: 1024,
};

// Workflow execution config
const workflowConfig = {
    feature: "image-gen",
    outputType: "imageNode",
    outputField: "fileKeys" as const,
    paramMappings: {
        // Note: the text parameter is read from the upstream textNode first to ensure dynamically generated text is used
        text: {
            sources: [upstreamParam("textNode", "texts[0]")],
            required: true,
        },
        width: {
            sources: [
                configParam("selectedAspectRatio.width"),
                staticParam(1024),
            ],
        },
        height: {
            sources: [
                configParam("selectedAspectRatio.height"),
                staticParam(1024),
            ],
        },
    },
};

type TextGenImageNodeProps =
    TongflowPluginNodeProps<"image-gen", "textGenImageNode">;

const TextGenImageNode = ({ selected, data }: TextGenImageNodeProps) => {
    const t = useTranslations("Workspace.nodes");
    const { texts = [] } = data;
    const selectedAspectRatio = data.selectedAspectRatio as
        | AspectRatio
        | undefined;
    const prompt = { ...defaultPrompt, ...(data.prompt ?? {}) };
    const id = useNodeId()!;
    const updates = useFlow((s) => s.updates);

    // Select aspect ratio
    const handleSelectRatio = useCallback(
        (ratio: AspectRatio) => {
            updates(id, {
                ...data,
                prompt: { ...prompt, width: ratio.width, height: ratio.height },
                selectedAspectRatio: ratio,
            });
        },
        [id, data, prompt, updates],
    );

    // Currently selected aspect ratio (matched from width/height in prompt)
    const currentRatio =
        selectedAspectRatio ??
        IMAGE_ASPECT_RATIOS.find(
            (r) => r.width === prompt.width && r.height === prompt.height,
        ) ??
        IMAGE_ASPECT_RATIOS[0];

    return (
        <BaseNode
            selected={selected}
            className="min-w-[480px]"
            data={data}
            workflowConfig={{
                ...workflowConfig,
                title: t("titles.textGenImage"),
                icon: <Atom className="h-5 w-5" />,
                executeLabel: t("actions.generateImage"),
                executeDisabled: !texts?.length,
                getPrompts: (ctx?: GetPromptsContext) => {
                    const upstreamTexts = ctx?.getAllUpstreamData(
                        "textNode",
                        "texts",
                    ) as string[] | undefined;
                    const inputTexts =
                        upstreamTexts && upstreamTexts.length > 0
                            ? upstreamTexts
                            : texts;
                    return inputTexts.map((text) => ({
                        text,
                        width: prompt.width,
                        height: prompt.height,
                    }));
                },
            }}
        >
            <div className="p-4 space-y-4">
                <AspectRatioPicker
                    ratios={IMAGE_ASPECT_RATIOS}
                    value={currentRatio}
                    onChange={handleSelectRatio}
                    showSize
                />
            </div>
        </BaseNode>
    );
};

TextGenImageNode.displayName = "TextGenImageNode";

export default memo(TextGenImageNode);
