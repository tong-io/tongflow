import { Atom, Mic, Upload } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { memo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { SpeakerVoiceRecorder } from "@/components/workspace/speaker-voice-recorder";
import {
    crawledVoiceOptions,
    type VoiceLanguage,
} from "@/config/voice-options";
import { useAbiForm } from "@/hooks/use-abi-form";
import { batchOn } from "@/lib/abi/sources";
import { logger } from "@/lib/logger";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";

import { AbiNodeShell } from "../base/abi-node-shell";
import { VoiceLangSelect } from "../base/voice-lang-select";
import { getDefaultVoice } from "./text-gen-speech-shared";

const TextGenSpeechCloneNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<
    "text-gen-speech-clone",
    "textGenSpeechCloneNode"
>) => {
    const t = useTranslations("Workspace.nodes");
    const locale = useLocale();
    const form = useAbiForm("text-gen-speech-clone");
    const texts = data.texts ?? [];

    const defaultVoiceLang: VoiceLanguage =
        locale in crawledVoiceOptions ? (locale as VoiceLanguage) : "zh";
    const voice =
        (form.state.ref_audio as string | undefined) ??
        getDefaultVoice(defaultVoiceLang);

    const [extraSpeakers, setExtraSpeakers] = useState<
        { label: string; value: string }[]
    >([]);

    // ABI types `ref_audio`/`audio` as Asset objects, but the backend
    // accepts a stored voice file_key here (e.g. "zh_famale_1.wav").
    const setVoice = (v: string) =>
        form.patch({ ref_audio: v as any, audio: v as any });

    return (
        <AbiNodeShell
            feature="text-gen-speech-clone"
            sourceSpec={{
                text: batchOn({ nodeType: "textNode", path: "texts" }),
            }}
            form={form}
            selected={selected}
            className="min-w-[480px]"
            data={data}
            title={t("titles.textGenSpeechClone")}
            icon={<Atom className="h-5 w-5" />}
            executeLabel={t("actions.generateSpeech")}
            executeDisabled={!texts?.length}
        >
            <Card
                className="p-5 nodrag"
                onPointerDown={(e) => e.stopPropagation()}
            >
                <div className="mb-4 flex flex-wrap items-center gap-3">
                    <VoiceLangSelect
                        id="voice-select-clone"
                        value={voice}
                        onChange={setVoice}
                        defaultLang={defaultVoiceLang}
                        extraSpeakers={extraSpeakers}
                    />
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
                            setExtraSpeakers((prev) => [
                                ...prev,
                                { label: key, value: key },
                            ]);
                            setVoice(key);
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
        </AbiNodeShell>
    );
};

TextGenSpeechCloneNode.displayName = "TextGenSpeechCloneNode";

export default memo(TextGenSpeechCloneNode);
