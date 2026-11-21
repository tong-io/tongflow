import { RotateCw } from "lucide-react";
import { memo } from "react";
import { useTranslations } from "use-intl";
import type { TongflowPluginNodeProps } from "../../../core";
import { useAbiForm } from "../../hooks/use-abi-form";

import { AbiNodeShell } from "../base/abi-node-shell";

const ImageOrientNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"image-orient", "imageOrientNode">) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("image-orient");
    const fileKeys = data.fileKeys ?? [];

    return (
        <AbiNodeShell
            feature="image-orient"
            form={form}
            selected={selected}
            data={data}
            title={t("titles.imageOrient")}
            icon={<RotateCw className="h-5 w-5" />}
            executeLabel={t("actions.fixOrientation")}
            executeDisabled={!fileKeys.length}
        />
    );
};

ImageOrientNode.displayName = "ImageOrientNode";

export default memo(ImageOrientNode);
