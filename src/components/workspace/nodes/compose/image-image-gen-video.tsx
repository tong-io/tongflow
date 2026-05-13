import { Sparkles, Video } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo } from "react";

import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
    type AspectRatio,
    VIDEO_ASPECT_RATIOS,
    VIDEO_DURATIONS,
} from "@/constants/media-options";
import { useAbiForm } from "@/hooks/use-abi-form";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";
import { AbiNodeShell } from "../base/abi-node-shell";
import { AspectRatioPicker } from "../base/aspect-ratio-picker";
import { DurationPicker } from "../base/duration-picker";
import { NodeTextarea } from "../base/node-textarea";

const ImageImageGenVideoNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<
    "image-image-gen-video",
    "imageImageGenVideoNode"
>) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("image-image-gen-video");

    const width = (form.state.width as number | undefined) ?? 1280;
    const height = (form.state.height as number | undefined) ?? 704;
    const duration = (form.state.duration as number | undefined) ?? 10;
    const currentRatio: AspectRatio =
        VIDEO_ASPECT_RATIOS.find(
            (r) => r.width === width && r.height === height,
        ) ?? VIDEO_ASPECT_RATIOS[1];

    return (
        <AbiNodeShell
            feature="image-image-gen-video"
            form={form}
            selected={selected}
            className="min-w-[480px]"
            data={data}
            title={t("titles.imageImageGenVideo")}
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
                            {t("compose.connectTwoImages")}
                        </p>
                    </div>
                </Card>

                <AspectRatioPicker
                    ratios={VIDEO_ASPECT_RATIOS}
                    value={currentRatio}
                    onChange={(ratio) =>
                        form.patch({ width: ratio.width, height: ratio.height })
                    }
                    showSize
                />

                <DurationPicker
                    durations={VIDEO_DURATIONS}
                    value={String(duration)}
                    onChange={(dur) => form.set("duration", Number(dur))}
                />

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

export default memo(ImageImageGenVideoNode);
