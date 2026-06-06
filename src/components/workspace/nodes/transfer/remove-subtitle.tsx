import { Atom } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo } from "react";

import { useAbiForm } from "@/hooks/use-abi-form";
import { batchOn } from "@/lib/abi/sources";
import type { RfDataNodeProps } from "@/types/nodes";

import { AbiNodeShell } from "../base/abi-node-shell";

type RemoveVideoSubtitleRfProps = RfDataNodeProps<"removeVideoSubtitleNode">;

const RemoveVideoSubtitleNode = ({
    selected,
    data,
}: RemoveVideoSubtitleRfProps) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("subtitle_remove");
    const fileKeys = data.fileKeys;

    return (
        <AbiNodeShell
            feature="subtitle_remove"
            sourceSpec={{ fileKey: batchOn({ nodeType: "videoNode" }) }}
            form={form}
            selected={selected}
            data={data}
            title={t("titles.removeSubtitle")}
            icon={<Atom className="h-5 w-5" />}
            executeLabel={t("actions.removeSubtitle")}
            executeDisabled={!fileKeys?.length}
        />
    );
};

export default memo(RemoveVideoSubtitleNode);
