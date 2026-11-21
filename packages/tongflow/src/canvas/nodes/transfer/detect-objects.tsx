import { ScanSearch } from "lucide-react";
import { memo } from "react";
import { useTranslations } from "use-intl";
import type { TongflowPluginNodeProps } from "../../../core";
import { useAbiForm } from "../../hooks/use-abi-form";

import { AbiNodeShell } from "../base/abi-node-shell";

const DetectObjectsNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"detect-objects", "detectObjectsNode">) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("detect-objects");
    const fileKeys = data.fileKeys ?? [];

    return (
        <AbiNodeShell
            feature="detect-objects"
            form={form}
            selected={selected}
            data={data}
            title={t("titles.detectObjects")}
            icon={<ScanSearch className="h-5 w-5" />}
            executeLabel={t("actions.detectObjects")}
            executeDisabled={!fileKeys.length}
        />
    );
};

DetectObjectsNode.displayName = "DetectObjectsNode";

export default memo(DetectObjectsNode);
