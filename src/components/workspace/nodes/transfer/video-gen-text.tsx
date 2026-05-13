import { MessageSquare, Video as VideoIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo } from "react";

import { useAbiForm } from "@/hooks/use-abi-form";
import { batchOn } from "@/lib/abi/sources";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";

import { AbiNodeShell } from "../base/abi-node-shell";
import { NodeTextarea } from "../base/node-textarea";

const VideoGenTextNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"video-gen-text", "videoGenTextNode">) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("video-gen-text");
    const fileKeys = data.fileKeys ?? [];

    return (
        <AbiNodeShell
            feature="video-gen-text"
            sourceSpec={{ video: batchOn() }}
            form={form}
            selected={selected}
            className="min-w-[480px]"
            data={data}
            title={t("titles.videoGenText")}
            icon={<VideoIcon className="h-5 w-5" />}
            executeLabel={t("actions.describeVideo")}
            executeDisabled={!fileKeys?.length}
        >
            <div className="p-4 space-y-4">
                <NodeTextarea
                    label={t("videoGenText.promptLabel")}
                    icon={MessageSquare}
                    placeholder={t("videoGenText.promptPlaceholder")}
                    {...form.bind("text")}
                    rows={3}
                />
            </div>
        </AbiNodeShell>
    );
};

VideoGenTextNode.displayName = "VideoGenTextNode";

export default memo(VideoGenTextNode);
