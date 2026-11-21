import { ScanText } from "lucide-react";
import { memo } from "react";
import { useTranslations } from "use-intl";
import type { TongflowPluginNodeProps } from "../../../core";
import { useAbiForm } from "../../hooks/use-abi-form";

import { AbiNodeShell } from "../base/abi-node-shell";

const OcrImageNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"ocr-image", "ocrImageNode">) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("ocr-image");
    const fileKeys = data.fileKeys ?? [];

    return (
        <AbiNodeShell
            feature="ocr-image"
            form={form}
            selected={selected}
            data={data}
            title={t("titles.ocrImage")}
            icon={<ScanText className="h-5 w-5" />}
            executeLabel={t("actions.recognizeText")}
            executeDisabled={!fileKeys.length}
        />
    );
};

OcrImageNode.displayName = "OcrImageNode";

export default memo(OcrImageNode);
