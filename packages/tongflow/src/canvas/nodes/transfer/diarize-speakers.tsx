import { Users } from "lucide-react";
import { memo } from "react";
import { useTranslations } from "use-intl";
import type { TongflowPluginNodeProps } from "../../../core";
import { useAbiForm } from "../../hooks/use-abi-form";

import { AbiNodeShell } from "../base/abi-node-shell";

const DiarizeSpeakersNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"diarize-speakers", "diarizeSpeakersNode">) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("diarize-speakers");
    const fileKeys = data.fileKeys ?? [];

    return (
        <AbiNodeShell
            feature="diarize-speakers"
            form={form}
            selected={selected}
            data={data}
            title={t("titles.diarizeSpeakers")}
            icon={<Users className="h-5 w-5" />}
            executeLabel={t("actions.diarizeSpeakers")}
            executeDisabled={!fileKeys.length}
        />
    );
};

DiarizeSpeakersNode.displayName = "DiarizeSpeakersNode";

export default memo(DiarizeSpeakersNode);
