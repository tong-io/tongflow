import { Atom } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useEffect, useMemo, useState } from "react";

import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useAbiForm } from "@/hooks/use-abi-form";
import { batchOn } from "@/lib/abi/sources";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";

import { AbiNodeShell } from "../base/abi-node-shell";
import {
    buildEmotionOptions,
    buildGenderOptions,
    buildPresetDescription,
    buildStyleOptions,
} from "./text-gen-speech-shared";

const TextGenSpeechPresetNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<
    "text-gen-speech-preset",
    "textGenSpeechPresetNode"
>) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("text-gen-speech-preset");
    const texts = data.texts ?? [];

    const genderOptions = useMemo(() => buildGenderOptions(t), [t]);
    const emotionOptions = useMemo(() => buildEmotionOptions(t), [t]);
    const styleOptions = useMemo(() => buildStyleOptions(t), [t]);

    // UI-only multi-select state; collapsed into ABI `instruct` below.
    const [genders, setGenders] = useState<string[]>([]);
    const [emotions, setEmotions] = useState<string[]>([]);
    const [styles, setStyles] = useState<string[]>([]);

    const presetDesc = useMemo(
        () =>
            buildPresetDescription(
                genders,
                emotions,
                styles,
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

    useEffect(() => {
        form.set("instruct", presetDesc || undefined);
    }, [presetDesc, form]);

    const toggle = (
        list: string[],
        setter: (next: string[]) => void,
        value: string,
        checked: boolean,
    ) => {
        setter(checked ? [...list, value] : list.filter((v) => v !== value));
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
                <ChipGroup
                    label={`${t("common.gender")}：`}
                    options={genderOptions.filter((o) => o.value !== "none")}
                    selected={genders}
                    onChange={(v, c) => toggle(genders, setGenders, v, c)}
                />
                <ChipGroup
                    label={`${t("common.emotion")}：`}
                    options={emotionOptions.filter((o) => o.value !== "none")}
                    selected={emotions}
                    onChange={(v, c) => toggle(emotions, setEmotions, v, c)}
                />
                <ChipGroup
                    label={`${t("common.style")}：`}
                    options={styleOptions.filter((o) => o.value !== "none")}
                    selected={styles}
                    onChange={(v, c) => toggle(styles, setStyles, v, c)}
                    scrollable
                />
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

interface ChipGroupProps {
    label: string;
    options: { value: string; label: string }[];
    selected: string[];
    onChange: (value: string, checked: boolean) => void;
    scrollable?: boolean;
}

function ChipGroup({
    label,
    options,
    selected,
    onChange,
    scrollable,
}: ChipGroupProps) {
    return (
        <div className="mb-4">
            <div className="text-sm text-muted-foreground block mb-2">
                {label}
            </div>
            <div
                className={`flex flex-wrap gap-2 ${scrollable ? "max-h-40 overflow-y-auto" : ""}`}
            >
                {options.map((opt) => (
                    <label
                        key={opt.value}
                        className={`px-3 py-1.5 rounded-md text-sm cursor-pointer border transition-colors ${
                            selected.includes(opt.value)
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-background border-border hover:bg-accent"
                        }`}
                    >
                        <input
                            type="checkbox"
                            className="sr-only"
                            checked={selected.includes(opt.value)}
                            onChange={(e) =>
                                onChange(opt.value, e.target.checked)
                            }
                        />
                        {opt.label}
                    </label>
                ))}
            </div>
        </div>
    );
}

TextGenSpeechPresetNode.displayName = "TextGenSpeechPresetNode";

export default memo(TextGenSpeechPresetNode);
