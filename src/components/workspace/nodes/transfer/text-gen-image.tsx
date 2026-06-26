import { Atom } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo, useCallback, useEffect, useMemo } from "react";

import {
    type AspectRatio,
    IMAGE_ASPECT_RATIOS,
    IMAGE_RESOLUTION_TIERS,
    type ResolutionTier,
} from "@/constants/media-options";
import { useAbiForm } from "@/hooks/use-abi-form";
import { batchOn } from "@/lib/abi/sources";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";
import { AbiNodeShell } from "../base/abi-node-shell";
import { AspectRatioPicker } from "../base/aspect-ratio-picker";
import { ResolutionPicker } from "../base/resolution-picker";

type TextGenImageNodeProps = TongflowPluginNodeProps<
    "image-gen",
    "textGenImageNode"
>;

// Default: 1:1 square at the 1K tier (1024 × 1024).
const DEFAULT_RATIO =
    IMAGE_ASPECT_RATIOS.find((r) => r.value === "1:1") ??
    IMAGE_ASPECT_RATIOS[0];
const DEFAULT_TIER = IMAGE_RESOLUTION_TIERS[0];

const TextGenImageNode = ({ selected, data }: TextGenImageNodeProps) => {
    const t = useTranslations("Workspace.nodes");
    const { texts = [] } = data;
    const form = useAbiForm("image-gen");

    const width =
        (form.state.width as number | undefined) ?? DEFAULT_RATIO.width;
    const height =
        (form.state.height as number | undefined) ?? DEFAULT_RATIO.height;

    // ABI stores only width/height. Recover the (aspect ratio, tier) pair from
    // the persisted size: width/height = ratio base dims × tier scale.
    const { ratio: currentRatio, tier: currentTier } = useMemo(() => {
        for (const tier of IMAGE_RESOLUTION_TIERS) {
            const ratio = IMAGE_ASPECT_RATIOS.find(
                (r) =>
                    r.width * tier.scale === width &&
                    r.height * tier.scale === height,
            );
            if (ratio) return { ratio, tier };
        }
        return { ratio: DEFAULT_RATIO, tier: DEFAULT_TIER };
    }, [width, height]);

    // Persist the displayed default so execution sends the same size the picker
    // shows (otherwise the plugin falls back to its own default resolution).
    useEffect(() => {
        if (form.state.width === undefined || form.state.height === undefined)
            form.patch({
                width: DEFAULT_RATIO.width * DEFAULT_TIER.scale,
                height: DEFAULT_RATIO.height * DEFAULT_TIER.scale,
            });
    }, [form.state.width, form.state.height, form.patch]);

    const applySize = useCallback(
        (ratio: AspectRatio, tier: ResolutionTier) => {
            form.patch({
                width: ratio.width * tier.scale,
                height: ratio.height * tier.scale,
            });
        },
        [form],
    );

    const handleSelectRatio = useCallback(
        (ratio: AspectRatio) => applySize(ratio, currentTier),
        [applySize, currentTier],
    );
    const handleSelectTier = useCallback(
        (tier: ResolutionTier) => applySize(currentRatio, tier),
        [applySize, currentRatio],
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
                    value={{ ...currentRatio, width, height }}
                    onChange={handleSelectRatio}
                    showSize
                />
                <ResolutionPicker
                    tiers={IMAGE_RESOLUTION_TIERS}
                    value={currentTier.value}
                    onChange={handleSelectTier}
                />
            </div>
        </AbiNodeShell>
    );
};

TextGenImageNode.displayName = "TextGenImageNode";

export default memo(TextGenImageNode);
