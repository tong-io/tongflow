import { Scissors } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo } from "react";

import { useAbiForm } from "@/hooks/use-abi-form";
import { handle } from "@/lib/abi/sources";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";

import { AbiNodeShell } from "../base/abi-node-shell";
import { NodeTextarea } from "../base/node-textarea";

const SplitTextNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"split-text", "splitTextNode">) => {
    const t = useTranslations("Workspace.nodes");
    const tBase = useTranslations("Workspace.nodes.base");
    const form = useAbiForm("split-text", {
        text: handle({ nodeType: "textNode", path: "texts[0]" }),
    });

    return (
        <AbiNodeShell
            feature="split-text"
            sourceSpec={{
                text: handle({ nodeType: "textNode", path: "texts[0]" }),
            }}
            form={form}
            selected={selected}
            data={data}
            title={t("titles.splitText")}
            icon={<Scissors className="h-5 w-5" />}
            executeLabel={tBase("execute")}
        >
            <div className="p-4 space-y-4">
                <NodeTextarea
                    rows={3}
                    placeholder={t("common.enterInstructions")}
                    {...form.bind("userPrompt")}
                    className="min-h-[80px]"
                />
            </div>
        </AbiNodeShell>
    );
};

export default memo(SplitTextNode);
