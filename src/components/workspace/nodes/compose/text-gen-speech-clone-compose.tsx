import type { Edge } from "@xyflow/react";
import { useNodeId, useStore } from "@xyflow/react";
import { Atom, Music, Type } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useMemo } from "react";

import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useAbiForm } from "@/hooks/use-abi-form";
import { NODE_TYPE_SOURCE_SPEC } from "@/lib/abi/node-feature-registry";
import { collectHandleValues, resolveSpec } from "@/lib/abi/resolve";
import type { SourceSpec } from "@/lib/abi/sources";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";

import { AbiNodeShell } from "../base/abi-node-shell";
import { LanguageSelect } from "../base/language-select";
import { MediaThumbnail } from "../base/media-thumbnail";

const CLONE_COMPOSE_SOURCE_SPEC =
    NODE_TYPE_SOURCE_SPEC.textGenSpeechCloneComposeNode as SourceSpec<"text-gen-speech-clone">;

const TextGenSpeechCloneComposeNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<
    "text-gen-speech-clone",
    "textGenSpeechCloneComposeNode"
>) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("text-gen-speech-clone", CLONE_COMPOSE_SOURCE_SPEC);

    const nodeId = useNodeId();
    const nodeLookup = useStore((state) => state.nodeLookup);
    const edges = useStore((state) => state.edges as Edge[]);

    const resolvedSpec = useMemo(
        () => resolveSpec("text-gen-speech-clone", CLONE_COMPOSE_SOURCE_SPEC),
        [],
    );

    const { hasText, hasRefAudio, texts, refAudioKey } = useMemo(() => {
        if (!nodeId) {
            return {
                hasText: false,
                hasRefAudio: false,
                texts: [] as string[],
                refAudioKey: undefined as string | undefined,
            };
        }
        const values = collectHandleValues(
            nodeId,
            resolvedSpec,
            Array.from(nodeLookup.values()),
            edges,
        );
        const rawText = values.text;
        const textList = Array.isArray(rawText)
            ? rawText.filter(
                  (x): x is string =>
                      typeof x === "string" && x.trim().length > 0,
              )
            : typeof rawText === "string" && rawText.trim()
              ? [rawText.trim()]
              : [];
        const ref =
            typeof values.ref_audio === "string" ? values.ref_audio : undefined;
        return {
            hasText: textList.length > 0,
            hasRefAudio: Boolean(ref),
            texts: textList,
            refAudioKey: ref,
        };
    }, [nodeId, resolvedSpec, nodeLookup, edges]);

    return (
        <AbiNodeShell
            feature="text-gen-speech-clone"
            sourceSpec={CLONE_COMPOSE_SOURCE_SPEC}
            form={form}
            selected={selected}
            className="min-w-[480px]"
            data={data}
            title={t("titles.textGenSpeechCloneCompose")}
            icon={<Atom className="h-5 w-5" />}
            executeLabel={t("actions.generateSpeech")}
            executeDisabled={!hasText || !hasRefAudio}
        >
            <div className="p-4 space-y-4">
                <Card className="p-3">
                    <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">
                            {t("compose.inputData")}
                        </Label>
                        <div className="flex gap-4">
                            <div className="flex flex-col items-center gap-1.5">
                                <div
                                    className={`relative w-16 h-16 rounded-md border-2 overflow-hidden ${
                                        hasText
                                            ? "border-green-400"
                                            : "border-gray-300"
                                    }`}
                                >
                                    <div className="flex items-center justify-center h-full w-full bg-green-50">
                                        <Type className="w-6 h-6 text-green-600" />
                                    </div>
                                </div>
                                <div className="px-1.5 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded">
                                    {t("compose.text")}
                                </div>
                            </div>
                            {refAudioKey ? (
                                <MediaThumbnail
                                    fileKey={refAudioKey}
                                    label={t("compose.referenceAudio")}
                                    type="audio"
                                />
                            ) : (
                                <div className="flex flex-col items-center gap-1.5">
                                    <div className="relative w-16 h-16 rounded-md border-2 border-gray-300 overflow-hidden bg-gray-100">
                                        <div className="flex items-center justify-center h-full w-full bg-blue-50">
                                            <Music className="w-6 h-6 text-blue-600" />
                                        </div>
                                    </div>
                                    <div className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                                        {t("compose.referenceAudio")}
                                    </div>
                                </div>
                            )}
                        </div>
                        {(!hasText || !hasRefAudio) && (
                            <p className="text-xs text-red-500">
                                {t("compose.connectTextReferenceAudio")}
                            </p>
                        )}
                    </div>
                </Card>

                {hasText ? (
                    <Card className="p-3 bg-muted/50">
                        <Label className="text-sm font-medium text-muted-foreground">
                            {t("common.inputText")}
                            {t("imageEdit.fromUpstream")}
                        </Label>
                        <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                            {texts.map((text, index) => (
                                <div
                                    key={`${index}-${text.slice(0, 48)}`}
                                    className="text-sm text-foreground p-2 bg-background rounded border border-border/50 line-clamp-2"
                                >
                                    {text}
                                </div>
                            ))}
                        </div>
                    </Card>
                ) : null}

                <Card
                    className="p-3 nodrag"
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    <div className="mb-4 flex flex-wrap items-center gap-3">
                        <Label
                            htmlFor="clone-compose-language-select"
                            className="text-sm text-muted-foreground whitespace-nowrap"
                        >
                            {t("common.language")}：
                        </Label>
                        <LanguageSelect
                            id="clone-compose-language-select"
                            value={(form.state.language as string) ?? "Auto"}
                            onChange={(v) => form.set("language", v)}
                        />
                    </div>
                    <div>
                        <label
                            htmlFor="clone-compose-ref-text"
                            className="text-sm text-muted-foreground block mb-2"
                        >
                            {t("compose.referenceTextOptional")}：
                        </label>
                        <textarea
                            id="clone-compose-ref-text"
                            className="w-full h-16 p-2 text-sm rounded-md border border-input bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                            placeholder={t("common.referenceTextCloneHint")}
                            {...form.register("ref_text")}
                        />
                    </div>
                </Card>
            </div>
        </AbiNodeShell>
    );
};

TextGenSpeechCloneComposeNode.displayName = "TextGenSpeechCloneComposeNode";

export default memo(TextGenSpeechCloneComposeNode);
