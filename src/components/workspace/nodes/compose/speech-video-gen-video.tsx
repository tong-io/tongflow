import { Video } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo } from "react";

import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useAbiForm } from "@/hooks/use-abi-form";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";

import { AbiNodeShell } from "../base/abi-node-shell";

const SpeechVideoGenVideoNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<
    "speech-video-gen-video",
    "speechVideoGenVideoNode"
>) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("speech-video-gen-video");

    return (
        <AbiNodeShell
            feature="speech-video-gen-video"
            form={form}
            selected={selected}
            className="min-w-[480px]"
            data={data}
            title={t("titles.speechVideoGenVideo")}
            icon={<Video className="h-5 w-5" />}
            executeLabel={t("compose.lipSync")}
        >
            <div className="p-4 space-y-4">
                <Card className="p-3">
                    <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">
                            {t("compose.mediaFiles")}
                        </Label>
                        <p className="text-xs text-muted-foreground">
                            {t("compose.connectVideoAudio")}
                        </p>
                    </div>
                </Card>
            </div>
        </AbiNodeShell>
    );
};

export default memo(SpeechVideoGenVideoNode);
