import {
    useNodeId,
    useNodesData,
} from "@xyflow/react";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";
import { memo, useCallback, useMemo } from "react";
import { Atom, Wand2 } from "lucide-react";
import { BaseNode } from "../base/base-node";
import { useNodeState } from "@/hooks/use-node-data";
import useFlow from "@/hooks/use-flow";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NodeTextarea } from "../base/node-textarea";
import { MediaThumbnail } from "../base/media-thumbnail";
import { getFileUrl } from "@/lib/file-url";
import {
    upstreamParam,
    configParam,
    type GetPromptsContext,
} from "@/utils/node-execution-config";
import { useTranslations } from "next-intl";
import { coerceBaseNodeData } from "@/utils/flow-node-data";

const DEFAULT_FEATURE = "speech-text-gen-video";

const SpeechGenVideoNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"speech-text-gen-video", "speechGenVideoNode">) => {
    const t = useTranslations("Workspace.nodes");
    const ids = data.ids ?? [];
    const localFileKeys = data.fileKeys ?? [];
    const expands = useFlow((s) => s.expands);
    const id = useNodeId()!;

    // If ids are present, get data from associated nodes (composition mode)
    const fromNodes = useNodesData(ids);
    const videoNode = fromNodes.find((node) => node.type === "videoNode");
    const textNode = fromNodes.find((node) => node.type === "textNode");

    // Get fileKeys and texts from the composite node or directly from data
    const fileKeys: string[] = useMemo(() => {
        if (videoNode) {
            return coerceBaseNodeData(videoNode.data).fileKeys || [];
        }
        return localFileKeys;
    }, [videoNode, localFileKeys]);

    const upstreamTexts: string[] = useMemo(() => {
        if (textNode) {
            return coerceBaseNodeData(textNode.data).texts || [];
        }
        return data.texts || [];
    }, [textNode, data]);

    // Determine whether there is upstream text input
    const hasUpstreamTexts = upstreamTexts && upstreamTexts.length > 0;
    // Get the prompt that will actually be used
    const effectivePrompt = hasUpstreamTexts ? upstreamTexts[0] : "";

    // Use the new hook to manage state persistence
    const [state, setState] = useNodeState(
        {
            videoPrompt: "",
        },
        data,
    );
    const { videoPrompt } = state;

    // No custom onTaskUpdate needed; BaseNode auto-expands `file_key` / `file_keys`.

    const workflowConfig = {
        feature: "speech-text-gen-video",
        outputType: "videoNode",
        outputField: "fileKeys" as const,
        paramMappings: {
            audio: {
                sources: [
                    upstreamParam("videoNode", "fileKeys[0]", {
                        needsUrlTransform: true,
                    }),
                ],
                required: true,
            },
            text: {
                sources: [configParam("videoPrompt", "")],
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
                title: t("titles.speechGenVideo"),
                icon: <Atom className="h-5 w-5" />,
                executeLabel: t("actions.generateAudio"),
                executeDisabled:
                    !(videoPrompt || hasUpstreamTexts) || !fileKeys?.length,
                getPrompts: (ctx?: GetPromptsContext) => {
                    const upstreamKeys = ctx?.getAllUpstreamData(
                        "videoNode",
                        "fileKeys",
                    ) as string[] | undefined;
                    const keys =
                        upstreamKeys && upstreamKeys.length > 0
                            ? upstreamKeys
                            : fileKeys;

                    // Prefer the latest text data from upstream nodes
                    const ctxUpstreamTexts = ctx?.getAllUpstreamData(
                        "textNode",
                        "texts",
                    ) as string[] | undefined;
                    const text =
                        ctxUpstreamTexts && ctxUpstreamTexts.length > 0
                            ? ctxUpstreamTexts[0]
                            : hasUpstreamTexts
                              ? effectivePrompt
                              : videoPrompt;

                    return [
                        {
                            text,
                            audio: getFileUrl(keys[0]),
                        },
                    ];
                },
            }}
        >
            <div className="p-4 space-y-4">
                {/* Media display area */}
                <Card className="p-3">
                    <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">
                            {t("speechGenVideo.inputContent")}
                        </Label>
                        <div className="flex gap-4">
                            {fileKeys && fileKeys.length > 0 && (
                                <MediaThumbnail
                                    fileKey={fileKeys[0]}
                                    label={t("speechGenVideo.video")}
                                    type="video"
                                />
                            )}
                        </div>
                        {(!fileKeys || fileKeys.length === 0) && (
                            <p className="text-xs text-red-500">
                                {t("speechGenVideo.connectVideoHint")}
                            </p>
                        )}
                    </div>
                </Card>

                {/* Audio description input - show a preview when upstream text exists */}
                {hasUpstreamTexts ? (
                    <Card className="p-3 bg-muted/50">
                        <div className="space-y-2">
                            <Label className="text-sm font-medium text-muted-foreground">
                                {t("speechGenVideo.audioPromptLabel")}
                                {t("imageEdit.fromUpstream")}
                            </Label>
                            <div className="space-y-1 max-h-32 overflow-y-auto">
                                {upstreamTexts.map((text, index) => (
                                    <div
                                        key={index}
                                        className="text-sm text-foreground p-2 bg-background rounded border border-border/50 line-clamp-3"
                                    >
                                        {text}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </Card>
                ) : (
                    <NodeTextarea
                        label={t("speechGenVideo.audioPromptLabel")}
                        icon={Wand2}
                        rows={4}
                        placeholder={t("speechGenVideo.audioPromptPlaceholder")}
                        value={videoPrompt}
                        onChange={(value) => setState({ videoPrompt: value })}
                    />
                )}
            </div>
        </BaseNode>
    );
};

SpeechGenVideoNode.displayName = "SpeechGenVideoNode";

export default memo(SpeechGenVideoNode);
