import { Atom } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo } from "react";

import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useAbiForm } from "@/hooks/use-abi-form";
import { batchOn } from "@/lib/abi/sources";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";

import { AbiNodeShell } from "../base/abi-node-shell";
import { LanguageSelect } from "../base/language-select";

const TextGenSpeechInstructNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<
    "text-gen-speech-instruct",
    "textGenSpeechInstructNode"
>) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("text-gen-speech-instruct");
    const texts = data.texts ?? [];

    return (
        <AbiNodeShell
            feature="text-gen-speech-instruct"
            sourceSpec={{
                text: batchOn({ nodeType: "textNode", path: "texts" }),
            }}
            form={form}
            selected={selected}
            className="min-w-[480px]"
            data={data}
            title={t("titles.textGenSpeechInstruct")}
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
                        htmlFor="instruct-language-select"
                        className="text-sm text-muted-foreground"
                    >
                        {t("common.language")}：
                    </Label>
                    <LanguageSelect
                        id="instruct-language-select"
                        value={form.state.language ?? "Chinese"}
                        onChange={(v) => form.set("language", v)}
                    />
                </div>
                <div className="mb-4">
                    <label
                        htmlFor="instruct-input"
                        className="text-sm text-muted-foreground block mb-2"
                    >
                        {t("common.voiceDescription")}：
                    </label>
                    <textarea
                        id="instruct-input"
                        className="w-full h-24 p-2 text-sm rounded-md border border-input bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                        placeholder={t("common.voiceDescriptionPlaceholder")}
                        {...form.register("instruct")}
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

TextGenSpeechInstructNode.displayName = "TextGenSpeechInstructNode";

export default memo(TextGenSpeechInstructNode);
