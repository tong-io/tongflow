import { Image as ImageIcon, MessageSquare } from "lucide-react";
import { useTranslations } from "next-intl";
import { memo } from "react";

import { useAbiForm } from "@/hooks/use-abi-form";
import { batchOn } from "@/lib/abi/sources";
import type { TongflowPluginNodeProps } from "@/types/tongflow-flow";

import { AbiNodeShell } from "../base/abi-node-shell";
import { NodeTextarea } from "../base/node-textarea";

const ImageGenTextNode = ({
    selected,
    data,
}: TongflowPluginNodeProps<"image-gen-text", "imageGenTextNode">) => {
    const t = useTranslations("Workspace.nodes");
    const form = useAbiForm("image-gen-text");
    const fileKeys = data.fileKeys ?? [];

    return (
        <AbiNodeShell
            feature="image-gen-text"
            sourceSpec={{ image: batchOn() }}
            form={form}
            selected={selected}
            className="min-w-[480px]"
            data={data}
            title={t("titles.imageGenText")}
            icon={<ImageIcon className="h-5 w-5" />}
            executeLabel={t("actions.describeImage")}
            executeDisabled={!fileKeys?.length}
        >
            <div className="p-4 space-y-4">
                <NodeTextarea
                    label={t("imageGenText.promptLabel")}
                    icon={MessageSquare}
                    placeholder={t("imageGenText.promptPlaceholder")}
                    {...form.bind("text")}
                    rows={3}
                />
            </div>
        </AbiNodeShell>
    );
};

ImageGenTextNode.displayName = "ImageGenTextNode";

export default memo(ImageGenTextNode);
