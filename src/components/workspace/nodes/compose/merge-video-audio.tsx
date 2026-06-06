import { Atom } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo } from "react";

import { useAbiForm } from "@/hooks/use-abi-form";
import { batchOn } from "@/lib/abi/sources";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";

import { AbiNodeShell } from "../base/abi-node-shell";

const MergeVideoAudioNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"merge-video-audio", "mergeVideoAudioNode">) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("merge-video-audio");

    return (
        <AbiNodeShell
            feature="merge-video-audio"
            sourceSpec={{ video: batchOn() }}
            form={form}
            selected={selected}
            data={data}
            title={t("titles.mergeVideoAudio")}
            icon={<Atom className="h-5 w-5" />}
            executeLabel={t("actions.startMerge")}
        />
    );
};

export default memo(MergeVideoAudioNode);
