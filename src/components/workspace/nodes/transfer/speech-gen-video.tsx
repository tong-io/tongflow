import { useNodesData } from "@xyflow/react";
import { Atom, Wand2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useMemo } from "react";

import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useAbiForm } from "@/hooks/use-abi-form";
import { handle } from "@/lib/abi/sources";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";
import { coerceBaseNodeData } from "@/utils/flow-node-data";

import { AbiNodeShell } from "../base/abi-node-shell";
import { MediaThumbnail } from "../base/media-thumbnail";
import { NodeTextarea } from "../base/node-textarea";

const SpeechGenVideoNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"speech-text-gen-video", "speechGenVideoNode">) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("speech-text-gen-video");
    const ids = data.ids ?? [];
    const localFileKeys = data.fileKeys ?? [];

    const fromNodes = useNodesData(ids);
    const videoNode = fromNodes.find((node) => node.type === "videoNode");
    const textNode = fromNodes.find((node) => node.type === "textNode");

    const fileKeys: string[] = useMemo(() => {
        if (videoNode) return coerceBaseNodeData(videoNode.data).fileKeys || [];
        return localFileKeys;
    }, [videoNode, localFileKeys]);

    const upstreamTexts: string[] = useMemo(() => {
        if (textNode) return coerceBaseNodeData(textNode.data).texts || [];
        return data.texts || [];
    }, [textNode, data]);

    const hasUpstreamTexts = upstreamTexts && upstreamTexts.length > 0;
    const videoPrompt = (form.state.text as string | undefined) ?? "";

    return (
        <AbiNodeShell
            feature="speech-text-gen-video"
            sourceSpec={{ audio: handle({ nodeType: "videoNode" }) }}
            form={form}
            selected={selected}
            className="min-w-[480px]"
            data={data}
            title={t("titles.speechGenVideo")}
            icon={<Atom className="h-5 w-5" />}
            executeLabel={t("actions.generateAudio")}
            executeDisabled={
                !(videoPrompt || hasUpstreamTexts) || !fileKeys?.length
            }
        >
            <div className="p-4 space-y-4">
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
                        {...form.bind("text")}
                    />
                )}
            </div>
        </AbiNodeShell>
    );
};

SpeechGenVideoNode.displayName = "SpeechGenVideoNode";

export default memo(SpeechGenVideoNode);
