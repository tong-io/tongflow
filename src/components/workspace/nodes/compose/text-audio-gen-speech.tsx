import { Atom, Music, Type } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo } from "react";

import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useAbiForm } from "@/hooks/use-abi-form";
import { batchOn } from "@/lib/abi/sources";
import type { RfDataNodeProps } from "@/types/nodes";

import { AbiNodeShell } from "../base/abi-node-shell";
import { EmotionSelect } from "../base/emotion-select";
import { StyleSelect } from "../base/style-select";

type TextAudioGenSpeechRfProps = RfDataNodeProps<"textAudioGenSpeechNode">;

const TextAudioGenSpeechNode = ({
    selected,
    data,
}: TextAudioGenSpeechRfProps) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("text-audio-gen-speech");

    const emotion = form.state.emotion as string | undefined;
    const style = form.state.style as string | undefined;

    return (
        <AbiNodeShell
            feature="text-audio-gen-speech"
            sourceSpec={{
                text: batchOn({ nodeType: "textNode", path: "texts" }),
            }}
            form={form}
            selected={selected}
            className="min-w-[480px]"
            data={data}
            title={t("titles.textAudioGenSpeech")}
            icon={<Atom className="h-5 w-5" />}
            executeLabel={t("actions.generateSpeech")}
        >
            <div className="p-4 space-y-4">
                <Card className="p-3">
                    <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">
                            {t("compose.inputData")}
                        </Label>
                        <div className="flex gap-4">
                            <div className="flex flex-col items-center gap-1.5">
                                <div className="relative w-16 h-16 rounded-md border-2 border-gray-300 overflow-hidden bg-gray-100">
                                    <div className="flex items-center justify-center h-full w-full bg-green-50">
                                        <Type className="w-6 h-6 text-green-600" />
                                    </div>
                                </div>
                                <div className="px-1.5 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded">
                                    {t("compose.text")}
                                </div>
                            </div>
                            <div className="flex flex-col items-center gap-1.5">
                                <div className="relative w-16 h-16 rounded-md border-2 border-gray-300 overflow-hidden bg-gray-100">
                                    <div className="flex items-center justify-center h-full w-full bg-blue-50">
                                        <Music className="w-6 h-6 text-blue-600" />
                                    </div>
                                </div>
                                <div className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                                    {t("compose.audio")}
                                </div>
                            </div>
                        </div>
                    </div>
                </Card>

                <Card
                    className="p-3 nodrag"
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    <div className="mb-4 flex items-center gap-3">
                        <label
                            htmlFor="emotion-select"
                            className="text-sm text-muted-foreground whitespace-nowrap"
                        >
                            {t("compose.emotion")}
                        </label>
                        <EmotionSelect
                            value={emotion}
                            onChange={(v) =>
                                form.patch({ emotion: v, style: undefined })
                            }
                        />
                    </div>
                    <div className="flex items-center gap-3">
                        <label
                            htmlFor="style-select"
                            className="text-sm text-muted-foreground whitespace-nowrap"
                        >
                            {t("compose.style")}
                        </label>
                        <StyleSelect
                            value={style}
                            onChange={(v) =>
                                form.patch({ style: v, emotion: undefined })
                            }
                        />
                    </div>
                </Card>
            </div>
        </AbiNodeShell>
    );
};

export default memo(TextAudioGenSpeechNode);
