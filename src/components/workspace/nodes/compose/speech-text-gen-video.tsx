import { useNodesData } from "@xyflow/react";
import { FileText, Sparkles, Video } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useNodeState } from "@/hooks/use-node-data";
import { getFileUrl } from "@/lib/file-url";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";
import {
    configParam,
    type GetPromptsContext,
    upstreamParam,
} from "@/utils/node-execution-config";
import { BaseNode } from "../base/base-node";
import { MediaThumbnail } from "../base/media-thumbnail";
import { NodeTextarea } from "../base/node-textarea";

// Text preview component
const TextPreview = memo(
    ({
        text,
        label,
        noTextLabel,
    }: {
        text?: string;
        label: string;
        noTextLabel: string;
    }) => {
        return (
            <div className="flex flex-col items-center gap-1.5">
                <div className="relative w-32 h-16 rounded-md border-2 border-gray-300 overflow-hidden bg-gray-50 transition-colors">
                    <div className="flex items-center justify-center h-full w-full p-2">
                        {text ? (
                            <div className="text-xs text-gray-700 line-clamp-3 text-center">
                                {text}
                            </div>
                        ) : (
                            <div className="flex items-center gap-1 text-gray-400">
                                <FileText className="h-4 w-4" />
                                <span className="text-xs">{noTextLabel}</span>
                            </div>
                        )}
                    </div>
                    <div className="absolute inset-0 bg-black/0 transition-colors" />
                </div>
                <div className="px-1.5 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded">
                    {label}
                </div>
            </div>
        );
    },
);

TextPreview.displayName = "TextPreview";

// Workflow execution config
const workflowConfig = {
    feature: "speech-text-gen-video",
    outputType: "videoNode",
    outputField: "fileKeys" as const,
    supportsBatch: false,
    paramMappings: {
        text: {
            sources: [
                upstreamParam("textNode", "texts[0]"),
                configParam("text"),
            ],
            required: true,
        },
        audio: {
            sources: [upstreamParam("audioNode", "fileKeys[0]")],
            required: true,
        },
    },
};

const SpeechTextGenVideoNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<
    "speech-text-gen-video",
    "speechTextGenVideoNode"
>) => {
    const t = useTranslations("Workspace.nodes");
    const ids = data.ids ?? [];
    const fromNodes = useNodesData(ids);

    // Get text and audio data
    const textNode = fromNodes.find((node) => node.type === "textNode");
    const audio = fromNodes.find((node) => node.type === "audioNode");

    const textContent = (textNode?.data as any)?.texts?.[0] || "";
    const audioFileKey = (audio?.data as any)?.fileKeys?.[0];

    // Use the new hook to manage state persistence
    const [state, setState] = useNodeState(
        {
            text: "",
        },
        data,
    );
    const { text } = state;

    const finalText = textContent || text;

    return (
        <BaseNode
            selected={selected}
            className="min-w-[480px]"
            data={data}
            workflowConfig={{
                ...workflowConfig,
                title: t("titles.speechTextGenVideo"),
                icon: <Video className="h-5 w-5" />,
                executeLabel: t("actions.generateVideo"),
                executeDisabled: (!textContent && !text) || !audioFileKey,
                getPrompts: (ctx?: GetPromptsContext) => {
                    const upstreamText = ctx?.getUpstreamData(
                        "textNode",
                        "texts[0]",
                    );
                    const upstreamAudio = ctx?.getUpstreamData(
                        "audioNode",
                        "fileKeys[0]",
                    );
                    const finalTextValue = upstreamText || finalText;
                    const finalAudioValue = upstreamAudio || audioFileKey;
                    return finalTextValue && finalAudioValue
                        ? [
                              {
                                  text: finalTextValue,
                                  audio: getFileUrl(finalAudioValue),
                              },
                          ]
                        : [];
                },
            }}
        >
            <div className="p-4 space-y-4">
                {/* Media display area */}
                <Card className="p-3">
                    <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">
                            {t("compose.inputContent")}
                        </Label>
                        <div className="flex gap-4">
                            {textContent && (
                                <TextPreview
                                    text={textContent}
                                    label={t("compose.text")}
                                    noTextLabel={t("compose.noText")}
                                />
                            )}
                            {audioFileKey && (
                                <MediaThumbnail
                                    fileKey={audioFileKey}
                                    label={t("compose.audio")}
                                    type="audio"
                                />
                            )}
                        </div>
                        {(!textContent || !audioFileKey) && (
                            <p className="text-xs text-red-500">
                                {t("compose.connectTextAudio")}
                            </p>
                        )}
                    </div>
                </Card>

                {/* Text input - shown when no text is received from the previous node */}
                {!textContent && (
                    <NodeTextarea
                        label={t("compose.inputText")}
                        icon={Sparkles}
                        placeholder={t("compose.inputTextPlaceholder")}
                        value={text}
                        onChange={(value) => setState({ text: value })}
                        rows={4}
                    />
                )}
            </div>
        </BaseNode>
    );
};

export default memo(SpeechTextGenVideoNode);
