import { Atom, Mic, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { SpeakerVoiceRecorder } from "@/components/workspace/speaker-voice-recorder";
import { useAbiForm } from "@/hooks/use-abi-form";
import { useUpload } from "@/hooks/use-upload";
import { batchOn } from "@/lib/abi/sources";
import { logger } from "@/lib/logger";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";

import { AbiNodeShell } from "../base/abi-node-shell";
import { LanguageSelect } from "../base/language-select";

const TextGenSpeechCloneNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<
    "text-gen-speech-clone",
    "textGenSpeechCloneNode"
>) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("text-gen-speech-clone");
    const texts = data.texts ?? [];

    const refAudio = form.state.ref_audio as string | undefined;

    // ABI types `ref_audio`/`audio` as Asset, but the backend accepts a stored
    // voice file_key string here (e.g. "uploads/abc.wav") via asset_as_path().
    const setVoice = (v: string) =>
        form.patch({ ref_audio: v as any, audio: v as any });

    const { upload, isUploading } = useUpload({
        onSuccess: (resp) => setVoice(resp.key),
        onError: (err) => logger.error("Voice upload failed:", err),
    });

    const onFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) await upload(file);
        e.target.value = "";
    };

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
            executeDisabled={!texts?.length || !refAudio}
        >
            <Card
                className="p-5 nodrag"
                onPointerDown={(e) => e.stopPropagation()}
            >
                <div className="mb-3 flex flex-wrap items-center gap-3">
                    <Label className="text-sm text-muted-foreground">
                        {t("common.referenceAudio")}：
                    </Label>
                    <label className="cursor-pointer">
                        <input
                            type="file"
                            accept="audio/*"
                            hidden
                            onChange={onFileSelect}
                        />
                        <Button
                            variant="outline"
                            size="icon"
                            title={t("common.uploadVoice")}
                            disabled={isUploading}
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
                                title={t("common.recordVoice")}
                            >
                                <Mic className="w-4 h-4" />
                            </Button>
                        }
                        onChange={(key) => setVoice(key)}
                    />
                    <Label
                        htmlFor="clone-language-select"
                        className="text-sm text-muted-foreground"
                    >
                        {t("common.language")}：
                    </Label>
                    <LanguageSelect
                        id="clone-language-select"
                        value={(form.state.language as string) ?? "Auto"}
                        onChange={(v) => form.set("language", v)}
                    />
                </div>
                <div className="mb-4 text-xs text-muted-foreground truncate">
                    {refAudio ? refAudio : t("common.noReferenceAudio")}
                </div>
                <div className="mb-4">
                    <label
                        htmlFor="ref-text-input"
                        className="text-sm text-muted-foreground block mb-2"
                    >
                        {t("common.referenceText")}：
                    </label>
                    <textarea
                        id="ref-text-input"
                        className="w-full h-16 p-2 text-sm rounded-md border border-input bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                        placeholder={t("common.referenceTextPlaceholder")}
                        {...form.register("ref_text")}
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
