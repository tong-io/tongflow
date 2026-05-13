import { useNodeId, useStore } from "@xyflow/react";
import { CheckCircle, Circle } from "lucide-react";
import { useTranslations } from "next-intl";
import { isModalityNode } from "@/constants/modality-nodes";
import useFlow from "@/hooks/use-flow";
import { cn } from "@/lib/utils";

export function NodeComboButton() {
    const nodeId = useNodeId();
    const t = useTranslations("Workspace.nodes.base");

    const comboMode = useFlow((s) => s.comboMode);
    const isInCombo = useFlow((s) => (nodeId ? s.isInCombo(nodeId) : false));
    const toggleCombo = useFlow((s) => s.toggleCombo);

    const nodeType = useStore((state) => {
        const node = state.nodeLookup.get(nodeId ?? "");
        return node?.type;
    });

    if (!comboMode || !isModalityNode(nodeType)) return null;

    return (
        <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 z-[100] nodrag">
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    if (nodeId) toggleCombo(nodeId);
                }}
                className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 shadow-md",
                    "border-2 cursor-pointer",
                    isInCombo
                        ? "bg-primary text-primary-foreground border-primary hover:bg-primary/90"
                        : "bg-background text-muted-foreground border-muted-foreground/30 hover:border-primary hover:text-primary",
                )}
            >
                {isInCombo ? (
                    <CheckCircle className="h-3.5 w-3.5" />
                ) : (
                    <Circle className="h-3.5 w-3.5" />
                )}
                <span>{isInCombo ? t("selected") : t("select")}</span>
            </button>
        </div>
    );
}
