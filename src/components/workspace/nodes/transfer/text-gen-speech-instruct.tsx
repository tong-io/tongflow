import { Atom } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useNodeState } from "@/hooks/use-node-data";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";
import {
    configParam,
    type GetPromptsContext,
    upstreamParam,
} from "@/utils/node-execution-config";
import { BaseNode } from "../base/base-node";

import { TEXT_GEN_SPEECH_INSTRUCT } from "./text-gen-speech-shared";

const TextGenSpeechInstructNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<
    "text-gen-speech-instruct",
    "textGenSpeechInstructNode"
>) => {
    const t = useTranslations("Workspace.nodes");
    const texts = data.texts ?? [];

    const [state, setState] = useNodeState(
        {
            description: "",
        },
        data,
    );
    const { description } = state;

    const workflowConfig = {
        feature: TEXT_GEN_SPEECH_INSTRUCT,
        outputType: "audioNode",
        outputField: "fileKeys" as const,
        supportsBatch: true,
        batchParam: "text",
        paramMappings: {
            text: {
                sources: [upstreamParam("textNode", "texts")],
                required: true,
            },
            description: {
                sources: [configParam("description", "")],
                required: false,
            },
        },
    };

    return (
        <BaseNode
            selected={selected}
            className="min-w-[480px]"
            data={data}
            workflowConfig={{
                ...workflowConfig,
                title: t("titles.textGenSpeechInstruct"),
                icon: <Atom className="h-5 w-5" />,
                executeLabel: t("actions.generateSpeech"),
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

                    const slot = TEXT_GEN_SPEECH_INSTRUCT;
                    return (
                        inputTexts?.map((text) => ({
                            text,
                            nodeSlot: slot,
                            instruct: description || undefined,
                            description: description || undefined,
                        })) || []
                    );
                },
            }}
        >
            <Card
                className="p-5 nodrag"
                onPointerDown={(e) => e.stopPropagation()}
            >
                <div className="mb-4">
                    <label
                        htmlFor="description-input-instruct"
                        className="text-sm text-muted-foreground block mb-2"
                    >
                        {t("common.voiceDescription")}：
                    </label>
                    <textarea
                        id="description-input-instruct"
                        className="w-full h-24 p-2 text-sm rounded-md border border-input bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                        placeholder={t("common.voiceDescriptionPlaceholder")}
                        value={description}
                        onChange={(e) =>
                            setState({ description: e.target.value })
                        }
                    />
                </div>
                {texts && texts.length > 0 && (
                    <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">
                            {t("common.inputText")} ({texts.length})
                        </Label>
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                            {texts.map((text, index) => (
                                <div
                                    key={`${index}-${text.slice(0, 48)}`}
                                    className="text-sm text-foreground p-2 bg-background rounded border border-border/50 line-clamp-2"
                                >
                                    {text}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </Card>
        </BaseNode>
    );
};

TextGenSpeechInstructNode.displayName = "TextGenSpeechInstructNode";

export default memo(TextGenSpeechInstructNode);
