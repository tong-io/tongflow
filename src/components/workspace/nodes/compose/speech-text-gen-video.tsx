import { Sparkles, Video } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo } from "react";

import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useAbiForm } from "@/hooks/use-abi-form";
import { handle } from "@/lib/abi/sources";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";

import { AbiNodeShell } from "../base/abi-node-shell";
import { NodeTextarea } from "../base/node-textarea";

const SpeechTextGenVideoNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<
    "speech-text-gen-video",
    "speechTextGenVideoNode"
>) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("speech-text-gen-video", {
        text: handle({ nodeType: "textNode", path: "texts[0]" }),
    });

    return (
        <AbiNodeShell
            feature="speech-text-gen-video"
            sourceSpec={{
                text: handle({ nodeType: "textNode", path: "texts[0]" }),
            }}
            form={form}
            selected={selected}
            className="min-w-[480px]"
            data={data}
            title={t("titles.speechTextGenVideo")}
            icon={<Video className="h-5 w-5" />}
            executeLabel={t("actions.generateVideo")}
        >
            <div className="p-4 space-y-4">
                <Card className="p-3">
                    <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">
                            {t("compose.inputContent")}
                        </Label>
                        <p className="text-xs text-muted-foreground">
                            {t("compose.connectTextAudio")}
                        </p>
                    </div>
                </Card>

                <NodeTextarea
                    label={t("compose.inputText")}
                    icon={Sparkles}
                    placeholder={t("compose.inputTextPlaceholder")}
                    {...form.bind("text")}
                    rows={4}
                />
            </div>
        </AbiNodeShell>
    );
};

export default memo(SpeechTextGenVideoNode);
