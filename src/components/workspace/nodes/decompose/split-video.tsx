import { Atom } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useEffect } from "react";

import { useAbiForm } from "@/hooks/use-abi-form";
import { batchOn } from "@/lib/abi/sources";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";

import { AbiNodeShell } from "../base/abi-node-shell";

const SplitVideoNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"split-video", "splitVideoNode">) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("split-video");
    const fileKeys = data.fileKeys;

    // Default threshold once.
    useEffect(() => {
        if (form.state.threshold == null) form.set("threshold", 20.0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <AbiNodeShell
            feature="split-video"
            sourceSpec={{ video: batchOn() }}
            form={form}
            selected={selected}
            data={data}
            title={t("titles.splitVideo")}
            icon={<Atom className="h-5 w-5" />}
            executeLabel={t("compose.startSlice")}
            executeDisabled={!fileKeys?.length}
        />
    );
};

export default memo(SplitVideoNode);
