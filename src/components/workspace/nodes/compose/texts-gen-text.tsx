import { Wand2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo } from "react";

import { useAbiForm } from "@/hooks/use-abi-form";
import { collectAll } from "@/lib/abi/sources";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";

import { AbiNodeShell } from "../base/abi-node-shell";
import { NodeTextarea } from "../base/node-textarea";

const TextsGenTextNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"combine-text", "textsGenTextNode">) => {
    const t = useTranslations("Workspace.nodes");
    const tBase = useTranslations("Workspace.nodes.base");
    const form = useAbiForm("combine-text", { texts: collectAll() });

    return (
        <AbiNodeShell
            feature="combine-text"
            sourceSpec={{ texts: collectAll() }}
            form={form}
            selected={selected}
            className="min-w-[480px]"
            data={data}
            title={t("titles.combineText")}
            icon={<Wand2 className="h-5 w-5" />}
            executeLabel={tBase("execute")}
        >
            <div className="p-4 space-y-4">
                <div className="space-y-2">
                    <NodeTextarea
                        rows={6}
                        placeholder={t("common.enterInstructions")}
                        {...form.bind("userPrompt")}
                        className="min-h-[120px]"
                    />
                </div>
            </div>
        </AbiNodeShell>
    );
};

TextsGenTextNode.displayName = "TextsGenTextNode";

export default memo(TextsGenTextNode);
