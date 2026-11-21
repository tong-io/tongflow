import { Binary } from "lucide-react";
import { memo } from "react";
import { useTranslations } from "use-intl";
import type { TongflowPluginNodeProps } from "../../../core";
import { useAbiForm } from "../../hooks/use-abi-form";

import { AbiNodeShell } from "../base/abi-node-shell";

const EmbedImageNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"embed-image", "embedImageNode">) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("embed-image");
    const fileKeys = data.fileKeys ?? [];

    return (
        <AbiNodeShell
            feature="embed-image"
            form={form}
            selected={selected}
            data={data}
            title={t("titles.embedImage")}
            icon={<Binary className="h-5 w-5" />}
            executeLabel={t("actions.embed")}
            executeDisabled={!fileKeys.length}
        />
    );
};

EmbedImageNode.displayName = "EmbedImageNode";

export default memo(EmbedImageNode);
