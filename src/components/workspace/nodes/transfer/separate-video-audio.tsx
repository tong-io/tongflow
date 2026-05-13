import { Atom } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo } from "react";

import { useAbiForm } from "@/hooks/use-abi-form";
import { batchOn } from "@/lib/abi/sources";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";

import { AbiNodeShell } from "../base/abi-node-shell";

const SeparateVideoAudioNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<
    "separate-video-audio",
    "separateVideoAudioNode"
>) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("separate-video-audio");
    const fileKeys = data.fileKeys;

    return (
        <AbiNodeShell
            feature="separate-video-audio"
            sourceSpec={{ video: batchOn() }}
            form={form}
            selected={selected}
            data={data}
            title={t("titles.splitVideoAudio")}
            icon={<Atom className="h-5 w-5" />}
            executeLabel={t("actions.splitVideoAudio")}
            executeDisabled={!fileKeys?.length}
        />
    );
};

export default memo(SeparateVideoAudioNode);
