import { LayoutDashboard } from "lucide-react";
import { memo } from "react";
import { useTranslations } from "use-intl";
import type { TongflowPluginNodeProps } from "../../../core";
import { useAbiForm } from "../../hooks/use-abi-form";

import { AbiNodeShell } from "../base/abi-node-shell";

const LayoutDetectNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"layout-detect", "layoutDetectNode">) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("layout-detect");
    const fileKeys = data.fileKeys ?? [];

    return (
        <AbiNodeShell
            feature="layout-detect"
            form={form}
            selected={selected}
            data={data}
            title={t("titles.layoutDetect")}
            icon={<LayoutDashboard className="h-5 w-5" />}
            executeLabel={t("actions.detectLayout")}
            executeDisabled={!fileKeys.length}
        />
    );
};

LayoutDetectNode.displayName = "LayoutDetectNode";

export default memo(LayoutDetectNode);
