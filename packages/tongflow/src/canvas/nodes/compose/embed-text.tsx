import { Binary } from "lucide-react";
import { memo } from "react";
import { useTranslations } from "use-intl";
import type { TongflowPluginNodeProps } from "../../../core";
import { useAbiForm } from "../../hooks/use-abi-form";

import { AbiNodeShell } from "../base/abi-node-shell";

const EmbedTextNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"embed-text", "embedTextNode">) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("embed-text");

    return (
        <AbiNodeShell
            feature="embed-text"
            form={form}
            selected={selected}
            data={data}
            title={t("titles.embedText")}
            icon={<Binary className="h-5 w-5" />}
            executeLabel={t("actions.embed")}
        />
    );
};

EmbedTextNode.displayName = "EmbedTextNode";

export default memo(EmbedTextNode);
