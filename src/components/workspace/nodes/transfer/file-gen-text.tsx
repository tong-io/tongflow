import { FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo } from "react";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";
import {
    type GetPromptsContext,
    upstreamParam,
} from "@/utils/node-execution-config";
import { BaseNode } from "../base/base-node";

const DEFAULT_FEATURE = "parse-document";

// Workflow execution config
const workflowConfig = {
    feature: DEFAULT_FEATURE,
    outputType: "textNode",
    outputField: "texts" as const,
    supportsBatch: true,
    batchParam: "document",
    paramMappings: {
        document: {
            sources: [upstreamParam("fileNode", "fileKeys[0]")],
            required: true,
        },
    },
};

const FileGenTextNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"parse-document", "fileGenTextNode">) => {
    const t = useTranslations("Workspace.nodes");
    const { fileKeys = [] } = data;

    return (
        <BaseNode
            selected={selected}
            className="min-w-[480px]"
            data={data}
            workflowConfig={{
                ...workflowConfig,
                title: t("titles.fileGenText"),
                icon: <FileText className="h-5 w-5" />,
                executeLabel: t("actions.parseDocument"),
                executeDisabled: !fileKeys?.length,
                getPrompts: (ctx?: GetPromptsContext) => {
                    const upstreamKeys = ctx?.getAllUpstreamData(
                        "fileNode",
                        "fileKeys",
                    ) as string[] | undefined;
                    const keys =
                        upstreamKeys && upstreamKeys.length > 0
                            ? upstreamKeys
                            : fileKeys;
                    return keys.map((fileKey) => ({
                        source: fileKey,
                    }));
                },
            }}
        ></BaseNode>
    );
};

FileGenTextNode.displayName = "FileGenTextNode";

export default memo(FileGenTextNode);
