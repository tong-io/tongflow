import { Sparkles, Video } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo } from "react";

import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useAbiForm } from "@/hooks/use-abi-form";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";

import { AbiNodeShell } from "../base/abi-node-shell";
import { NodeTextarea } from "../base/node-textarea";

const VideoImageGenVideoMixNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<
    "video-image-gen-video-mix",
    "videoImageGenVideoMixNode"
>) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("video-image-gen-video-mix");

    return (
        <AbiNodeShell
            feature="video-image-gen-video-mix"
            form={form}
            selected={selected}
            className="min-w-[480px]"
            data={data}
            title={t("titles.videoImageMix")}
            icon={<Video className="h-5 w-5" />}
            executeLabel={t("actions.generateVideo")}
        >
            <div className="p-4 space-y-4">
                <Card className="p-3">
                    <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">
                            {t("compose.mediaFiles")}
                        </Label>
                        <p className="text-xs text-muted-foreground">
                            {t("compose.connectImageVideo")}
                        </p>
                    </div>
                </Card>

                <NodeTextarea
                    label={t("compose.generatePromptLabel")}
                    icon={Sparkles}
                    placeholder={t("compose.generatePromptPlaceholder")}
                    {...form.bind("text")}
                    rows={4}
                />
            </div>
        </AbiNodeShell>
    );
};

export default memo(VideoImageGenVideoMixNode);
