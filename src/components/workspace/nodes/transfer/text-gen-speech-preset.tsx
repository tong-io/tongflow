import { Atom } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useEffect } from "react";

import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { DEFAULT_QWEN_SPEAKER, QWEN_SPEAKERS } from "@/constants/qwen-speakers";
import { useAbiForm } from "@/hooks/use-abi-form";
import { batchOn } from "@/lib/abi/sources";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";

import { AbiNodeShell } from "../base/abi-node-shell";
import { LanguageSelect } from "../base/language-select";

const TextGenSpeechPresetNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<
    "text-gen-speech-preset",
    "textGenSpeechPresetNode"
>) => {
    const t = useTranslations("Workspace.nodes");
    const tLang = useTranslations("Languages");
    const form = useAbiForm("text-gen-speech-preset");
    const texts = data.texts ?? [];

    const speaker = form.state.speaker ?? DEFAULT_QWEN_SPEAKER.value;
    const setForm = form.set;
    const patch = form.patch;

    // Ensure speaker + language are persisted to ABI state on first mount.
    useEffect(() => {
        const next: Partial<{ speaker: string; language: string }> = {};
        if (form.state.speaker === undefined) {
            next.speaker = DEFAULT_QWEN_SPEAKER.value;
        }
        if (form.state.language === undefined) {
            next.language = DEFAULT_QWEN_SPEAKER.language;
        }
        if (Object.keys(next).length > 0) patch(next);
    }, [form.state.speaker, form.state.language, patch]);

    // Picking a speaker auto-fills its native language; user can still override.
    const handleSpeakerChange = (value: string) => {
        const sp = QWEN_SPEAKERS.find((s) => s.value === value);
        patch(
            sp ? { speaker: value, language: sp.language } : { speaker: value },
        );
    };

    return (
        <AbiNodeShell
            feature="text-gen-speech-preset"
            sourceSpec={{
                text: batchOn({ nodeType: "textNode", path: "texts" }),
            }}
            form={form}
            selected={selected}
            className="min-w-[480px]"
            data={data}
            title={t("titles.textGenSpeechPreset")}
            icon={<Atom className="h-5 w-5" />}
            executeLabel={t("actions.generateSpeech")}
            executeDisabled={!texts?.length}
        >
            <Card
                className="p-5 nodrag"
                onPointerDown={(e) => e.stopPropagation()}
            >
                <div className="mb-4 flex flex-wrap items-center gap-3">
                    <Label
                        htmlFor="speaker-select"
                        className="text-sm text-muted-foreground"
                    >
                        {t("common.voice")}：
                    </Label>
                    <Select value={speaker} onValueChange={handleSpeakerChange}>
                        <SelectTrigger id="speaker-select" className="w-44 h-9">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {QWEN_SPEAKERS.map((sp) => (
                                <SelectItem key={sp.value} value={sp.value}>
                                    {sp.value} · {t(`genders.${sp.gender}`)} ·{" "}
                                    {tLang(sp.langKey)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Label
                        htmlFor="preset-language-select"
                        className="text-sm text-muted-foreground"
                    >
                        {t("common.language")}：
                    </Label>
                    <LanguageSelect
                        id="preset-language-select"
                        value={form.state.language ?? "Chinese"}
                        onChange={(v) => setForm("language", v)}
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

TextGenSpeechPresetNode.displayName = "TextGenSpeechPresetNode";

export default memo(TextGenSpeechPresetNode);
