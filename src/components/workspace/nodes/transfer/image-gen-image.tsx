import type { Edge } from "@xyflow/react";
import { useNodeId, useStore } from "@xyflow/react";
import { Atom, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useMemo } from "react";

import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useAbiForm } from "@/hooks/use-abi-form";
import { NODE_TYPE_SOURCE_SPEC } from "@/lib/abi/node-feature-registry";
import { collectHandleValues, resolveSpec } from "@/lib/abi/resolve";
import type { SourceSpec } from "@/lib/abi/sources";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";

import { AbiNodeShell } from "../base/abi-node-shell";
import { NodeTextarea } from "../base/node-textarea";

const IMAGE_EDIT_SOURCE_SPEC =
    NODE_TYPE_SOURCE_SPEC.imageGenImageNode as SourceSpec<"image-edit">;

const ImageGenImageNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"image-edit", "imageGenImageNode">) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("image-edit", IMAGE_EDIT_SOURCE_SPEC);

    const nodeId = useNodeId();
    const nodeLookup = useStore((state) => state.nodeLookup);
    const edges = useStore((state) => state.edges as Edge[]);

    const resolvedSpec = useMemo(
        () => resolveSpec("image-edit", IMAGE_EDIT_SOURCE_SPEC),
        [],
    );

    const { hasImage, promptText } = useMemo(() => {
        if (!nodeId) {
            return { hasImage: false, promptText: "" };
        }
        const values = collectHandleValues(
            nodeId,
            resolvedSpec,
            Array.from(nodeLookup.values()),
            edges,
        );
        const text = typeof values.text === "string" ? values.text.trim() : "";
        const imageRaw = values.image;
        const imageKey = Array.isArray(imageRaw)
            ? typeof imageRaw[0] === "string"
                ? imageRaw[0]
                : undefined
            : typeof imageRaw === "string"
              ? imageRaw
              : undefined;
        return {
            hasImage: Boolean(imageKey),
            promptText: text,
        };
    }, [nodeId, resolvedSpec, nodeLookup, edges]);

    const manualText = (form.state.text as string | undefined)?.trim() ?? "";
    const effectiveText = promptText || manualText;

    return (
        <AbiNodeShell
            feature="image-edit"
            sourceSpec={IMAGE_EDIT_SOURCE_SPEC}
            form={form}
            selected={selected}
            className="min-w-[480px]"
            data={data}
            title={t("titles.imageGenImage")}
            icon={<Atom className="h-5 w-5" />}
            executeLabel={t("actions.editImage")}
            executeDisabled={!hasImage || !effectiveText}
        >
            <div className="p-4 space-y-4">
                {!hasImage && (
                    <p className="text-xs text-red-500">
                        {t("compose.connectTextImage")}
                    </p>
                )}

                {promptText ? (
                    <Card className="p-3 bg-muted/50">
                        <div className="space-y-2">
                            <Label className="text-sm font-medium text-muted-foreground">
                                {t("imageEdit.editInstruction")}
                                {t("imageEdit.fromUpstream")}
                            </Label>
                            <div className="text-sm text-foreground p-2 bg-background rounded border border-border/50 line-clamp-3">
                                {promptText}
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
