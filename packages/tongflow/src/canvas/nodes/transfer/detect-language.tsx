import { Languages } from "lucide-react";
import { memo } from "react";
import { useTranslations } from "use-intl";
import type { TongflowPluginNodeProps } from "../../../core";
import { useAbiForm } from "../../hooks/use-abi-form";

import { AbiNodeShell } from "../base/abi-node-shell";

const DetectLanguageNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"detect-language", "detectLanguageNode">) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("detect-language");

    return (
        <AbiNodeShell
            feature="detect-language"
            form={form}
            selected={selected}
            data={data}
            title={t("titles.detectLanguage")}
            icon={<Languages className="h-5 w-5" />}
            executeLabel={t("actions.detectLanguage")}
        />
    );
};

DetectLanguageNode.displayName = "DetectLanguageNode";

export default memo(DetectLanguageNode);
