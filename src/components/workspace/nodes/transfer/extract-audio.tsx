import { Music } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo } from "react";

import { useAbiForm } from "@/hooks/use-abi-form";
import { batchOn } from "@/lib/abi/sources";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";

import { AbiNodeShell } from "../base/abi-node-shell";

const ExtractAudioNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"extract-audio", "extractAudioNode">) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("extract-audio");
    const fileKeys = data.fileKeys;

    return (
        <AbiNodeShell
            feature="extract-audio"
            sourceSpec={{ video: batchOn() }}
            form={form}
            selected={selected}
            data={data}
            title={t("titles.extractAudioTrack")}
            icon={<Music className="h-5 w-5" />}
            executeLabel={t("actions.extractAudioTrack")}
            executeDisabled={!fileKeys?.length}
        />
    );
};

export default memo(ExtractAudioNode);
