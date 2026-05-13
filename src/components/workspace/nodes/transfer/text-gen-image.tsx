import { Atom } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useCallback } from "react";

import {
    type AspectRatio,
    IMAGE_ASPECT_RATIOS,
} from "@/constants/media-options";
import { useAbiForm } from "@/hooks/use-abi-form";
import { batchOn } from "@/lib/abi/sources";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";
import { AbiNodeShell } from "../base/abi-node-shell";
import { AspectRatioPicker } from "../base/aspect-ratio-picker";

type TextGenImageNodeProps = TongflowPluginNodeProps<
    "image-gen",
    "textGenImageNode"
>;

const TextGenImageNode = ({ selected, data }: TextGenImageNodeProps) => {
    const t = useTranslations("Workspace.nodes");
    const { texts = [] } = data;
    const form = useAbiForm("image-gen");

    const width = (form.state.width as number | undefined) ?? 1024;
    const height = (form.state.height as number | undefined) ?? 1024;
    const currentRatio =
        IMAGE_ASPECT_RATIOS.find(
            (r) => r.width === width && r.height === height,
        ) ?? IMAGE_ASPECT_RATIOS[0];

    const handleSelectRatio = useCallback(
        (ratio: AspectRatio) => {
            form.patch({ width: ratio.width, height: ratio.height });
        },
        [form],
    );

    return (
        <AbiNodeShell
            feature="image-gen"
            sourceSpec={{
                text: batchOn({ nodeType: "textNode", path: "texts" }),
            }}
            form={form}
            selected={selected}
            className="min-w-[480px]"
            data={data}
            title={t("titles.textGenImage")}
            icon={<Atom className="h-5 w-5" />}
            executeLabel={t("actions.generateImage")}
            executeDisabled={!texts?.length}
        >
            <div className="p-4 space-y-4">
                <AspectRatioPicker
                    ratios={IMAGE_ASPECT_RATIOS}
                    value={currentRatio}
                    onChange={handleSelectRatio}
                    showSize
                />
            </div>
        </AbiNodeShell>
    );
};

TextGenImageNode.displayName = "TextGenImageNode";

export default memo(TextGenImageNode);
