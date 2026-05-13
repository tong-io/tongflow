import { Video } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo } from "react";

import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useAbiForm } from "@/hooks/use-abi-form";
import { collectAll } from "@/lib/abi/sources";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";

import { AbiNodeShell } from "../base/abi-node-shell";
import { MediaThumbnail } from "../base/media-thumbnail";

const ConcatVideoNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"concat-videos", "concatVideoNode">) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("concat-videos", {
        // Concat all upstream videoNodes' fileKeys into the `videos` array.
        videos: collectAll(),
    });

    // The displayed list comes from form state if present (set after exec)
    // or remains empty in the editor view; runtime concat-collects from edges.
    const videoFileKeys = (data.fileKeys ?? []) as string[];

    return (
        <AbiNodeShell
            feature="concat-videos"
            sourceSpec={{ videos: collectAll() }}
            form={form}
            selected={selected}
            className="min-w-[480px]"
            data={data}
            title={t("titles.concatVideo")}
            icon={<Video className="h-5 w-5" />}
            executeLabel={t("actions.concatVideo")}
        >
            <div className="p-4 space-y-4">
                <Card className="p-3">
                    <div className="space-y-2">
                        <Label className="text-sm font-medium text-muted-foreground">
                            {t("compose.videoFiles")} ({videoFileKeys.length})
                        </Label>
                        <div className="flex flex-wrap gap-4">
                            {videoFileKeys.length > 0 ? (
                                videoFileKeys.map((fileKey, index) => (
                                    <MediaThumbnail
                                        key={`${fileKey}-${index}`}
                                        fileKey={fileKey}
                                        label={`${t("compose.video")} ${index + 1}`}
                                        type="video"
                                        loadingText={t("compose.loading")}
                                    />
                                ))
                            ) : (
                                <p className="text-xs text-red-500">
                                    {t("compose.connectVideo")}
                                </p>
                            )}
                        </div>
                    </div>
                </Card>
            </div>
        </AbiNodeShell>
    );
};

export default memo(ConcatVideoNode);
