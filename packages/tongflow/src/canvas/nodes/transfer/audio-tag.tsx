import { Tags } from "lucide-react";
import { memo } from "react";
import { useTranslations } from "use-intl";
import type { TongflowPluginNodeProps } from "../../../core";
import { useAbiForm } from "../../hooks/use-abi-form";

import { AbiNodeShell } from "../base/abi-node-shell";

const AudioTagNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"audio-tag", "audioTagNode">) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("audio-tag");
    const fileKeys = data.fileKeys ?? [];

    return (
        <AbiNodeShell
            feature="audio-tag"
            form={form}
            selected={selected}
            data={data}
            title={t("titles.audioTag")}
            icon={<Tags className="h-5 w-5" />}
            executeLabel={t("actions.tagAudio")}
            executeDisabled={!fileKeys.length}
        />
    );
};

AudioTagNode.displayName = "AudioTagNode";

export default memo(AudioTagNode);
