import { useNodesData } from "@xyflow/react";
import { Atom, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useMemo } from "react";

import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useAbiForm } from "@/hooks/use-abi-form";
import { batchOn } from "@/lib/abi/sources";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";
import { coerceBaseNodeData } from "@/utils/flow-node-data";

import { AbiNodeShell } from "../base/abi-node-shell";
import { NodeTextarea } from "../base/node-textarea";

const ImageGenImageNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"image-edit", "imageGenImageNode">) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("image-edit");
    const ids = data.ids ?? [];

    // Composition mode: pull data from associated nodes if `ids` were set.
    const fromNodes = useNodesData(ids);
    const imageNode = fromNodes.find((node) => node.type === "imageNode");
    const textNode = fromNodes.find((node) => node.type === "textNode");

    const fileKeys: string[] = useMemo(() => {
        if (imageNode) return coerceBaseNodeData(imageNode.data).fileKeys || [];
        return data.fileKeys || [];
    }, [imageNode, data]);

    const upstreamTexts: string[] = useMemo(() => {
        if (textNode) return coerceBaseNodeData(textNode.data).texts || [];
        return data.texts || [];
    }, [textNode, data]);

    const hasUpstreamTexts = upstreamTexts && upstreamTexts.length > 0;

    return (
        <AbiNodeShell
            feature="image-edit"
            sourceSpec={{ image: batchOn() }}
            form={form}
            selected={selected}
            className="min-w-[480px]"
            data={data}
            title={t("titles.imageGenImage")}
            icon={<Atom className="h-5 w-5" />}
            executeLabel={t("actions.editImage")}
            executeDisabled={!fileKeys?.length}
        >
            <div className="p-4 space-y-4">
                {hasUpstreamTexts ? (
                    <Card className="p-3 bg-muted/50">
                        <div className="space-y-2">
                            <Label className="text-sm font-medium text-muted-foreground">
                                {t("imageEdit.editInstruction")}
                                {t("imageEdit.fromUpstream")}
                            </Label>
                            <div className="space-y-1 max-h-32 overflow-y-auto">
                                {upstreamTexts.map((text, index) => (
                                    <div
                                        key={index}
                                        className="text-sm text-foreground p-2 bg-background rounded border border-border/50 line-clamp-3"
                                    >
                                        {text}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </Card>
                ) : (
                    <NodeTextarea
                        label={t("imageEdit.editInstruction")}
                        icon={Sparkles}
                        placeholder={t("imageEdit.editPlaceholder")}
                        {...form.bind("text")}
                        rows={4}
                    />
                )}
            </div>
        </AbiNodeShell>
    );
};

ImageGenImageNode.displayName = "ImageGenImageNode";

export default memo(ImageGenImageNode);
