import { FileImage } from "lucide-react";
import { memo } from "react";
import { useTranslations } from "use-intl";
import type { TongflowPluginNodeProps } from "../../../core";
import { useAbiForm } from "../../hooks/use-abi-form";

import { AbiNodeShell } from "../base/abi-node-shell";

const RenderPagesNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"render-pages", "renderPagesNode">) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("render-pages");
    const fileKeys = data.fileKeys ?? [];

    return (
        <AbiNodeShell
            feature="render-pages"
            form={form}
            selected={selected}
            data={data}
            title={t("titles.renderPages")}
            icon={<FileImage className="h-5 w-5" />}
            executeLabel={t("actions.renderPages")}
            executeDisabled={!fileKeys.length}
        />
    );
};

RenderPagesNode.displayName = "RenderPagesNode";

export default memo(RenderPagesNode);
