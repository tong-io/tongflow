import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";
import { Atom } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useCallback, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useNodeState } from "@/hooks/use-node-data";
import {
    configParam,
    type GetPromptsContext,
    upstreamParam,
} from "@/utils/node-execution-config";
import { BaseNode } from "../base/base-node";

import {
    buildEmotionOptions,
    buildGenderOptions,
    buildPresetDescription,
    buildStyleOptions,
    TEXT_GEN_SPEECH_PRESET,
} from "./text-gen-speech-shared";

const TextGenSpeechPresetNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"text-gen-speech-preset", "textGenSpeechPresetNode">) => {
    const t = useTranslations("Workspace.nodes");
    const texts = data.texts ?? [];

    const genderOptions = useMemo(() => buildGenderOptions(t), [t]);
    const emotionOptions = useMemo(() => buildEmotionOptions(t), [t]);
    const styleOptions = useMemo(() => buildStyleOptions(t), [t]);

    const [state, setState] = useNodeState(
        {
            genders: [] as string[],
            emotions: [] as string[],
            styles: [] as string[],
        },
        data,
    );
    const { genders, emotions, styles } = state;

    const buildDesc = useCallback(
        () =>
            buildPresetDescription(
                genders ?? [],
                emotions ?? [],
                styles ?? [],
                genderOptions,
                emotionOptions,
                styleOptions,
            ),
        [
            genders,
            emotions,
            styles,
            genderOptions,
            emotionOptions,
            styleOptions,
        ],
    );

    const workflowConfig = {
        feature: TEXT_GEN_SPEECH_PRESET,
        outputType: "audioNode",
        outputField: "fileKeys" as const,
        supportsBatch: true,
        batchParam: "text",
        paramMappings: {
            text: {
                sources: [upstreamParam("textNode", "texts")],
                required: true,
            },
            emotion: {
                sources: [configParam("emotion", "")],
                required: false,
            },
            style: {
                sources: [configParam("style", "")],
                required: false,
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
                title: t("titles.textGenSpeechPreset"),
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

                    const slot = TEXT_GEN_SPEECH_PRESET;
                    return (
                        inputTexts?.map((text) => {
                            const presetDesc = buildDesc() || undefined;
                            return {
                                text,
                                nodeSlot: slot,
                                instruct: presetDesc,
                                description: presetDesc,
                            };
                        }) || []
                    );
                },
            }}
        >
            <Card
                className="p-5 nodrag"
                onPointerDown={(e) => e.stopPropagation()}
            >
                <div className="mb-4">
                    <div className="text-sm text-muted-foreground block mb-2">
                        {t("common.gender")}：
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {genderOptions
                            .filter((opt) => opt.value !== "none")
                            .map((opt) => (
                                <label
                                    key={opt.value}
                                    className={`px-3 py-1.5 rounded-md text-sm cursor-pointer border transition-colors ${
                                        genders?.includes(opt.value)
                                            ? "bg-primary text-primary-foreground border-primary"
                                            : "bg-background border-border hover:bg-accent"
                                    }`}
                                >
                                    <input
                                        type="checkbox"
                                        className="sr-only"
                                        checked={
                                            genders?.includes(opt.value) ||
                                            false
                                        }
                                        onChange={(e) => {
                                            const newGenders = e.target.checked
                                                ? [
                                                      ...(genders || []),
                                                      opt.value,
                                                  ]
                                                : (genders || []).filter(
                                                      (g) => g !== opt.value,
                                                  );
                                            setState({ genders: newGenders });
                                        }}
                                    />
                                    {opt.label}
                                </label>
                            ))}
                    </div>
                </div>
                <div className="mb-4">
                    <div className="text-sm text-muted-foreground block mb-2">
                        {t("common.emotion")}：
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {emotionOptions
                            .filter((opt) => opt.value !== "none")
                            .map((opt) => (
                                <label
                                    key={opt.value}
                                    className={`px-3 py-1.5 rounded-md text-sm cursor-pointer border transition-colors ${
                                        emotions?.includes(opt.value)
                                            ? "bg-primary text-primary-foreground border-primary"
                                            : "bg-background border-border hover:bg-accent"
                                    }`}
                                >
                                    <input
                                        type="checkbox"
                                        className="sr-only"
                                        checked={
                                            emotions?.includes(opt.value) ||
                                            false
                                        }
                                        onChange={(e) => {
                                            const newEmotions = e.target.checked
                                                ? [
                                                      ...(emotions || []),
                                                      opt.value,
                                                  ]
                                                : (emotions || []).filter(
                                                      (em) => em !== opt.value,
                                                  );
                                            setState({
                                                emotions: newEmotions,
                                            });
                                        }}
                                    />
                                    {opt.label}
                                </label>
                            ))}
                    </div>
                </div>
                <div className="mb-4">
                    <div className="text-sm text-muted-foreground block mb-2">
                        {t("common.style")}：
                    </div>
                    <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                        {styleOptions
                            .filter((opt) => opt.value !== "none")
                            .map((opt) => (
                                <label
                                    key={opt.value}
                                    className={`px-3 py-1.5 rounded-md text-sm cursor-pointer border transition-colors ${
                                        styles?.includes(opt.value)
                                            ? "bg-primary text-primary-foreground border-primary"
                                            : "bg-background border-border hover:bg-accent"
                                    }`}
                                >
                                    <input
                                        type="checkbox"
                                        className="sr-only"
                                        checked={
                                            styles?.includes(opt.value) || false
                                        }
                                        onChange={(e) => {
                                            const newStyles = e.target.checked
                                                ? [...(styles || []), opt.value]
                                                : (styles || []).filter(
                                                      (s) => s !== opt.value,
                                                  );
                                            setState({ styles: newStyles });
                                        }}
                                    />
                                    {opt.label}
                                </label>
                            ))}
                    </div>
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

TextGenSpeechPresetNode.displayName = "TextGenSpeechPresetNode";

export default memo(TextGenSpeechPresetNode);
