import { Database } from "lucide-react";
import { memo } from "react";
import { useTranslations } from "use-intl";
import type { TongflowPluginNodeProps } from "../../../core";
import { useAbiForm } from "../../hooks/use-abi-form";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";

import { AbiNodeShell } from "../base/abi-node-shell";

// Chunks (text node) + their vectors (file node from embed-text) are written
// to the host's knowledge base; `source` names the file they came from.
const KbWriteNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"kb-write", "kbWriteNode">) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("kb-write");
    const source = (form.state.source as string | undefined)?.trim() ?? "";

    return (
        <AbiNodeShell
            feature="kb-write"
            form={form}
            selected={selected}
            data={data}
            title={t("titles.kbWrite")}
            icon={<Database className="h-5 w-5" />}
            executeLabel={t("actions.writeKnowledgeBase")}
            executeDisabled={!source}
        >
            <div
                className="p-4 space-y-3 nodrag"
                onPointerDown={(e) => e.stopPropagation()}
            >
                <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                        {t("kbWrite.sourceLabel")}
                    </Label>
                    <Input
                        placeholder={t("kbWrite.sourcePlaceholder")}
                        {...form.register("source")}
                        className="h-8 text-xs"
                    />
                </div>
                <p className="text-xs text-muted-foreground">
                    {t("kbWrite.hint")}
                </p>
            </div>
        </AbiNodeShell>
    );
};

KbWriteNode.displayName = "KbWriteNode";

export default memo(KbWriteNode);
