import { AudioWaveform } from "lucide-react";
import { memo } from "react";
import { useTranslations } from "use-intl";
import type { TongflowPluginNodeProps } from "../../../core";
import { useAbiForm } from "../../hooks/use-abi-form";

import { AbiNodeShell } from "../base/abi-node-shell";

const VadSegmentNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"vad-segment", "vadSegmentNode">) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("vad-segment");
    const fileKeys = data.fileKeys ?? [];

    return (
        <AbiNodeShell
            feature="vad-segment"
            form={form}
            selected={selected}
            data={data}
            title={t("titles.vadSegment")}
            icon={<AudioWaveform className="h-5 w-5" />}
            executeLabel={t("actions.splitBySpeech")}
            executeDisabled={!fileKeys.length}
        />
    );
};

VadSegmentNode.displayName = "VadSegmentNode";

export default memo(VadSegmentNode);
