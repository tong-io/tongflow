import { Scissors } from "lucide-react";
import { memo } from "react";
import { useTranslations } from "use-intl";
import type { TongflowPluginNodeProps } from "../../../core";
import { useAbiForm } from "../../hooks/use-abi-form";
import { Card } from "../../ui/card";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";

import { AbiNodeShell } from "../base/abi-node-shell";

// Every connected text node feeds `texts` (collectAll); the plugin merges
// them and splits the result into embedding-sized chunks.
const ChunkTextNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"chunk-text", "chunkTextNode">) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("chunk-text");
    const maxChars = form.state.max_chars as number | undefined;

    return (
        <AbiNodeShell
            feature="chunk-text"
            form={form}
            selected={selected}
            data={data}
            title={t("titles.chunkText")}
            icon={<Scissors className="h-5 w-5" />}
            executeLabel={t("actions.chunkText")}
        >
            <div className="p-4 space-y-3">
                <Card
                    className="p-3 nodrag"
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">
                            {t("chunkText.maxChars")}
                        </Label>
                        <Input
                            type="number"
                            min={1}
                            step={1}
                            placeholder={t("chunkText.maxCharsPlaceholder")}
                            value={maxChars ?? ""}
                            onChange={(e) =>
                                form.set(
                                    "max_chars",
                                    e.target.value === ""
                                        ? undefined
                                        : Math.max(
                                              1,
                                              Math.round(
                                                  Number(e.target.value),
                                              ),
                                          ),
                                )
                            }
                            className="h-8 text-xs"
                        />
                    </div>
                </Card>
                <p className="text-xs text-muted-foreground">
                    {t("chunkText.hint")}
                </p>
            </div>
        </AbiNodeShell>
    );
};

ChunkTextNode.displayName = "ChunkTextNode";

export default memo(ChunkTextNode);
