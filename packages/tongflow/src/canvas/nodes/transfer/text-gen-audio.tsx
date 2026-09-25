import { useNodesData } from "@xyflow/react";
import { AudioWaveform, Sparkles } from "lucide-react";
import { memo, useCallback, useMemo, useRef } from "react";
import { useTranslations } from "use-intl";
import type { TongflowPluginNodeProps } from "../../../core";
import { coerceBaseNodeData } from "../../../core";
import { useAbiForm } from "../../hooks/use-abi-form";
import { useUpstreamNodeIds } from "../../hooks/use-upstream-ids";
import { AbiNodeShell } from "../base/abi-node-shell";
import { MediaThumbnail } from "../base/media-thumbnail";
import { NodeTextarea } from "../base/node-textarea";

// Reference voices are addressed in the prompt as @voice1..@voiceN, in
// connection order. Qwen-Audio-3.1-TTS-Next (the reference implementation)
// takes at most three.
const MAX_REF_AUDIOS = 3;
const VOICE_TAG = "@voice";

const TextGenAudioNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"text-gen-audio", "textGenAudioNode">) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("text-gen-audio");

    const ids = useUpstreamNodeIds(data.ids);
    const fromNodes = useNodesData(ids);

    const refAudios = fromNodes
        .filter((node) => node.type === "audioNode")
        .map((node) => coerceBaseNodeData(node.data).fileKeys)
        .filter((keys): keys is string[] => !!keys && keys.length > 0);

    const textNode = fromNodes.find((node) => node.type === "textNode");
    const upstreamTexts: string[] = useMemo(
        () => (textNode ? coerceBaseNodeData(textNode.data).texts || [] : []),
        [textNode],
    );
    const hasUpstreamTexts = upstreamTexts.length > 0;

    const prompt = (form.state.text as string | undefined) ?? "";
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const insertVoiceTag = useCallback(
        (tag: string) => {
            const textarea = textareaRef.current;
            if (!textarea) return;
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            form.set(
                "text",
                prompt.substring(0, start) + tag + prompt.substring(end),
            );
            setTimeout(() => {
                textarea.focus();
                const cursor = start + tag.length;
                textarea.setSelectionRange(cursor, cursor);
            }, 0);
        },
        [prompt, form],
    );

    return (
        <AbiNodeShell
            feature="text-gen-audio"
            form={form}
            selected={selected}
            className="min-w-[480px]"
            data={data}
            title={t("titles.textGenAudio")}
            icon={<AudioWaveform className="h-5 w-5" />}
            executeLabel={t("actions.generateAudio")}
            executeDisabled={!hasUpstreamTexts && !prompt.trim()}
        >
            <div className="p-4 space-y-4">
                {refAudios.length > 0 && (
                    <div className="space-y-2">
                        <span className="text-sm font-medium text-muted-foreground">
                            {t("textGenAudio.voiceReference")}
                            <span className="ml-2 text-xs font-normal">
                                ({refAudios.length}/{MAX_REF_AUDIOS})
                            </span>
                        </span>
                        <div className="flex gap-3 flex-wrap">
                            {refAudios
                                .slice(0, MAX_REF_AUDIOS)
                                .map((keys, index) => (
                                    <MediaThumbnail
                                        key={keys[0]}
                                        fileKey={keys[0]}
                                        label={`${VOICE_TAG}${index + 1}`}
                                        type="audio"
                                        onClick={() =>
                                            insertVoiceTag(
                                                `${VOICE_TAG}${index + 1}`,
                                            )
                                        }
                                    />
                                ))}
                        </div>
                    </div>
                )}
                <p className="text-xs text-muted-foreground">
                    {t("textGenAudio.hint")}
                </p>

                {hasUpstreamTexts ? (
                    <div className="space-y-2">
                        <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                            <Sparkles className="h-4 w-4" />
                            {t("textGenAudio.promptLabel")}
                            {t("imageEdit.fromUpstream")}
                        </span>
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                            {upstreamTexts.map((text, index) => (
                                <div
                                    key={`${index}-${text.slice(0, 48)}`}
                                    className="text-sm text-foreground p-2 bg-background rounded border border-border/50 line-clamp-3"
                                >
                                    {text}
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="space-y-2">
                        <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                            <Sparkles className="h-4 w-4" />
                            {t("textGenAudio.promptLabel")}
                        </span>
                        <NodeTextarea
                            ref={textareaRef}
                            showCard={false}
                            placeholder={t("textGenAudio.promptPlaceholder")}
                            {...form.bind("text")}
                            rows={5}
                        />
                    </div>
                )}
            </div>
        </AbiNodeShell>
    );
};

TextGenAudioNode.displayName = "TextGenAudioNode";

export default memo(TextGenAudioNode);
