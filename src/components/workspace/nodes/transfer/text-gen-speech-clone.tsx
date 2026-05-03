import type { NodeProps } from "@xyflow/react";
import { Atom, Ear, Mic, Upload } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { memo, useCallback, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { SpeakerVoiceRecorder } from "@/components/workspace/speaker-voice-recorder";
import {
    crawledVoiceOptions,
    type VoiceLanguage,
} from "@/config/voice-options";
import { useNodeState } from "@/hooks/use-node-data";
import { getFileUrl } from "@/lib/file-url";
import { logger } from "@/lib/logger";
import {
    configParam,
    type GetPromptsContext,
    upstreamParam,
} from "@/utils/node-execution-config";
import { BaseNode } from "../base/base-node";
import {
    getDefaultVoice,
    getVoiceOptions,
    TEXT_GEN_SPEECH_CLONE,
    VOICE_LANG_LABELS,
} from "./text-gen-speech-shared";

const TextGenSpeechCloneNode = ({ selected, data }: NodeProps) => {
    const t = useTranslations("Workspace.nodes");
    const locale = useLocale();
    const { texts = [] } = data as { texts?: string[] };

    const defaultVoiceLang: VoiceLanguage =
        locale in crawledVoiceOptions ? (locale as VoiceLanguage) : "zh";

    const getVoiceOpts = useCallback(
        (lang: VoiceLanguage) => getVoiceOptions(lang, t),
        [t],
    );

    const [state, setState] = useNodeState(
        {
            voiceLang: defaultVoiceLang,
            voice: getDefaultVoice(defaultVoiceLang),
            speakers: getVoiceOpts(defaultVoiceLang),
        },
        data,
    );
    const { voiceLang = defaultVoiceLang, voice } = state;

    const voiceOptions = useMemo(
        () => getVoiceOpts(voiceLang),
        [voiceLang, getVoiceOpts],
    );

    const audioRef = useRef<HTMLAudioElement | null>(null);

    const playVoicePreview = useCallback(() => {
        if (!voice || voice === "default") return;
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

    const workflowConfig = {
        feature: TEXT_GEN_SPEECH_CLONE,
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
        },
    };

    return (
        <BaseNode
            selected={selected}
            className="min-w-[480px]"
            data={data}
            workflowConfig={{
                ...workflowConfig,
                title: t("titles.textGenSpeechClone"),
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

                    const slot = TEXT_GEN_SPEECH_CLONE;
                    return (
                        inputTexts?.map((text) => {
                            const ref = getFileUrl(voice);
                            return {
                                text,
                                nodeSlot: slot,
                                audio: ref,
                                ref_audio: ref,
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
                <div className="mb-4 flex flex-wrap items-center gap-3">
                    <Select
                        value={voiceLang}
                        onValueChange={(value) => {
                            const lang = value as VoiceLanguage;
                            setState({
                                voiceLang: lang,
                                voice: getDefaultVoice(lang),
                                speakers: getVoiceOpts(lang),
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
                        htmlFor="voice-select-clone"
                        className="text-sm text-muted-foreground whitespace-nowrap"
                    >
                        {t("common.voice")}：
                    </label>
                    <Select
                        value={voice}
                        onValueChange={(value) => setState({ voice: value })}
                    >
                        <SelectTrigger
                            id="voice-select-clone"
                            className="w-36 h-9"
                        >
                            <SelectValue
                                placeholder={t("common.selectVoice")}
                            />
                        </SelectTrigger>
                        <SelectContent>
                            {voiceOptions.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
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
                    <label className="cursor-pointer">
                        <input
                            type="file"
                            multiple
                            hidden
                            onChange={(e) => {
                                const files = Array.from(e.target.files || []);
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

TextGenSpeechCloneNode.displayName = "TextGenSpeechCloneNode";

export default memo(TextGenSpeechCloneNode);
