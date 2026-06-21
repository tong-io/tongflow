import type { Edge } from "@xyflow/react";
import { useNodeId, useStore } from "@xyflow/react";
import { Video } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useMemo } from "react";

import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useAbiForm } from "@/hooks/use-abi-form";
import { collectHandleValues, resolveSpec } from "@/lib/abi/resolve";
import { collectAll } from "@/lib/abi/sources";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";

import { AbiNodeShell } from "../base/abi-node-shell";
import { MediaThumbnail } from "../base/media-thumbnail";

const CONCAT_VIDEO_SOURCE_SPEC = { videos: collectAll() };

const ConcatVideoNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"concat-videos", "concatVideoNode">) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("concat-videos", CONCAT_VIDEO_SOURCE_SPEC);

    const nodeId = useNodeId();
    const nodeLookup = useStore((state) => state.nodeLookup);
    const edges = useStore((state) => state.edges as Edge[]);

    const resolvedSpec = useMemo(
        () => resolveSpec("concat-videos", CONCAT_VIDEO_SOURCE_SPEC),
        [],
    );

    // Collect upstream video fileKeys from incoming edges so the editor view
    // reflects connections live (both manual drags and compose-created edges),
    // not just `data.fileKeys` populated after execution.
    const videoFileKeys = useMemo(() => {
        const collected = nodeId
            ? collectHandleValues(
                  nodeId,
                  resolvedSpec,
                  Array.from(nodeLookup.values()),
                  edges,
              ).videos
            : undefined;
        if (Array.isArray(collected) && collected.length > 0) {
            return collected.filter(
                (key): key is string => typeof key === "string",
            );
        }
        return (data.fileKeys ?? []) as string[];
    }, [nodeId, resolvedSpec, nodeLookup, edges, data.fileKeys]);

    return (
        <AbiNodeShell
            feature="concat-videos"
            sourceSpec={CONCAT_VIDEO_SOURCE_SPEC}
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
