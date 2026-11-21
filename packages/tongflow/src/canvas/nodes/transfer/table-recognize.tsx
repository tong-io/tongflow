import { Table } from "lucide-react";
import { memo } from "react";
import { useTranslations } from "use-intl";
import type { TongflowPluginNodeProps } from "../../../core";
import { useAbiForm } from "../../hooks/use-abi-form";

import { AbiNodeShell } from "../base/abi-node-shell";

const TableRecognizeNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"table-recognize", "tableRecognizeNode">) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("table-recognize");
    const fileKeys = data.fileKeys ?? [];

    return (
        <AbiNodeShell
            feature="table-recognize"
            form={form}
            selected={selected}
            data={data}
            title={t("titles.tableRecognize")}
            icon={<Table className="h-5 w-5" />}
            executeLabel={t("actions.recognizeTable")}
            executeDisabled={!fileKeys.length}
        />
    );
};

TableRecognizeNode.displayName = "TableRecognizeNode";

export default memo(TableRecognizeNode);
