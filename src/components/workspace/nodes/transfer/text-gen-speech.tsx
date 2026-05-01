import { type NodeProps } from "@xyflow/react";
import { memo, useCallback, useMemo, useRef } from "react";
import { Atom, Ear, Upload, Mic } from "lucide-react";
import { getFileUrl } from "@/lib/file-url";

import { BaseNode } from "../base/base-node";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Select,
    SelectTrigger,
    SelectContent,
    SelectItem,
    SelectValue,
} from "@/components/ui/select";
import { useNodeState } from "@/hooks/use-node-data";
import {
    upstreamParam,
    configParam,
    type GetPromptsContext,
} from "@/utils/node-execution-config";
import { useTranslations, useLocale } from "next-intl";
import { logger } from "@/lib/logger";

import { SpeakerVoiceRecorder } from "@/components/workspace/speaker-voice-recorder";
import {
    crawledVoiceOptions,
    type VoiceLanguage,
} from "@/config/voice-options";

const VOICE_LANG_LABELS: Record<VoiceLanguage, string> = {
    zh: "中文",
    en: "English",
    ja: "日本語",
};

/** Must match `nodePluginMap` keys in plugins.registry.json (not a display id). */
const PLUGIN_REGISTRY_FEATURE = "gen_speech";

const TextGenSpeechNode = ({ selected, data }: NodeProps) => {
    const t = useTranslations("Workspace.nodes");
    const locale = useLocale();
    const { texts = [] } = data as { texts?: string[] };

    const defaultVoiceLang: VoiceLanguage =
        locale in crawledVoiceOptions ? (locale as VoiceLanguage) : "zh";

    const getDefaultVoice = (lang: VoiceLanguage) =>
        lang === "zh"
            ? "zh_famale_1.wav"
            : (crawledVoiceOptions[lang][0]?.value ?? "zh_famale_1.wav");

    const getVoiceOptions = useCallback(
        (lang: VoiceLanguage) => {
            if (lang === "zh") {
                return [
                    {
                        label: t("common.voiceOptions.female"),
                        value: "zh_famale_1.wav",
                    },
                    {
                        label: t("common.voiceOptions.male"),
                        value: "zh_male_1.wav",
                    },
                    ...crawledVoiceOptions.zh,
                ];
            }
            return [...crawledVoiceOptions[lang]];
        },
        [t],
    );

    const emotionOptions = [
        { label: t("emotions.none"), value: "none" },
        { label: t("emotions.happy"), value: "happy" },
        { label: t("emotions.angry"), value: "angry" },
        { label: t("emotions.sad"), value: "sad" },
        { label: t("emotions.fear"), value: "fear" },
        { label: t("emotions.surprised"), value: "surprised" },
        { label: t("emotions.confusion"), value: "confusion" },
        { label: t("emotions.empathy"), value: "empathy" },
        { label: t("emotions.embarrass"), value: "embarrass" },
        { label: t("emotions.excited"), value: "excited" },
        { label: t("emotions.depressed"), value: "depressed" },
        { label: t("emotions.admiration"), value: "admiration" },
        { label: t("emotions.coldness"), value: "coldness" },
    ];

    const styleOptions = [
        { label: t("styles.none"), value: "none" },
        { label: t("styles.serious"), value: "serious" },
        { label: t("styles.arrogant"), value: "arrogant" },
        { label: t("styles.child"), value: "child" },
        { label: t("styles.older"), value: "older" },
        { label: t("styles.girl"), value: "girl" },
        { label: t("styles.pure"), value: "pure" },
        { label: t("styles.sister"), value: "sister" },
        { label: t("styles.sweet"), value: "sweet" },
        { label: t("styles.exaggerated"), value: "exaggerated" },
        { label: t("styles.ethereal"), value: "ethereal" },
        { label: t("styles.whisper"), value: "whisper" },
        { label: t("styles.generous"), value: "generous" },
        { label: t("styles.recite"), value: "recite" },
        { label: t("styles.act_coy"), value: "act_coy" },
        { label: t("styles.warm"), value: "warm" },
        { label: t("styles.shy"), value: "shy" },
        { label: t("styles.comfort"), value: "comfort" },
        { label: t("styles.authority"), value: "authority" },
        { label: t("styles.chat"), value: "chat" },
        { label: t("styles.radio"), value: "radio" },
        { label: t("styles.soulful"), value: "soulful" },
        { label: t("styles.gentle"), value: "gentle" },
        { label: t("styles.story"), value: "story" },
        { label: t("styles.vivid"), value: "vivid" },
        { label: t("styles.program"), value: "program" },
        { label: t("styles.news"), value: "news" },
        { label: t("styles.advertising"), value: "advertising" },
        { label: t("styles.roar"), value: "roar" },
        { label: t("styles.murmur"), value: "murmur" },
        { label: t("styles.shout"), value: "shout" },
        { label: t("styles.deeply"), value: "deeply" },
        { label: t("styles.loudly"), value: "loudly" },
    ];

    const genderOptions = [
        { label: t("genders.none"), value: "none" },
        { label: t("genders.male"), value: "male" },
        { label: t("genders.female"), value: "female" },
    ];

    // Use the new hook to manage state persistence
    const [state, setState] = useNodeState(
        {
            mode: "clone" as "clone" | "preset" | "describe",
            voiceLang: defaultVoiceLang,
            voice: getDefaultVoice(defaultVoiceLang),
            genders: [] as string[],
            emotions: [] as string[],
            styles: [] as string[],
            description: "",
            speakers: getVoiceOptions(defaultVoiceLang),
        },
        data,
    );
    const {
        mode,
        voiceLang = defaultVoiceLang,
        voice,
        genders,
        emotions,
        styles,
        description,
        speakers,
    } = state;

    /** Modal / registry slot for this mode (BaseNode default uses PLUGIN_REGISTRY_FEATURE only). */
    const speechNodeSlot = useMemo((): string => {
        switch (mode) {
            case "clone":
                return "text_gen_speech_clone";
            case "describe":
                return "text_gen_speech_instruct";
            case "preset":
            default:
                return "gen_speech";
        }
    }, [mode]);

    const voiceOptions = useMemo(
        () => getVoiceOptions(voiceLang),
        [voiceLang, getVoiceOptions],
    );

    // Audio playback reference
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Preview voice
    const playVoicePreview = useCallback(() => {
        if (!voice || voice === "default") return;

        // Stop current playback
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }

        const audioUrl = getFileUrl(voice);
        const audio = new Audio(audioUrl);
        audioRef.current = audio;
        audio.play().catch((err) => {
            logger.error("Failed to play audio:", err);
        });
    }, [voice]);

    // Note: no custom onTaskUpdate is needed.
    // BaseNode default logic reads task.data.file_key and expands automatically according to outputType/outputField.

    // Concatenate the preset gender, emotion, and style into a description string
    const buildPresetDescription = () => {
        const parts: string[] = [];

        // Handle the gender array
        if (genders && genders.length > 0) {
            const labels = genders
                .map(
                    (g) =>
                        genderOptions.find((opt) => opt.value === g)?.label ||
                        g,
                )
                .filter(Boolean);
            if (labels.length > 0) parts.push(...labels);
        }

        // Handle the emotion array
        if (emotions && emotions.length > 0) {
            const labels = emotions
                .map(
                    (e) =>
                        emotionOptions.find((opt) => opt.value === e)?.label ||
                        e,
                )
                .filter(Boolean);
            if (labels.length > 0) parts.push(...labels);
        }

        // Handle the style array
        if (styles && styles.length > 0) {
            const labels = styles
                .map(
                    (s) =>
                        styleOptions.find((opt) => opt.value === s)?.label || s,
                )
                .filter(Boolean);
            if (labels.length > 0) parts.push(...labels);
        }

        return parts.join("，");
    };

    // Workflow execution config
    const workflowConfig = {
        feature: PLUGIN_REGISTRY_FEATURE,
        outputType: "audioNode",
        outputField: "fileKeys" as const,
        supportsBatch: true,
        batchParam: "text",
        paramMappings: {
            text: {
                sources: [upstreamParam("textNode", "texts")],
                required: true,
            },
            audio: {
                sources: [configParam("voice", "zh_famale_1.wav")],
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
                title: t("titles.textGenSpeech"),
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

                    return (
                        inputTexts?.map((text) => {
                            const baseParams: Record<string, unknown> = {
                                text,
                                nodeSlot: speechNodeSlot,
                            };
                            switch (mode) {
                                case "preset": {
                                    const presetDesc =
                                        buildPresetDescription() || undefined;
                                    return {
                                        ...baseParams,
                                        instruct: presetDesc,
                                        description: presetDesc,
                                    };
                                }
                                case "describe":
                                    return {
                                        ...baseParams,
                                        instruct: description || undefined,
                                        description: description || undefined,
                                    };
                                case "clone":
                                default: {
                                    const ref = getFileUrl(voice);
                                    return {
                                        ...baseParams,
                                        audio: ref,
                                        ref_audio: ref,
                                    };
                                }
                            }
                        }) || []
                    );
                },
            }}
        >
            <Card
                className="p-5 nodrag"
                onPointerDown={(e) => e.stopPropagation()}
            >
                {/* Mode switch */}
                <Tabs
                    value={mode}
                    onValueChange={(value) =>
                        setState({
                            mode: value as "clone" | "preset" | "describe",
                        })
                    }
                    className="mb-4"
                >
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="clone">
                            {t("common.voiceClone")}
                        </TabsTrigger>
                        <TabsTrigger value="preset">
                            {t("common.voicePreset")}
                        </TabsTrigger>
                        <TabsTrigger value="describe">
                            {t("common.voiceDescribe")}
                        </TabsTrigger>
                    </TabsList>
                </Tabs>

                {/* Clone mode: select voice */}
                {mode === "clone" && (
                    <div className="mb-4 flex flex-wrap items-center gap-3">
                        <Select
                            value={voiceLang}
                            onValueChange={(value) => {
                                const lang = value as VoiceLanguage;
                                setState({
                                    voiceLang: lang,
                                    voice: getDefaultVoice(lang),
                                    speakers: getVoiceOptions(lang),
                                });
                            }}
                        >
                            <SelectTrigger className="w-28 h-9">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {(
                                    Object.keys(
                                        crawledVoiceOptions,
                                    ) as VoiceLanguage[]
                                ).map((lang) => (
                                    <SelectItem key={lang} value={lang}>
                                        {VOICE_LANG_LABELS[lang]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <label
                            htmlFor="voice-select"
                            className="text-sm text-muted-foreground whitespace-nowrap"
                        >
                            {t("common.voice")}：
                        </label>
                        <Select
                            value={voice}
                            onValueChange={(value) =>
                                setState({ voice: value })
                            }
                        >
                            <SelectTrigger
                                id="voice-select"
                                className="w-36 h-9"
                            >
                                <SelectValue
                                    placeholder={t("common.selectVoice")}
                                />
                            </SelectTrigger>
                            <SelectContent>
                                {voiceOptions.map((opt) => (
                                    <SelectItem
                                        key={opt.value}
                                        value={opt.value}
                                    >
                                        {opt.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {/* Preview button */}
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="ml-1"
                            title={t("common.previewVoice")}
                            onClick={playVoicePreview}
                            disabled={!voice || voice === "default"}
                        >
                            <Ear className="w-5 h-5 text-primary" />
                        </Button>
                        {/* Upload voice button */}
                        <label className="cursor-pointer">
                            <input
                                type="file"
                                multiple
                                hidden
                                onChange={(e) => {
                                    const files = Array.from(
                                        e.target.files || [],
                                    );
                                    if (files.length > 0) {
                                        logger.debug("Uploading files:", files);
                                    }
                                }}
                            />
                            <Button
                                variant="outline"
                                size="icon"
                                className="ml-1"
                                title={t("common.uploadVoice")}
                                asChild
                            >
                                <span>
                                    <Upload className="w-4 h-4" />
                                </span>
                            </Button>
                        </label>
                        {/* Record voice button */}
                        <SpeakerVoiceRecorder
                            trigger={
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="ml-1"
                                    title={t("common.recordVoice")}
                                >
                                    <Mic className="w-4 h-4" />
                                </Button>
                            }
                            onChange={(key) => {
                                setState((prev) => ({
                                    ...prev,
                                    voice: key,
                                    speakers: [
                                        ...prev.speakers,
                                        { label: key, value: key },
                                    ],
                                }));
                            }}
                        />
                    </div>
                )}

                {/* Preset mode: select emotion and style */}
                {mode === "preset" && (
                    <>
                        {/* Gender multiselect */}
                        <div className="mb-4">
                            <label className="text-sm text-muted-foreground block mb-2">
                                {t("common.gender")}：
                            </label>
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
                                                    genders?.includes(
                                                        opt.value,
                                                    ) || false
                                                }
                                                onChange={(e) => {
                                                    const newGenders = e.target
                                                        .checked
                                                        ? [
                                                              ...(genders ||
                                                                  []),
                                                              opt.value,
                                                          ]
                                                        : (
                                                              genders || []
                                                          ).filter(
                                                              (g) =>
                                                                  g !==
                                                                  opt.value,
                                                          );
                                                    setState({
                                                        genders: newGenders,
                                                    });
                                                }}
                                            />
                                            {opt.label}
                                        </label>
                                    ))}
                            </div>
                        </div>
                        {/* Emotion multiselect */}
                        <div className="mb-4">
                            <label className="text-sm text-muted-foreground block mb-2">
                                {t("common.emotion")}：
                            </label>
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
                                                    emotions?.includes(
                                                        opt.value,
                                                    ) || false
                                                }
                                                onChange={(e) => {
                                                    const newEmotions = e.target
                                                        .checked
                                                        ? [
                                                              ...(emotions ||
                                                                  []),
                                                              opt.value,
                                                          ]
                                                        : (
                                                              emotions || []
                                                          ).filter(
                                                              (em) =>
                                                                  em !==
                                                                  opt.value,
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
                        {/* Style multiselect */}
                        <div className="mb-4">
                            <label className="text-sm text-muted-foreground block mb-2">
                                {t("common.style")}：
                            </label>
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
                                                    styles?.includes(
                                                        opt.value,
                                                    ) || false
                                                }
                                                onChange={(e) => {
                                                    const newStyles = e.target
                                                        .checked
                                                        ? [
                                                              ...(styles || []),
                                                              opt.value,
                                                          ]
                                                        : (styles || []).filter(
                                                              (s) =>
                                                                  s !==
                                                                  opt.value,
                                                          );
                                                    setState({
                                                        styles: newStyles,
                                                    });
                                                }}
                                            />
                                            {opt.label}
                                        </label>
                                    ))}
                            </div>
                        </div>
                    </>
                )}

                {/* Description mode: enter voice description */}
                {mode === "describe" && (
                    <div className="mb-4">
                        <label
                            htmlFor="description-input"
                            className="text-sm text-muted-foreground block mb-2"
                        >
                            {t("common.voiceDescription")}：
                        </label>
                        <textarea
                            id="description-input"
                            className="w-full h-24 p-2 text-sm rounded-md border border-input bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                            placeholder={t(
                                "common.voiceDescriptionPlaceholder",
                            )}
                            value={description}
                            onChange={(e) =>
                                setState({ description: e.target.value })
                            }
                        />
                    </div>
                )}
                {/* Show input text */}
                {texts && texts.length > 0 && (
                    <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">
                            {t("common.inputText")} ({texts.length})
                        </Label>
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                            {texts.map((text, index) => (
                                <div
                                    key={index}
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

TextGenSpeechNode.displayName = "TextGenSpeechNode";

export default memo(TextGenSpeechNode);
